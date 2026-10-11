const express = require('express');
const { db, CATEGORIES, COUNTRIES, INCOTERMS, DOCUMENTS } = require('../db');
const { clean, pick, requireAuth } = require('../lib/helpers');
const { listingCardSelect } = require('../lib/queries');
const { photosUpload, checkImage, saveListingPhoto } = require('../lib/uploads');

const router = express.Router();

router.get('/annonces', (req, res) => {
  const filters = {
    q: clean(req.query.q, 100),
    type: pick(req.query.type, ['offre', 'demande']),
    categorie: pick(req.query.categorie, CATEGORIES),
    pays: pick(req.query.pays, COUNTRIES),
    verifie: req.query.verifie === '1',
  };
  const where = [];
  const params = [];
  if (filters.q) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR u.company LIKE ?)');
    params.push(...Array(3).fill(`%${filters.q}%`));
  }
  if (filters.type) {
    where.push('l.type = ?');
    params.push(filters.type);
  }
  if (filters.categorie) {
    where.push('l.category = ?');
    params.push(filters.categorie);
  }
  if (filters.pays) {
    where.push('l.country = ?');
    params.push(filters.pays);
  }
  if (filters.verifie) where.push("u.verification_status = 'verifie'");
  const listings = db
    .prepare(`${listingCardSelect} ${where.map((w) => `AND ${w}`).join(' ')} ORDER BY l.created_at DESC, l.id DESC`)
    .all(...params);
  res.render('listings', { listings, filters });
});

function defaultValues(user) {
  return {
    type: user.role === 'acheteur' ? 'demande' : 'offre',
    country: user.country,
    category: user.category,
    documents: [],
  };
}

router.get('/annonces/nouvelle', requireAuth, (req, res) => {
  res.render('listing-form', { values: defaultValues(req.user), error: null });
});

router.post('/annonces', requireAuth, photosUpload, async (req, res) => {
  const documents = [].concat(req.body.documents || []).filter((d) => d in DOCUMENTS);
  const values = {
    type: pick(req.body.type, ['offre', 'demande']),
    title: clean(req.body.title, 120),
    description: clean(req.body.description, 3000),
    category: pick(req.body.category, CATEGORIES),
    quantity: clean(req.body.quantity, 100),
    price: clean(req.body.price, 100),
    country: pick(req.body.country, COUNTRIES),
    incoterm: pick(req.body.incoterm, INCOTERMS),
    packaging: clean(req.body.packaging, 150),
    documents,
  };
  const files = req.files || [];
  const fail = (error) => res.status(400).render('listing-form', { values, error, photosLost: files.length > 0 });

  if (req.uploadError) return fail(req.uploadError);
  if (!values.type || !values.title || !values.description || !values.category) {
    return fail('Merci de remplir le type, le titre, la catégorie et la description.');
  }
  try {
    for (const file of files) await checkImage(file);
  } catch (err) {
    return fail(err.message);
  }

  const status = req.user.is_admin ? 'publiee' : 'en_moderation';
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO listings (user_id, type, title, description, category, quantity, price, country, incoterm, packaging, documents, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, values.type, values.title, values.description, values.category, values.quantity, values.price,
      values.country, values.incoterm, values.packaging, JSON.stringify(documents), status);
  const insertPhoto = db.prepare('INSERT INTO listing_photos (listing_id, filename, position) VALUES (?, ?, ?)');
  for (const [position, file] of files.entries()) {
    insertPhoto.run(lastInsertRowid, await saveListingPhoto(file.buffer), position);
  }
  req.session.flash =
    status === 'publiee'
      ? { type: 'success', text: 'Annonce publiée.' }
      : { type: 'success', text: 'Annonce envoyée ! Elle sera visible dès sa validation par notre équipe.' };
  res.redirect(`/annonces/${lastInsertRowid}`);
});

router.get('/annonces/:id', (req, res) => {
  const listing = db
    .prepare(
      `SELECT l.*, u.company, u.logo, u.role AS owner_role, u.city, u.country AS owner_country,
        u.verification_status, u.id AS owner_id
       FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`
    )
    .get(req.params.id);
  const isPublic = listing && listing.status === 'publiee' && listing.verification_status !== 'suspendu';
  const canSee = listing && (isPublic || listing.owner_id === req.user?.id || req.user?.is_admin);
  if (!canSee) return res.status(404).render('error', { message: 'Annonce introuvable.' });
  listing.documents = JSON.parse(listing.documents);
  const photos = db.prepare('SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY position, id').all(listing.id);
  res.render('listing', { listing, photos });
});

router.post('/annonces/:id/cloturer', requireAuth, (req, res) => {
  db.prepare("UPDATE listings SET status = 'cloturee' WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  req.session.flash = { type: 'success', text: 'Annonce clôturée.' };
  res.redirect('/profil');
});

module.exports = router;
