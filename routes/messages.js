const express = require('express');
const { db, INCOTERMS } = require('../db');
const { clean, pick, safeNext, requireAuth } = require('../lib/helpers');
const { detectSensitive } = require('../lib/scam');
const { pushTo } = require('../lib/realtime');

const router = express.Router();

// ---------- Requêtes ----------

const conversationsFor = db.prepare(`
  SELECT c.*,
    u.id AS other_id, u.company AS other_company, u.logo AS other_logo, u.verification_status AS other_status,
    l.title AS listing_title,
    (SELECT CASE WHEN m.type = 'devis' THEN 'Devis : ' || q.product ELSE m.body END
       FROM messages m LEFT JOIN quotes q ON q.id = m.quote_id
       WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != :me AND read_at IS NULL) AS unread
  FROM conversations c
  JOIN users u ON u.id = CASE WHEN c.user_a = :me THEN c.user_b ELSE c.user_a END
  LEFT JOIN listings l ON l.id = c.listing_id
  WHERE c.user_a = :me OR c.user_b = :me
  ORDER BY c.updated_at DESC, c.id DESC
`);

const messageWithQuote = `
  SELECT m.*, q.id AS q_id, q.sender_id AS q_sender_id, q.parent_id AS q_parent_id, q.product AS q_product,
    q.quantity AS q_quantity, q.price AS q_price, q.incoterm AS q_incoterm, q.valid_until AS q_valid_until,
    q.status AS q_status
  FROM messages m LEFT JOIN quotes q ON q.id = m.quote_id`;

const expireQuotes = db.prepare("UPDATE quotes SET status = 'expire' WHERE status = 'envoye' AND valid_until < date('now')");
const hasAcceptedQuote = db.prepare("SELECT 1 FROM quotes WHERE conversation_id = ? AND status = 'accepte' LIMIT 1");
const markRead = db.prepare(
  "UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL"
);
const countUnread = db.prepare(`
  SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
  WHERE (c.user_a = :me OR c.user_b = :me) AND m.sender_id != :me AND m.read_at IS NULL
`);

function loadConversation(id, userId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || (conv.user_a !== userId && conv.user_b !== userId)) return null;
  return conv;
}

const otherId = (conv, userId) => (conv.user_a === userId ? conv.user_b : conv.user_a);

// ---------- Rendu et diffusion temps réel ----------

function renderMessage(app, message, viewer) {
  return new Promise((resolve, reject) =>
    app.render('partials/message', { m: message, viewer }, (err, html) => (err ? reject(err) : resolve(html)))
  );
}

async function broadcast(req, conv, messageId, event = 'message') {
  const message = db.prepare(`${messageWithQuote} WHERE m.id = ?`).get(messageId);
  const preview = message.type === 'devis' ? `Devis : ${message.q_product}` : message.body;
  for (const userId of [conv.user_a, conv.user_b]) {
    const viewer = userId === req.user.id ? req.user : db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const html = await renderMessage(req.app, message, viewer);
    pushTo(userId, event, { id: message.id, conversation_id: conv.id, sender_id: message.sender_id, preview, html });
  }
  return message;
}

function touch(conv) {
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conv.id);
}

// Bloque les coordonnées bancaires / téléphone tant qu'aucun devis n'est accepté, et crée un signalement automatique.
function blockSensitive(req, res, conv, text) {
  if (hasAcceptedQuote.get(conv.id)) return false;
  const found = detectSensitive(text);
  if (!found.length) return false;
  db.prepare(
    `INSERT INTO reports (reporter_id, reported_user_id, conversation_id, auto, reason, details)
     VALUES (NULL, ?, ?, 1, ?, ?)`
  ).run(req.user.id, conv.id, `Coordonnées hors plateforme (${found.join(', ')})`, `Message bloqué : « ${text.slice(0, 500)} »`);
  res.status(422).json({
    blocked: true,
    error: `Message bloqué : il contient un ${found.join(' / ')}. Pour votre sécurité, l'échange de coordonnées bancaires ou téléphoniques n'est possible qu'après acceptation d'un devis. Ne payez jamais en dehors de la plateforme.`,
  });
  return true;
}

// ---------- Pages ----------

router.get('/messages', requireAuth, (req, res) => {
  const conversations = conversationsFor.all({ me: req.user.id });
  res.render('messages', { conversations, active: null, messages: [], other: null });
});

router.post('/messages/nouveau', requireAuth, (req, res) => {
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.body.to));
  if (!other || other.id === req.user.id || other.verification_status === 'suspendu') {
    req.session.flash = { type: 'error', text: 'Destinataire invalide.' };
    return res.redirect(safeNext(req.get('Referer')?.replace(/^https?:\/\/[^/]+/, '')));
  }
  const listingId = req.body.listing_id ? Number(req.body.listing_id) : null;
  const [a, b] = [req.user.id, other.id].sort((x, y) => x - y);
  let conv = db.prepare('SELECT id FROM conversations WHERE user_a = ? AND user_b = ? AND listing_id IS ?').get(a, b, listingId);
  if (!conv) {
    const { lastInsertRowid } = db.prepare('INSERT INTO conversations (user_a, user_b, listing_id) VALUES (?, ?, ?)').run(a, b, listingId);
    conv = { id: Number(lastInsertRowid) };
  }
  res.redirect(`/messages/${conv.id}`);
});

router.get('/messages/:id', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).render('error', { message: 'Conversation introuvable.' });
  expireQuotes.run();
  markRead.run(conv.id, req.user.id);
  res.locals.unread = countUnread.get({ me: req.user.id }).n;
  const conversations = conversationsFor.all({ me: req.user.id });
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId(conv, req.user.id));
  const listing = conv.listing_id ? db.prepare('SELECT id, title FROM listings WHERE id = ?').get(conv.listing_id) : null;
  const messages = db.prepare(`${messageWithQuote} WHERE m.conversation_id = ? ORDER BY m.id`).all(conv.id);
  const defaultValidity = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  res.render('messages', { conversations, active: { ...conv, listing }, messages, other, defaultValidity });
});

router.post('/messages/:id/signaler', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).render('error', { message: 'Conversation introuvable.' });
  const reason = pick(req.body.reason, ['Arnaque ou fraude', 'Demande de paiement hors plateforme', 'Produit non conforme', 'Comportement inapproprié', 'Autre']);
  db.prepare(
    'INSERT INTO reports (reporter_id, reported_user_id, conversation_id, reason, details) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, otherId(conv, req.user.id), conv.id, reason || 'Autre', clean(req.body.details, 1000));
  req.session.flash = { type: 'success', text: 'Merci, votre signalement a été transmis à notre équipe de modération.' };
  res.redirect(`/messages/${conv.id}`);
});

// ---------- API messages ----------

function participantCheck(req, res) {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) {
    res.status(404).json({ error: 'Conversation introuvable' });
    return null;
  }
  const other = db.prepare('SELECT verification_status FROM users WHERE id = ?').get(otherId(conv, req.user.id));
  if (other?.verification_status === 'suspendu') {
    res.status(403).json({ error: 'Ce membre est suspendu, vous ne pouvez plus lui écrire.' });
    return null;
  }
  return conv;
}

router.post('/api/messages/:id', requireAuth, async (req, res) => {
  const conv = participantCheck(req, res);
  if (!conv) return;
  const body = clean(req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Message vide' });
  if (blockSensitive(req, res, conv, body)) return;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO messages (conversation_id, sender_id, type, body) VALUES (?, ?, 'texte', ?)")
    .run(conv.id, req.user.id, body);
  touch(conv);
  const message = await broadcast(req, conv, Number(lastInsertRowid));
  res.json({ id: message.id });
});

router.post('/api/messages/:id/lu', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
  markRead.run(conv.id, req.user.id);
  res.json({ unread: countUnread.get({ me: req.user.id }).n });
});

// ---------- API devis ----------

function readQuote(body) {
  const q = {
    product: clean(body.product, 150),
    quantity: clean(body.quantity, 100),
    price: clean(body.price, 100),
    incoterm: pick(body.incoterm, INCOTERMS),
    valid_until: clean(body.valid_until, 10),
  };
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  if (!q.product || !q.quantity || !q.price || !q.incoterm) return { error: 'Produit, quantité, prix et incoterm sont obligatoires.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.valid_until) || q.valid_until < today || q.valid_until > max) {
    return { error: "La date de validité doit être comprise entre aujourd'hui et dans un an." };
  }
  return { quote: q };
}

async function createQuote(req, res, conv, parentId) {
  const { quote, error } = readQuote(req.body);
  if (error) return res.status(400).json({ error });
  if (blockSensitive(req, res, conv, Object.values(quote).join(' '))) return;
  const quoteId = Number(
    db
      .prepare(
        `INSERT INTO quotes (conversation_id, sender_id, parent_id, product, quantity, price, incoterm, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(conv.id, req.user.id, parentId, quote.product, quote.quantity, quote.price, quote.incoterm, quote.valid_until).lastInsertRowid
  );
  const { lastInsertRowid } = db
    .prepare("INSERT INTO messages (conversation_id, sender_id, type, quote_id) VALUES (?, ?, 'devis', ?)")
    .run(conv.id, req.user.id, quoteId);
  touch(conv);
  const message = await broadcast(req, conv, Number(lastInsertRowid));
  res.json({ id: message.id });
}

router.post('/api/conversations/:id/devis', requireAuth, async (req, res) => {
  const conv = participantCheck(req, res);
  if (!conv) return;
  if (req.user.role !== 'fournisseur') return res.status(403).json({ error: 'Seuls les fournisseurs peuvent émettre un devis.' });
  await createQuote(req, res, conv, null);
});

// Charge un devis en attente adressé à l'utilisateur courant (il ne peut pas répondre à son propre devis).
function pendingQuoteFor(req, res) {
  expireQuotes.run();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(Number(req.params.id));
  const conv = quote && loadConversation(quote.conversation_id, req.user.id);
  if (!conv) {
    res.status(404).json({ error: 'Devis introuvable' });
    return [];
  }
  if (quote.sender_id === req.user.id) {
    res.status(403).json({ error: 'Vous ne pouvez pas répondre à votre propre devis.' });
    return [];
  }
  if (quote.status !== 'envoye') {
    res.status(409).json({ error: quote.status === 'expire' ? 'Ce devis a expiré.' : 'Ce devis a déjà reçu une réponse.' });
    return [];
  }
  return [quote, conv];
}

async function setQuoteStatus(req, quote, conv, status) {
  db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, quote.id);
  const messageId = db.prepare('SELECT id FROM messages WHERE quote_id = ?').get(quote.id).id;
  touch(conv);
  await broadcast(req, conv, messageId, 'update');
}

router.post('/api/quotes/:id/accepter', requireAuth, async (req, res) => {
  const [quote, conv] = pendingQuoteFor(req, res);
  if (!quote) return;
  await setQuoteStatus(req, quote, conv, 'accepte');
  res.json({ ok: true });
});

router.post('/api/quotes/:id/refuser', requireAuth, async (req, res) => {
  const [quote, conv] = pendingQuoteFor(req, res);
  if (!quote) return;
  await setQuoteStatus(req, quote, conv, 'refuse');
  res.json({ ok: true });
});

router.post('/api/quotes/:id/negocier', requireAuth, async (req, res) => {
  const [quote, conv] = pendingQuoteFor(req, res);
  if (!quote) return;
  const { quote: counter, error } = readQuote(req.body);
  if (error) return res.status(400).json({ error });
  if (blockSensitive(req, res, conv, Object.values(counter).join(' '))) return;
  await setQuoteStatus(req, quote, conv, 'negocie');
  await createQuote(req, res, conv, quote.id);
});

module.exports = router;
