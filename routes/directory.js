const express = require('express');
const { db, CATEGORIES, COUNTRIES } = require('../db');
const { clean, pick } = require('../lib/helpers');
const { listingCardSelect } = require('../lib/queries');

const router = express.Router();

router.get('/', (req, res) => {
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'fournisseur' AND verification_status != 'suspendu') AS suppliers,
        (SELECT COUNT(*) FROM users WHERE role = 'fournisseur' AND verification_status = 'verifie') AS verified,
        (SELECT COUNT(*) FROM users WHERE role = 'acheteur' AND verification_status != 'suspendu') AS buyers,
        (SELECT COUNT(*) FROM listings l JOIN users u ON u.id = l.user_id
          WHERE l.status = 'publiee' AND u.verification_status != 'suspendu') AS listings`
    )
    .get();
  const listings = db.prepare(`${listingCardSelect} ORDER BY l.created_at DESC, l.id DESC LIMIT 6`).all();
  const suppliers = db
    .prepare(
      `SELECT * FROM users WHERE role = 'fournisseur' AND verification_status != 'suspendu'
       ORDER BY verification_status = 'verifie' DESC, created_at DESC, id DESC LIMIT 6`
    )
    .all();
  res.render('home', { stats, listings, suppliers });
});

router.get('/fournisseurs', (req, res) => {
  const filters = {
    q: clean(req.query.q, 100),
    categorie: pick(req.query.categorie, CATEGORIES),
    pays: pick(req.query.pays, COUNTRIES),
    verifie: req.query.verifie === '1',
  };
  const where = ["role = 'fournisseur'", "verification_status != 'suspendu'"];
  const params = [];
  if (filters.q) {
    where.push('(company LIKE ? OR description LIKE ? OR city LIKE ? OR certifications LIKE ?)');
    params.push(...Array(4).fill(`%${filters.q}%`));
  }
  if (filters.categorie) {
    where.push('category = ?');
    params.push(filters.categorie);
  }
  if (filters.pays) {
    where.push('country = ?');
    params.push(filters.pays);
  }
  if (filters.verifie) where.push("verification_status = 'verifie'");
  const suppliers = db
    .prepare(
      `SELECT * FROM users WHERE ${where.join(' AND ')}
       ORDER BY verification_status = 'verifie' DESC, company COLLATE NOCASE`
    )
    .all(...params);
  res.render('suppliers', { suppliers, filters });
});

router.get('/fournisseurs/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!member || (member.verification_status === 'suspendu' && !req.user?.is_admin)) {
    return res.status(404).render('error', { message: 'Profil introuvable.' });
  }
  const listings = db.prepare(`${listingCardSelect} AND l.user_id = ? ORDER BY l.created_at DESC, l.id DESC`).all(member.id);
  res.render('supplier', { member, listings });
});

module.exports = router;
