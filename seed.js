// Remplit la base avec des données de démonstration : npm run seed
// (pour repartir de zéro : npm run reset)
const fs = require('node:fs');
const path = require('node:path');
const { db, hashPassword } = require('./db');
const { saveListingPhoto, saveLogo, DIRS } = require('./lib/uploads');

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('La base contient déjà des données, seed ignoré (npm run reset pour repartir de zéro).');
  process.exit(0);
}

// ---------- Générateur d'illustrations de démonstration (SVG → WEBP, sans texte) ----------

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const W = 1200;
const H = 900;
const svg = (bg1, bg2, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
  <radialGradient id="shine" cx="0.35" cy="0.3" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${body}</svg>`);

const ART = {
  dattes(r, v) {
    const tones = v % 2 ? ['#5a2e14', '#6e3818', '#7d4420', '#4a240f'] : ['#8a4b1e', '#9c5a26', '#a8692f', '#7a3f17'];
    let body = '';
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = r() * H, a = r() * 180, rx = 46 + r() * 16, ry = 22 + r() * 6;
      const c = tones[Math.floor(r() * tones.length)];
      body += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${a.toFixed(0)})"><ellipse rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="${c}"/><ellipse rx="${(rx * 0.7).toFixed(0)}" ry="${(ry * 0.35).toFixed(0)}" cy="${(-ry * 0.35).toFixed(0)}" fill="#fff" opacity="0.12"/></g>`;
    }
    return svg('#d9b98c', '#b88a55', body);
  },
  huile(r, v) {
    let body = '';
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = 600 + r() * 300, a = r() * 180;
      body += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="38" ry="26" transform="rotate(${a.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${r() > 0.5 ? '#556b2f' : '#3b4a1f'}"/>`;
    }
    const x = v % 2 ? 420 : 520;
    body += `<path d="M${x} 180 h120 v90 q70 40 70 120 v330 q0 40 -40 40 h-180 q-40 0 -40 -40 v-330 q0 -80 70 -120z" fill="#c9a227" opacity="0.92"/>
      <rect x="${x - 5}" y="140" width="130" height="50" rx="8" fill="#2f3b1a"/>
      <rect x="${x - 40}" y="470" width="200" height="140" rx="10" fill="#f4ecd6"/>
      <path d="M${x} 300 q-50 20 -50 110 v300" stroke="#fff" stroke-opacity="0.35" stroke-width="18" fill="none"/>`;
    return svg('#e9edd6', '#b5c08a', body);
  },
  epices(r, v) {
    const colors = v % 2 ? ['#c0392b', '#e67e22', '#d4ac0d', '#7b3f00', '#a93226'] : ['#e1a100', '#b03a2e', '#ca6f1e', '#6e2c00', '#d68910'];
    let body = '';
    colors.forEach((c, i) => {
      const cx = 140 + i * 230, cy = 560 + (i % 2) * 110;
      body += `<ellipse cx="${cx}" cy="${cy + 90}" rx="150" ry="50" fill="#3d2b1f" opacity="0.25"/>
        <path d="M${cx - 140} ${cy + 70} q140 -${260 + r() * 60} 280 0z" fill="${c}"/>
        <ellipse cx="${cx}" cy="${cy + 70}" rx="140" ry="40" fill="${c}" opacity="0.9"/>`;
      for (let k = 0; k < 30; k++) body += `<circle cx="${(cx - 120 + r() * 240).toFixed(0)}" cy="${(cy + 20 + r() * 70).toFixed(0)}" r="${(2 + r() * 4).toFixed(1)}" fill="#fff" opacity="0.2"/>`;
    });
    return svg('#f3dcc2', '#d9a77b', body);
  },
  argan(r, v) {
    let body = '';
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = 640 + r() * 260;
      body += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="34" ry="24" fill="${r() > 0.5 ? '#8d5524' : '#6b3e1b'}"/>`;
    }
    const x = v % 2 ? 380 : 560;
    body += `<rect x="${x}" y="300" width="240" height="380" rx="40" fill="#d68b1f" opacity="0.95"/>
      <rect x="${x + 70}" y="220" width="100" height="90" rx="10" fill="#3a2a1a"/>
      <rect x="${x + 95}" y="130" width="50" height="100" rx="25" fill="#222"/>
      <rect x="${x + 30}" y="420" width="180" height="140" rx="12" fill="#fbf3e4"/>
      <rect x="${x + 25}" y="330" width="30" height="300" rx="15" fill="#fff" opacity="0.25"/>`;
    return svg('#f6ead5', '#e3c79b', body);
  },
  couscous(r) {
    let body = '<ellipse cx="600" cy="560" rx="470" ry="200" fill="#8e5b34"/><ellipse cx="600" cy="520" rx="440" ry="170" fill="#e8c77d"/>';
    for (let i = 0; i < 1600; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      body += `<circle cx="${(600 + Math.cos(a) * d * 420).toFixed(0)}" cy="${(520 + Math.sin(a) * d * 155).toFixed(0)}" r="${(2 + r() * 2.5).toFixed(1)}" fill="${r() > 0.5 ? '#f5dc9a' : '#d9b260'}"/>`;
    }
    return svg('#efe4cf', '#cbb28a', body);
  },
  harissa(r, v) {
    const x = v % 2 ? 340 : 480;
    let body = `<ellipse cx="${x + 120}" cy="760" rx="220" ry="40" fill="#000" opacity="0.15"/>
      <rect x="${x}" y="330" width="240" height="430" rx="30" fill="#b3161b"/>
      <rect x="${x - 10}" y="290" width="260" height="70" rx="12" fill="#d4a017"/>
      <rect x="${x + 25}" y="470" width="190" height="170" rx="14" fill="#f8e7c4"/>
      <circle cx="${x + 120}" cy="555" r="48" fill="#b3161b"/>`;
    for (let i = 0; i < 9; i++) {
      const px = 820 + r() * 300, py = 200 + r() * 600;
      body += `<path d="M${px.toFixed(0)} ${py.toFixed(0)} q60 20 110 120 q-80 -10 -110 -120z" fill="#c0181e"/><path d="M${px.toFixed(0)} ${py.toFixed(0)} l-14 -26" stroke="#2e6b1f" stroke-width="9" stroke-linecap="round"/>`;
    }
    return svg('#f7e6cf', '#e0b48a', body);
  },
  agrumes(r) {
    let body = '';
    for (let i = 0; i < 22; i++) {
      const x = r() * W, y = r() * H, rad = 80 + r() * 40;
      body += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(0)}" fill="${r() > 0.3 ? '#f39c12' : '#f5b041'}"/><circle cx="${(x - rad * 0.3).toFixed(0)}" cy="${(y - rad * 0.3).toFixed(0)}" r="${(rad * 0.35).toFixed(0)}" fill="#fff" opacity="0.18"/>
        <ellipse cx="${(x + rad * 0.5).toFixed(0)}" cy="${(y - rad * 0.95).toFixed(0)}" rx="38" ry="16" fill="#2e7d32" transform="rotate(-25 ${(x + rad * 0.5).toFixed(0)} ${(y - rad * 0.95).toFixed(0)})"/>`;
    }
    return svg('#fff3d9', '#f6cf8e', body);
  },
  fruitsSecs(r) {
    let body = '';
    for (let i = 0; i < 120; i++) {
      const x = r() * W, y = r() * H, a = r() * 180;
      body += `<path transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${a.toFixed(0)})" d="M0 -45 q34 20 0 90 q-34 -70 0 -90z" fill="${r() > 0.5 ? '#c68642' : '#a0632b'}"/>`;
    }
    return svg('#f1e2c6', '#d7b98a', body);
  },
  emballage(r) {
    let body = '';
    for (let i = 0; i < 6; i++) {
      const x = 80 + (i % 3) * 360, y = 140 + Math.floor(i / 3) * 360;
      body += `<rect x="${x}" y="${y}" width="300" height="260" rx="8" fill="${r() > 0.5 ? '#c8a165' : '#b98f52'}"/><rect x="${x + 130}" y="${y}" width="40" height="260" fill="#e8d3a8" opacity="0.8"/>`;
    }
    return svg('#efe9df', '#d8cdb9', body);
  },
};

function logoSvg(initials, color) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/>
    <path d="M60 190c0-70 45-120 136-128-8 88-60 128-136 128z" fill="#fff" opacity="0.9"/><path d="M60 190l70-70" stroke="${color}" stroke-width="10" stroke-linecap="round"/></svg>`);
}

async function main() {
// ---------- Comptes ----------

const password = hashPassword('demo1234');
const insertUser = db.prepare(`INSERT INTO users
  (role, is_admin, verification_status, name, company, email, category, country, city, certifications, phone, website, description, logo, password_hash, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);

const users = {
  admin: ['acheteur', 1, 'verifie', 'Équipe AgroLink', 'AgroLink', 'admin@agrolink.test', '', 'France', 'Paris', '', '', '', "Équipe de modération d'AgroLink.", null],
  douz: ['fournisseur', 0, 'verifie', 'Mohamed Ben Salem', 'Palmeraie de Douz', 'export@palmeraie-douz.tn', 'Dattes', 'Tunisie', 'Douz', 'Bio UE (Ecocert), GlobalG.A.P., IFS Food', '+216 75 470 000', 'https://palmeraie-douz.example', "Conditionneur de dattes Deglet Nour dans le Nefzaoua depuis 1998. Station de tri, fumigation et chambres froides sur site. Capacité : 2 500 t/saison. Export vers la France, l'Allemagne et l'Italie.", '#7a4418'],
  kebili: ['fournisseur', 0, 'verifie', 'Sana Gharbi', 'Kébili Dattes Export', 'contact@kebili-dattes.tn', 'Dattes', 'Tunisie', 'Kébili', 'ISO 22000, HACCP', '+216 75 490 000', '', 'Dattes Deglet Nour branchées, en vrac et en raviers. Spécialiste des marques distributeurs (MDD) pour la GMS européenne. Pâte de dattes pour l\'industrie.', '#9c5a26'],
  tozeur: ['fournisseur', 0, 'en_attente', 'Hichem Jebali', 'Oasis Tozeur Conditionnement', 'hichem@oasis-tozeur.tn', 'Dattes', 'Tunisie', 'Tozeur', 'HACCP', '+216 76 450 000', '', "Jeune unité de conditionnement au cœur de l'oasis de Tozeur. Dattes Deglet Nour, Alig et Kentichi.", null],
  sfax: ['fournisseur', 0, 'verifie', 'Walid Triki', 'Huilerie Zitouna Sfax', 'export@zitouna-sfax.tn', "Huile d'olive", 'Tunisie', 'Sfax', 'Bio UE, ISO 22000, BRCGS', '+216 74 400 000', 'https://zitouna-sfax.example', "Huilerie familiale, variété Chemlali. Extraction à froid en 2 phases. Vrac (flexitank, IBC 1000 L) et conditionné (bouteilles 25 cl à 1 L, bidons 5 L).", '#556b2f'],
  marrakech: ['fournisseur', 0, 'verifie', 'Youssef El Amrani', 'Épices Atlas Marrakech', 'contact@epices-atlas.ma', 'Épices & herbes', 'Maroc', 'Marrakech', 'ONSSA, ISO 22000', '+212 524 000 000', '', 'Épices et herbes du Maroc : cumin, paprika, ras el hanout, safran de Taliouine, menthe séchée, verveine. Broyage et mélanges sur mesure.', '#b03a2e'],
  agadir: ['fournisseur', 0, 'verifie', 'Fatima Ait Brahim', 'Coopérative Tifaout Argan', 'cooperative@tifaout-argan.ma', 'Cosmétique naturelle (argan, figue de barbarie)', 'Maroc', 'Agadir', 'Ecocert Cosmos, IGP Argane, Commerce équitable', '+212 528 000 000', '', 'Coopérative de 60 femmes de la région Souss-Massa. Huile d\'argan cosmétique et alimentaire, huile de pépins de figue de barbarie. Vrac et marque blanche.', '#d68b1f'],
  biskra: ['fournisseur', 0, 'non_verifie', 'Karim Bensaïd', 'Dattes des Ziban', 'ventes@dattes-ziban.dz', 'Dattes', 'Algérie', 'Biskra', '', '+213 33 000 000', '', 'Producteur de Deglet Nour de la région des Ziban.', null],
  capbon: ['fournisseur', 0, 'verifie', 'Leïla Mansour', 'Conserverie du Cap Bon', 'export@conserverie-capbon.tn', 'Conserves & harissa', 'Tunisie', 'Nabeul', 'IFS Food, Halal', '+216 72 000 000', '', 'Harissa traditionnelle, concentré de tomate, piments et légumes en conserve. Boîtes 70 g à 4/4, tubes, bocaux.', '#b3161b'],
  lyon: ['acheteur', 0, 'non_verifie', 'Nadia Hamidi', 'Saveurs du Sud — Lyon', 'nadia@saveurs-du-sud.fr', 'Épices & herbes', 'France', 'Lyon', '', '', '', 'Grossiste et 3 épiceries fines à Lyon, spécialisés produits du Maghreb.', null],
  marseille: ['acheteur', 0, 'non_verifie', 'Julien Ferrandi', 'Méditerranée Import', 'achats@med-import.fr', 'Dattes', 'France', 'Marseille', '', '', '', 'Importateur-distributeur basé au port de Marseille. Dattes, huile d\'olive et fruits secs pour la GMS et le CHR.', null],
  paris: ['acheteur', 0, 'non_verifie', 'Claire Dumas', 'Biome Épicerie Bio', 'sourcing@biome-bio.fr', 'Huile d\'olive', 'France', 'Paris', '', '', '', 'Réseau de 12 magasins bio en Île-de-France. Recherche de produits certifiés Bio UE en direct producteurs.', null],
  bruxelles: ['acheteur', 0, 'non_verifie', 'Samir Lahlou', 'Atlas Food Distribution', 'samir@atlasfood.be', 'Céréales & couscous', 'Belgique', 'Bruxelles', '', '', '', 'Distributeur Benelux de produits orientaux pour la grande distribution et les commerces de proximité.', null],
};

const ids = {};
const keys = Object.keys(users);
for (const [i, key] of keys.entries()) {
  const [role, isAdmin, status, name, company, email, category, country, city, certs, phone, website, description, color] = users[key];
  const logo = color ? await saveLogo(logoSvg(company.slice(0, 1), color)) : null;
  ids[key] = Number(
    insertUser.run(role, isAdmin, status, name, company, email, category, country, city, certs, phone, website, description, logo, password, `-${(keys.length - i) * 3} days`).lastInsertRowid
  );
}

// Documents de vérification fictifs (PDF minimal) pour le fournisseur en attente.
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
for (const type of ['registre_commerce', 'code_douane']) {
  const filename = `${require('node:crypto').randomBytes(16).toString('hex')}.pdf`;
  fs.writeFileSync(path.join(DIRS.verification, filename), pdf);
  db.prepare("INSERT INTO verification_documents (user_id, doc_type, filename, mime) VALUES (?, ?, ?, 'application/pdf')").run(ids.tozeur, type, filename);
}

// ---------- Annonces ----------

const listings = [
  ['douz', 'offre', 'Dattes Deglet Nour branchées — récolte 2026', "Deglet Nour extra, branchées, calibre 9-11 g. Triées et fumigées, traçabilité par lot. Disponibles d'octobre à mars. Possibilité de marquage MDD.", 'Dattes', '2 conteneurs 40\' / mois', '3,40 €/kg', 'Tunisie', 'FOB', 'Cartons 5 kg, raviers 500 g / 1 kg', ['eur1', 'phyto', 'bio_ue', 'analyses'], 'dattes', 3, 'publiee'],
  ['kebili', 'offre', 'Deglet Nour vrac pour industrie et MDD', 'Dattes Deglet Nour en vrac, catégorie I et II. Idéal pour pâtisserie, pâte de dattes et ensachage. Échantillons sur demande.', 'Dattes', '20 t minimum', '2,60 €/kg', 'Tunisie', 'CIF', 'Cartons 10 kg et 12 kg', ['eur1', 'phyto', 'analyses'], 'dattes', 2, 'publiee'],
  ['sfax', 'offre', "Huile d'olive extra vierge Chemlali bio — vrac", "Huile d'olive extra vierge, acidité < 0,3 %, récolte 2025/26. Panel test et analyses complètes disponibles. Certifiée Bio UE.", "Huile d'olive", '1 flexitank / mois', '6,90 €/L', 'Tunisie', 'FOB', 'Flexitank 24 000 L, IBC 1000 L', ['eur1', 'sanitaire', 'bio_ue', 'analyses'], 'huile', 2, 'publiee'],
  ['marrakech', 'offre', 'Ras el hanout et cumin moulu — qualité export', 'Mélange ras el hanout 27 épices, cumin moulu, paprika doux. Stérilisation vapeur, faible charge microbienne. Mélanges sur mesure possibles.', 'Épices & herbes', '500 kg à 5 t', 'Sur devis', 'Maroc', 'EXW', 'Sacs kraft 25 kg, sachets 100 g', ['eur1', 'phyto', 'analyses'], 'epices', 3, 'publiee'],
  ['agadir', 'offre', "Huile d'argan cosmétique pure — Ecocert", "Huile d'argan 100 % pure pressée à froid, désodorisée ou non. Certifiée Ecocert Cosmos et IGP Argane. Marque blanche possible dès 500 flacons.", 'Cosmétique naturelle (argan, figue de barbarie)', '200 L / mois', '38 €/L', 'Maroc', 'DAP', 'Bidons 5 L, 25 L ; flacons 30 / 50 ml', ['eur1', 'bio_ue', 'analyses'], 'argan', 2, 'publiee'],
  ['capbon', 'offre', 'Harissa traditionnelle du Cap Bon', 'Harissa piment, ail, carvi et coriandre. Sans conservateur. Boîtes, tubes et bocaux ; marque distributeur possible.', 'Conserves & harissa', '1 conteneur 20\'', '1,15 €/boîte 135 g', 'Tunisie', 'CIF', 'Boîtes 70 g / 135 g / 380 g, cartons de 48', ['eur1', 'sanitaire', 'analyses'], 'harissa', 2, 'publiee'],
  ['marseille', 'demande', 'Recherche Deglet Nour bio pour GMS — Ramadan 2027', "Importateur marseillais recherche 3 à 5 conteneurs de Deglet Nour Bio UE, raviers 500 g, livraison janvier-février 2027. Fournisseurs vérifiés uniquement.", 'Dattes', '3 à 5 conteneurs 40\'', 'À négocier', 'Tunisie', 'CIF', 'Raviers 500 g', ['eur1', 'phyto', 'bio_ue'], null, 0, 'publiee'],
  ['bruxelles', 'demande', 'Couscous moyen et fin pour distribution Benelux', 'Distributeur belge cherche un fabricant de couscous (moyen et fin), sacs 1 kg et 5 kg, en marque propre. Volumes réguliers.', 'Céréales & couscous', '10 t / mois', '', 'Autre', 'DAP', 'Sacs 1 kg et 5 kg', ['eur1', 'sanitaire'], 'couscous', 1, 'publiee'],
  ['paris', 'demande', "Huile d'olive bio en bidons 5 L pour nos magasins", "Réseau de magasins bio recherche une huile d'olive extra vierge Bio UE en bidons de 5 L et bouteilles 75 cl, livrée rendu Île-de-France.", "Huile d'olive", '3 palettes / trimestre', '', 'Tunisie', 'Rendu', 'Bidons 5 L, bouteilles 75 cl', ['bio_ue', 'analyses'], null, 0, 'publiee'],
  ['lyon', 'demande', 'Safran, menthe séchée et mélanges pour épiceries fines', 'Grossiste lyonnais cherche épices marocaines en petits conditionnements pour revente en épicerie fine.', 'Épices & herbes', '200 kg / mois', '', 'Maroc', 'DAP', 'Sachets 50 g à 250 g', ['eur1', 'analyses'], 'epices', 1, 'publiee'],
  ['tozeur', 'offre', 'Dattes Alig et Kentichi — petits lots', 'Variétés traditionnelles Alig et Kentichi, idéales pour la pâtisserie orientale.', 'Dattes', '5 t', '2,20 €/kg', 'Tunisie', 'EXW', 'Cartons 5 kg', ['phyto'], 'dattes', 1, 'en_moderation'],
  ['biskra', 'offre', 'Deglet Nour des Ziban — vrac', 'Deglet Nour récolte 2026, vrac, toutes catégories.', 'Dattes', '50 t', 'Sur devis', 'Algérie', 'FOB', 'Cartons 10 kg', ['phyto'], 'dattes', 2, 'en_moderation'],
];

const insertListing = db.prepare(`INSERT INTO listings
  (user_id, type, title, description, category, quantity, price, country, incoterm, packaging, documents, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);
const insertPhoto = db.prepare('INSERT INTO listing_photos (listing_id, filename, position) VALUES (?, ?, ?)');
const listingIds = [];
for (const [i, l] of listings.entries()) {
  const [owner, type, title, description, category, quantity, price, country, incoterm, packaging, documents, art, photoCount, status] = l;
  const id = Number(
    insertListing.run(ids[owner], type, title, description, category, quantity, price, country, incoterm, packaging, JSON.stringify(documents), status, `-${(listings.length - i) * 7} hours`).lastInsertRowid
  );
  listingIds.push(id);
  for (let p = 0; p < photoCount; p++) {
    insertPhoto.run(id, await saveListingPhoto(ART[art](rng(1000 + i * 10 + p), p)), p);
  }
}

// ---------- Conversations, devis et signalement ----------

const now = (offset) => `datetime('now', '${offset}')`;
function conversation(u1, u2, listingIndex) {
  const [a, b] = [ids[u1], ids[u2]].sort((x, y) => x - y);
  return Number(db.prepare('INSERT INTO conversations (user_a, user_b, listing_id) VALUES (?, ?, ?)').run(a, b, listingIndex == null ? null : listingIds[listingIndex]).lastInsertRowid);
}
const text = (conv, from, body, offset) =>
  db.prepare(`INSERT INTO messages (conversation_id, sender_id, body, read_at, created_at) VALUES (?, ?, ?, ${now(offset)}, ${now(offset)})`).run(conv, ids[from], body);
function quote(conv, from, parent, product, quantity, price, incoterm, status, offset) {
  const q = Number(
    db.prepare(`INSERT INTO quotes (conversation_id, sender_id, parent_id, product, quantity, price, incoterm, valid_until, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, date('now', '+20 days'), ?, ${now(offset)})`).run(conv, ids[from], parent, product, quantity, price, incoterm, status).lastInsertRowid
  );
  db.prepare(`INSERT INTO messages (conversation_id, sender_id, type, quote_id, read_at, created_at) VALUES (?, ?, 'devis', ?, ${now(offset)}, ${now(offset)})`).run(conv, ids[from], q);
  return q;
}

// Marseille ↔ Palmeraie de Douz : devis, contre-proposition, acceptation.
const c1 = conversation('marseille', 'douz', 0);
text(c1, 'marseille', 'Bonjour, nous cherchons 2 conteneurs de Deglet Nour branchées pour janvier. Quel prix CIF Marseille ?', '-2 days');
text(c1, 'douz', 'Bonjour Julien, avec plaisir. Je vous prépare un devis CIF Marseille, raviers 1 kg.', '-2 days');
const q1 = quote(c1, 'douz', null, 'Deglet Nour branchées, raviers 1 kg', "2 conteneurs 40'", '3,70 €/kg', 'CIF', 'negocie', '-1 days');
quote(c1, 'marseille', q1, 'Deglet Nour branchées, raviers 1 kg', "2 conteneurs 40'", '3,50 €/kg', 'CIF', 'accepte', '-20 hours');
text(c1, 'douz', 'Parfait, accord à 3,50 €/kg. Je vous envoie le contrat et les documents EUR.1 via la plateforme.', '-19 hours');

// Paris ↔ Huilerie Zitouna : devis en attente de réponse.
const c2 = conversation('paris', 'sfax', 2);
text(c2, 'paris', "Bonjour, votre huile est-elle disponible en bidons 5 L certifiés Bio UE, livrés rendu Île-de-France ?", '-6 hours');
quote(c2, 'sfax', null, "Huile d'olive EV Chemlali bio, bidons 5 L", '3 palettes (360 bidons)', '8,40 €/L', 'Rendu', 'envoye', '-5 hours');
db.prepare('UPDATE messages SET read_at = NULL WHERE conversation_id = ? AND sender_id = ?').run(c2, ids.sfax);

// Bruxelles ↔ Dattes des Ziban : message bloqué → signalement automatique.
const c3 = conversation('bruxelles', 'biskra', null);
text(c3, 'bruxelles', 'Bonjour, vous faites aussi du couscous ?', '-3 hours');
db.prepare(`INSERT INTO reports (reporter_id, reported_user_id, conversation_id, auto, reason, details) VALUES (NULL, ?, ?, 1, ?, ?)`)
  .run(ids.biskra, c3, 'Coordonnées hors plateforme (IBAN, numéro de téléphone)', 'Message bloqué : « Oui, payez 30 % d\'avance sur ce compte DZ58 0021 0000 1234 5678 9012 ou appelez-moi au +213 661 23 45 67 »');

db.prepare("UPDATE conversations SET updated_at = datetime('now', '-' || (id * 2) || ' hours')").run();

console.log(`Seed OK : ${keys.length} comptes (mot de passe : demo1234), ${listings.length} annonces avec photos.`);
console.log('Admin : admin@agrolink.test — Fournisseur : export@palmeraie-douz.tn — Acheteur : achats@med-import.fr');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
