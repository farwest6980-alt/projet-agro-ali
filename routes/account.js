const express = require('express');
const { db, CATEGORIES, COUNTRIES, VERIFICATION_DOCS, hashPassword, verifyPassword } = require('../db');
const { clean, pick, safeNext, requireAuth } = require('../lib/helpers');
const { logoUpload, docsUpload, checkImage, saveLogo, removeLogo, saveVerificationDoc } = require('../lib/uploads');

const router = express.Router();

// ---------- Limitation des tentatives de connexion ----------
// 5 échecs pour un couple (IP, e-mail), ou 20 échecs pour un même e-mail toutes IP confondues → 15 min de blocage.

const LOCK_MS = 15 * 60 * 1000;
const getAttempt = db.prepare('SELECT * FROM login_attempts WHERE key = ?');

function lockedFor(keys) {
  const now = Date.now();
  const until = Math.max(0, ...keys.map(([key]) => getAttempt.get(key)?.locked_until || 0));
  return until > now ? until - now : 0;
}

function recordFailure(keys) {
  for (const [key, limit] of keys) {
    const row = getAttempt.get(key);
    const failures = (row && !(row.locked_until > Date.now()) ? row.failures : 0) + 1;
    const lockedUntil = failures >= limit ? Date.now() + LOCK_MS : null;
    db.prepare(
      `INSERT INTO login_attempts (key, failures, locked_until) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`
    ).run(key, lockedUntil ? 0 : failures, lockedUntil);
  }
}

// ---------- Inscription / connexion ----------

router.get('/inscription', (req, res) => {
  res.render('register', { values: { role: req.query.role === 'acheteur' ? 'acheteur' : 'fournisseur' }, error: null });
});

router.post('/inscription', (req, res) => {
  const values = {
    role: pick(req.body.role, ['fournisseur', 'acheteur']),
    name: clean(req.body.name, 100),
    company: clean(req.body.company, 120),
    email: clean(req.body.email, 200).toLowerCase(),
    category: pick(req.body.category, CATEGORIES),
    country: pick(req.body.country, COUNTRIES),
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
      `INSERT INTO users (email, password_hash, role, name, company, category, country, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(values.email, hashPassword(password), values.role, values.name, values.company, values.category, values.country, values.city);
  req.session.regenerate(() => {
    req.session.userId = Number(lastInsertRowid);
    req.session.flash = {
      type: 'success',
      text:
        values.role === 'fournisseur'
          ? 'Bienvenue ! Complétez votre profil puis faites vérifier votre entreprise pour obtenir le badge « Vérifié ».'
          : 'Bienvenue ! Complétez votre profil pour être mieux identifié par les fournisseurs.',
    };
    res.redirect('/profil');
  });
});

router.get('/connexion', (req, res) => {
  res.render('login', { error: null, email: '', next: safeNext(req.query.next) });
});

router.post('/connexion', (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const next = safeNext(req.body.next);
  const keys = [[`ip:${req.ip}|${email}`, 5], [`email:${email}`, 20]];

  const wait = lockedFor(keys);
  if (wait) {
    const minutes = Math.ceil(wait / 60000);
    return res.status(429).render('login', {
      error: `Trop de tentatives de connexion. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      email,
      next,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    recordFailure(keys);
    return res.status(401).render('login', { error: 'E-mail ou mot de passe incorrect.', email, next });
  }
  db.prepare('DELETE FROM login_attempts WHERE key IN (?, ?)').run(keys[0][0], keys[1][0]);
  if (user.verification_status === 'suspendu' && !user.is_admin) {
    return res.status(403).render('login', { error: "Ce compte est suspendu. Contactez l'équipe AgroLink.", email, next });
  }
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.redirect(next);
  });
});

router.post('/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Profil ----------

router.get('/profil', requireAuth, (req, res) => {
  const listings = db
    .prepare(
      `SELECT * FROM listings WHERE user_id = ?
       ORDER BY CASE status WHEN 'publiee' THEN 0 WHEN 'en_moderation' THEN 1 WHEN 'refusee' THEN 2 ELSE 3 END, created_at DESC, id DESC`
    )
    .all(req.user.id);
  res.render('profile', { listings, error: null });
});

router.post('/profil', requireAuth, logoUpload, async (req, res) => {
  const website = clean(req.body.website, 200);
  const v = {
    name: clean(req.body.name, 100) || req.user.name,
    company: clean(req.body.company, 120) || req.user.company,
    description: clean(req.body.description, 3000),
    category: pick(req.body.category, CATEGORIES),
    country: pick(req.body.country, COUNTRIES),
    city: clean(req.body.city, 100),
    certifications: clean(req.body.certifications, 300),
    phone: clean(req.body.phone, 40),
    website: /^https?:\/\//i.test(website) ? website : '',
  };
  let logo = req.user.logo;
  try {
    if (req.uploadError) throw new Error(req.uploadError);
    if (req.file) {
      await checkImage(req.file);
      logo = await saveLogo(req.file.buffer);
      removeLogo(req.user.logo);
    } else if (req.body.remove_logo === '1') {
      removeLogo(req.user.logo);
      logo = null;
    }
  } catch (err) {
    req.session.flash = { type: 'error', text: `Logo non enregistré : ${err.message}` };
    logo = req.user.logo;
  }
  db.prepare(
    `UPDATE users SET name = ?, company = ?, description = ?, category = ?, country = ?, city = ?,
     certifications = ?, phone = ?, website = ?, logo = ? WHERE id = ?`
  ).run(v.name, v.company, v.description, v.category, v.country, v.city, v.certifications, v.phone, v.website, logo, req.user.id);
  req.session.flash ||= { type: 'success', text: 'Profil mis à jour.' };
  res.redirect('/profil');
});

// ---------- Vérification de l'entreprise ----------

function renderVerification(req, res, error = null, status = 200) {
  const documents = db
    .prepare('SELECT * FROM verification_documents WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.user.id);
  res.status(status).render('verification', { documents, error });
}

router.get('/profil/verification', requireAuth, (req, res) => renderVerification(req, res));

router.post('/profil/verification', requireAuth, docsUpload, (req, res) => {
  if (req.user.role !== 'fournisseur') return renderVerification(req, res, 'La vérification est réservée aux comptes fournisseurs.', 403);
  if (['en_attente', 'verifie'].includes(req.user.verification_status)) return res.redirect('/profil/verification');
  if (req.uploadError) return renderVerification(req, res, req.uploadError, 400);

  const files = Object.keys(VERIFICATION_DOCS)
    .map((type) => [type, req.files?.[type]?.[0]])
    .filter(([, file]) => file);
  if (!files.some(([type]) => type === 'registre_commerce')) {
    return renderVerification(req, res, 'Le registre de commerce est obligatoire.', 400);
  }
  let saved;
  try {
    saved = files.map(([type, file]) => [type, saveVerificationDoc(file)]);
  } catch (err) {
    return renderVerification(req, res, err.message, 400);
  }
  const insert = db.prepare('INSERT INTO verification_documents (user_id, doc_type, filename, mime) VALUES (?, ?, ?, ?)');
  for (const [type, { filename, mime }] of saved) insert.run(req.user.id, type, filename, mime);
  db.prepare("UPDATE users SET verification_status = 'en_attente' WHERE id = ?").run(req.user.id);
  req.session.flash = { type: 'success', text: 'Documents envoyés. Notre équipe les examine sous 48 h ouvrées.' };
  res.redirect('/profil/verification');
});

module.exports = router;
