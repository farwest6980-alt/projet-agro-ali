const path = require('node:path');
const express = require('express');
const { db } = require('../db');
const { DIRS } = require('../lib/uploads');
const { requireAuth } = require('../lib/helpers');

const router = express.Router();

// Photos d'annonces : visibles publiquement seulement si l'annonce est publiée.
router.get('/media/listings/:file', (req, res) => {
  const match = /^([a-f0-9]{32})(_thumb)?\.webp$/.exec(req.params.file);
  if (!match) return res.sendStatus(404);
  const photo = db
    .prepare(
      `SELECT l.status, l.user_id, u.verification_status FROM listing_photos p
       JOIN listings l ON l.id = p.listing_id JOIN users u ON u.id = l.user_id WHERE p.filename = ?`
    )
    .get(match[1]);
  if (!photo) return res.sendStatus(404);
  const isPublic = photo.status === 'publiee' && photo.verification_status !== 'suspendu';
  if (!isPublic && req.user?.id !== photo.user_id && !req.user?.is_admin) return res.sendStatus(404);
  res.set('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, no-store');
  res.sendFile(path.join(DIRS.listings, req.params.file));
});

router.get('/media/logos/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.webp$/.test(req.params.file)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(DIRS.logos, req.params.file), (err) => err && !res.headersSent && res.sendStatus(404));
});

// Documents de vérification : uniquement leur propriétaire et les administrateurs.
router.get('/documents/:id', requireAuth, (req, res) => {
  const doc = db.prepare('SELECT * FROM verification_documents WHERE id = ?').get(req.params.id);
  if (!doc || (doc.user_id !== req.user.id && !req.user.is_admin)) return res.sendStatus(404);
  res.set({
    'Content-Type': doc.mime,
    'Content-Disposition': `inline; filename="document-${doc.id}.${doc.mime === 'application/pdf' ? 'pdf' : 'jpg'}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(path.join(DIRS.verification, doc.filename));
});

module.exports = router;
