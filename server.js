const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { db, CATEGORIES, REGIONS, hashPassword, verifyPassword } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// ---------- Helpers ----------

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const countUnread = db.prepare(`
  SELECT COUNT(*) AS n FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE (c.user_a = ? OR c.user_b = ?) AND m.sender_id != ? AND m.read_at IS NULL
`);

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : '';
}

app.use((req, res, next) => {
  const user = req.session.userId ? getUser.get(req.session.userId) : null;
  if (req.session.userId && !user) delete req.session.userId;
  req.user = user || null;
  res.locals.user = req.user;
  res.locals.unread = user ? countUnread.get(user.id, user.id, user.id).n : 0;
  res.locals.CATEGORIES = CATEGORIES;
  res.locals.REGIONS = REGIONS;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.formatDate = (iso) =>
    new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  next();
});

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non connecté' });
  req.session.flash = { type: 'info', text: 'Connectez-vous pour accéder à cette page.' };
  res.redirect(`/connexion?next=${encodeURIComponent(req.originalUrl)}`);
}

function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

// ---------- Temps réel (Server-Sent Events) ----------

const streams = new Map(); // userId -> Set<res>

function pushTo(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

app.get('/api/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const id = req.user.id;
  if (!streams.has(id)) streams.set(id, new Set());
  streams.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(id)?.delete(res);
    if (streams.get(id)?.size === 0) streams.delete(id);
  });
});

// ---------- Accueil ----------

app.get('/', (req, res) => {
  const stats = {
    suppliers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'fournisseur'").get().n,
    buyers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'acheteur'").get().n,
    listings: db.prepare('SELECT COUNT(*) AS n FROM listings WHERE active = 1').get().n,
  };
  const listings = db
    .prepare(
      `SELECT l.*, u.company FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.active = 1 ORDER BY l.created_at DESC, l.id DESC LIMIT 6`
    )
    .all();
  const suppliers = db
    .prepare("SELECT * FROM users WHERE role = 'fournisseur' ORDER BY created_at DESC, id DESC LIMIT 6")
    .all();
  res.render('home', { stats, listings, suppliers });
});

// ---------- Annuaire fournisseurs ----------

app.get('/fournisseurs', (req, res) => {
  const q = clean(req.query.q, 100);
  const categorie = pick(req.query.categorie, CATEGORIES);
  const region = pick(req.query.region, REGIONS);
  const where = ["role = 'fournisseur'"];
  const params = [];
  if (q) {
    where.push('(company LIKE ? OR description LIKE ? OR city LIKE ? OR certifications LIKE ?)');
    params.push(...Array(4).fill(`%${q}%`));
  }
  if (categorie) {
    where.push('category = ?');
    params.push(categorie);
  }
  if (region) {
    where.push('region = ?');
    params.push(region);
  }
  const suppliers = db
    .prepare(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY company COLLATE NOCASE`)
    .all(...params);
  res.render('suppliers', { suppliers, filters: { q, categorie, region } });
});

app.get('/fournisseurs/:id', (req, res) => {
  const supplier = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).render('error', { message: 'Profil introuvable.' });
  const listings = db
    .prepare('SELECT * FROM listings WHERE user_id = ? AND active = 1 ORDER BY created_at DESC, id DESC')
    .all(supplier.id);
  res.render('supplier', { supplier, listings });
});

// ---------- Annonces ----------

app.get('/annonces', (req, res) => {
  const q = clean(req.query.q, 100);
  const type = pick(req.query.type, ['offre', 'demande']);
  const categorie = pick(req.query.categorie, CATEGORIES);
  const region = pick(req.query.region, REGIONS);
  const where = ['l.active = 1'];
  const params = [];
  if (q) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR u.company LIKE ?)');
    params.push(...Array(3).fill(`%${q}%`));
  }
  if (type) {
    where.push('l.type = ?');
    params.push(type);
  }
  if (categorie) {
    where.push('l.category = ?');
    params.push(categorie);
  }
  if (region) {
    where.push('l.region = ?');
    params.push(region);
  }
  const listings = db
    .prepare(
      `SELECT l.*, u.company, u.role FROM listings l JOIN users u ON u.id = l.user_id
       WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC`
    )
    .all(...params);
  res.render('listings', { listings, filters: { q, type, categorie, region } });
});

app.get('/annonces/nouvelle', requireAuth, (req, res) => {
  res.render('listing-form', { values: { type: req.user.role === 'acheteur' ? 'demande' : 'offre', region: req.user.region, category: req.user.category }, error: null });
});

app.post('/annonces', requireAuth, (req, res) => {
  const values = {
    type: pick(req.body.type, ['offre', 'demande']),
    title: clean(req.body.title, 120),
    description: clean(req.body.description, 3000),
    category: pick(req.body.category, CATEGORIES),
    quantity: clean(req.body.quantity, 100),
    price: clean(req.body.price, 100),
    region: pick(req.body.region, REGIONS),
  };
  if (!values.type || !values.title || !values.description || !values.category) {
    return res.status(400).render('listing-form', { values, error: 'Merci de remplir le type, le titre, la catégorie et la description.' });
  }
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO listings (user_id, type, title, description, category, quantity, price, region)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, values.type, values.title, values.description, values.category, values.quantity, values.price, values.region);
  req.session.flash = { type: 'success', text: 'Annonce publiée !' };
  res.redirect(`/annonces/${lastInsertRowid}`);
});

app.get('/annonces/:id', (req, res) => {
  const listing = db
    .prepare(
      `SELECT l.*, u.company, u.role, u.city, u.region AS user_region, u.id AS owner_id
       FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`
    )
    .get(req.params.id);
  if (!listing || (!listing.active && listing.owner_id !== req.user?.id)) {
    return res.status(404).render('error', { message: 'Annonce introuvable.' });
  }
  res.render('listing', { listing });
});

app.post('/annonces/:id/cloturer', requireAuth, (req, res) => {
  db.prepare('UPDATE listings SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  req.session.flash = { type: 'success', text: 'Annonce clôturée.' };
  res.redirect('/profil');
});

// ---------- Comptes ----------

app.get('/inscription', (req, res) => {
  res.render('register', { values: { role: req.query.role === 'acheteur' ? 'acheteur' : 'fournisseur' }, error: null });
});

app.post('/inscription', (req, res) => {
  const values = {
    role: pick(req.body.role, ['fournisseur', 'acheteur']),
    name: clean(req.body.name, 100),
    company: clean(req.body.company, 120),
    email: clean(req.body.email, 200).toLowerCase(),
    category: pick(req.body.category, CATEGORIES),
    region: pick(req.body.region, REGIONS),
    city: clean(req.body.city, 100),
  };
  const password = String(req.body.password || '');
  let error = null;
  if (!values.role || !values.name || !values.company || !values.email) error = 'Merci de remplir tous les champs obligatoires.';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) error = 'Adresse e-mail invalide.';
  else if (password.length < 8) error = 'Le mot de passe doit faire au moins 8 caractères.';
  else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) error = 'Un compte existe déjà avec cet e-mail.';
  if (error) return res.status(400).render('register', { values, error });

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, name, company, category, region, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(values.email, hashPassword(password), values.role, values.name, values.company, values.category, values.region, values.city);
  req.session.regenerate(() => {
    req.session.userId = Number(lastInsertRowid);
    req.session.flash = { type: 'success', text: 'Bienvenue ! Complétez votre profil pour être mieux référencé.' };
    res.redirect('/profil');
  });
});

app.get('/connexion', (req, res) => {
  res.render('login', { error: null, email: '', next: safeNext(req.query.next) });
});

app.post('/connexion', (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const next = safeNext(req.body.next);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).render('login', { error: 'E-mail ou mot de passe incorrect.', email, next });
  }
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.redirect(next);
  });
});

app.post('/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/profil', requireAuth, (req, res) => {
  const listings = db
    .prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY active DESC, created_at DESC, id DESC')
    .all(req.user.id);
  res.render('profile', { listings });
});

app.post('/profil', requireAuth, (req, res) => {
  const v = {
    name: clean(req.body.name, 100) || req.user.name,
    company: clean(req.body.company, 120) || req.user.company,
    description: clean(req.body.description, 3000),
    category: pick(req.body.category, CATEGORIES),
    region: pick(req.body.region, REGIONS),
    city: clean(req.body.city, 100),
    certifications: clean(req.body.certifications, 300),
    phone: clean(req.body.phone, 40),
    website: /^https?:\/\//i.test(clean(req.body.website, 200)) ? clean(req.body.website, 200) : '',
  };
  db.prepare(
    `UPDATE users SET name = ?, company = ?, description = ?, category = ?, region = ?, city = ?,
     certifications = ?, phone = ?, website = ? WHERE id = ?`
  ).run(v.name, v.company, v.description, v.category, v.region, v.city, v.certifications, v.phone, v.website, req.user.id);
  req.session.flash = { type: 'success', text: 'Profil mis à jour.' };
  res.redirect('/profil');
});

// ---------- Messagerie ----------

const conversationsFor = db.prepare(`
  SELECT c.*,
    CASE WHEN c.user_a = :me THEN c.user_b ELSE c.user_a END AS other_id,
    u.company AS other_company, u.name AS other_name, u.role AS other_role,
    l.title AS listing_title,
    (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != :me AND read_at IS NULL) AS unread
  FROM conversations c
  JOIN users u ON u.id = CASE WHEN c.user_a = :me THEN c.user_b ELSE c.user_a END
  LEFT JOIN listings l ON l.id = c.listing_id
  WHERE c.user_a = :me OR c.user_b = :me
  ORDER BY c.updated_at DESC, c.id DESC
`);

function loadConversation(id, userId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || (conv.user_a !== userId && conv.user_b !== userId)) return null;
  return conv;
}

app.get('/messages', requireAuth, (req, res) => {
  const conversations = conversationsFor.all({ me: req.user.id });
  res.render('messages', { conversations, active: null, messages: [], other: null });
});

app.post('/messages/nouveau', requireAuth, (req, res) => {
  const otherId = Number(req.body.to);
  const listingId = req.body.listing_id ? Number(req.body.listing_id) : null;
  const other = getUser.get(otherId);
  if (!other || other.id === req.user.id) {
    req.session.flash = { type: 'error', text: 'Destinataire invalide.' };
    return res.redirect(safeNext(req.get('Referer')?.replace(/^https?:\/\/[^/]+/, '')));
  }
  const [a, b] = [req.user.id, other.id].sort((x, y) => x - y);
  let conv = db
    .prepare('SELECT id FROM conversations WHERE user_a = ? AND user_b = ? AND listing_id IS ?')
    .get(a, b, listingId);
  if (!conv) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO conversations (user_a, user_b, listing_id) VALUES (?, ?, ?)')
      .run(a, b, listingId);
    conv = { id: Number(lastInsertRowid) };
  }
  res.redirect(`/messages/${conv.id}`);
});

app.get('/messages/:id', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).render('error', { message: 'Conversation introuvable.' });
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(conv.id, req.user.id);
  res.locals.unread = countUnread.get(req.user.id, req.user.id, req.user.id).n;
  const conversations = conversationsFor.all({ me: req.user.id });
  const other = getUser.get(conv.user_a === req.user.id ? conv.user_b : conv.user_a);
  const listing = conv.listing_id ? db.prepare('SELECT id, title FROM listings WHERE id = ?').get(conv.listing_id) : null;
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(conv.id);
  res.render('messages', { conversations, active: { ...conv, listing }, messages, other });
});

app.post('/api/messages/:id', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
  const body = clean(req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Message vide' });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)')
    .run(conv.id, req.user.id, body);
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conv.id);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid);
  const payload = { ...message, sender_company: req.user.company };
  pushTo(conv.user_a, 'message', payload);
  if (conv.user_b !== conv.user_a) pushTo(conv.user_b, 'message', payload);
  res.json(message);
});

app.post('/api/messages/:id/lu', requireAuth, (req, res) => {
  const conv = loadConversation(Number(req.params.id), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(conv.id, req.user.id);
  res.json({ unread: countUnread.get(req.user.id, req.user.id, req.user.id).n });
});

// ---------- 404 ----------

app.use((req, res) => res.status(404).render('error', { message: 'Page introuvable.' }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`AgroLink en ligne sur http://localhost:${PORT}`));
}

module.exports = app;
