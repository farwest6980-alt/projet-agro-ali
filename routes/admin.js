const express = require('express');
const { db } = require('../db');
const { pick, requireAuth, requireAdmin } = require('../lib/helpers');

const router = express.Router();
router.use('/admin', requireAuth, requireAdmin);

router.get('/admin', (req, res) => {
  const pendingSuppliers = db
    .prepare("SELECT * FROM users WHERE verification_status = 'en_attente' ORDER BY created_at")
    .all();
  const docs = db.prepare('SELECT * FROM verification_documents WHERE user_id = ? ORDER BY created_at DESC, id DESC');
  pendingSuppliers.forEach((u) => (u.documents = docs.all(u.id)));

  const pendingListings = db
    .prepare(
      `SELECT l.*, u.company, u.verification_status FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.status = 'en_moderation' ORDER BY l.created_at`
    )
    .all();
  const photos = db.prepare('SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY position, id');
  pendingListings.forEach((l) => {
    l.photos = photos.all(l.id);
    l.documents = JSON.parse(l.documents);
  });

  const reports = db
    .prepare(
      `SELECT r.*, rep.company AS reporter_company, tgt.company AS reported_company, tgt.id AS reported_id,
        tgt.verification_status AS reported_status
       FROM reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       LEFT JOIN users tgt ON tgt.id = r.reported_user_id
       WHERE r.status = 'ouvert' ORDER BY r.created_at DESC, r.id DESC`
    )
    .all();

  const members = db.prepare('SELECT * FROM users WHERE is_admin = 0 ORDER BY created_at DESC, id DESC').all();
  res.render('admin', { pendingSuppliers, pendingListings, reports, members });
});

router.post('/admin/membres/:id/statut', (req, res) => {
  const status = pick(req.body.status, ['verifie', 'refuse', 'suspendu', 'non_verifie']);
  const member = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (status && member) {
    db.prepare('UPDATE users SET verification_status = ? WHERE id = ?').run(status, member.id);
    const labels = { verifie: 'vérifié', refuse: 'refusé', suspendu: 'suspendu', non_verifie: 'réactivé (non vérifié)' };
    req.session.flash = { type: 'success', text: `${member.company} : ${labels[status]}.` };
  }
  res.redirect(req.body.back === 'membres' ? '/admin#membres' : '/admin');
});

router.post('/admin/annonces/:id/statut', (req, res) => {
  const status = pick(req.body.status, ['publiee', 'refusee']);
  if (status) {
    db.prepare("UPDATE listings SET status = ? WHERE id = ? AND status = 'en_moderation'").run(status, req.params.id);
    req.session.flash = { type: 'success', text: status === 'publiee' ? 'Annonce publiée.' : 'Annonce refusée.' };
  }
  res.redirect('/admin#annonces');
});

router.post('/admin/signalements/:id/traiter', (req, res) => {
  db.prepare("UPDATE reports SET status = 'traite' WHERE id = ?").run(req.params.id);
  req.session.flash = { type: 'success', text: 'Signalement marqué comme traité.' };
  res.redirect('/admin#signalements');
});

// Un administrateur peut lire une conversation signalée.
router.get('/admin/conversations/:id', (req, res) => {
  const conv = db
    .prepare(
      `SELECT c.*, a.company AS a_company, b.company AS b_company FROM conversations c
       JOIN users a ON a.id = c.user_a JOIN users b ON b.id = c.user_b WHERE c.id = ?`
    )
    .get(req.params.id);
  if (!conv) return res.status(404).render('error', { message: 'Conversation introuvable.' });
  const messages = db
    .prepare(
      `SELECT m.*, u.company, q.product, q.quantity, q.price, q.incoterm, q.valid_until, q.status AS q_status
       FROM messages m JOIN users u ON u.id = m.sender_id LEFT JOIN quotes q ON q.id = m.quote_id
       WHERE m.conversation_id = ? ORDER BY m.id`
    )
    .all(conv.id);
  res.render('admin-conversation', { conv, messages });
});

module.exports = router;
