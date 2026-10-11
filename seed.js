// Remplit la base avec des données de démonstration : node seed.js
const { db, hashPassword } = require('./db');

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('La base contient déjà des données, seed ignoré.');
  process.exit(0);
}

const password = hashPassword('demo1234');
const users = [
  ['fournisseur', 'Marie Laurent', 'Vergers du Val de Loire', 'contact@vergers-loire.fr', 'Fruits & légumes', 'Centre-Val de Loire', 'Blois', 'GlobalG.A.P., HVE', 'Producteurs de pommes et poires depuis 1962. 120 ha de vergers, station de conditionnement intégrée, livraison France entière en camion frigorifique.'],
  ['fournisseur', 'Jean Morel', 'Fromagerie des Alpes', 'ventes@fromagerie-alpes.fr', 'Produits laitiers & fromages', 'Auvergne-Rhône-Alpes', 'Annecy', 'AOP Reblochon, AOP Abondance, IFS Food', 'Affineur de fromages de Savoie. Reblochon, tomme, abondance. Vente aux crémiers, GMS et restauration.'],
  ['fournisseur', 'Sofia Benali', 'Huilerie Provençale', 'pro@huilerie-provencale.fr', 'Épicerie sèche', "Provence-Alpes-Côte d'Azur", 'Salon-de-Provence', 'Bio (AB), AOP Huile de Provence', "Moulin à huile d'olive. Vrac (cubitainers 10 L / 20 L) et bouteilles 50 cl / 75 cl pour épiceries fines et restaurateurs."],
  ['fournisseur', 'Pierre Le Gall', 'Marée de Bretagne', 'commandes@maree-bretagne.fr', 'Produits de la mer', 'Bretagne', 'Concarneau', 'MSC, IFS', 'Mareyeur sous criée : poissons frais, crustacés, coquillages. Expédition J+1 vers Paris et Lyon.'],
  ['fournisseur', 'Lucas Dubois', 'Embal\'Pro', 'devis@embalpro.fr', 'Emballage & conditionnement', 'Hauts-de-France', 'Lille', 'FSC, contact alimentaire', 'Barquettes, cartons et emballages compostables pour l\'agroalimentaire. Impression personnalisée dès 1 000 unités.'],
  ['fournisseur', 'Camille Roux', 'Minoterie Roux', 'contact@minoterie-roux.fr', 'Boulangerie & céréales', 'Occitanie', 'Toulouse', 'Label Rouge, CRC', 'Farines de blé T45 à T150, farines bio et anciennes variétés. Sacs 25 kg et big bags.'],
  ['acheteur', 'Thomas Girard', 'Bistrot Le Comptoir', 'achats@lecomptoir.fr', '', 'Île-de-France', 'Paris', '', 'Restaurant bistronomique 80 couverts, recherche de producteurs en direct.'],
  ['acheteur', 'Nadia Hamidi', 'Épicerie Fine Hamidi', 'nadia@epicerie-hamidi.fr', '', 'Auvergne-Rhône-Alpes', 'Lyon', '', '3 épiceries fines à Lyon, produits du terroir et bio.'],
];

const insertUser = db.prepare(`INSERT INTO users (role, name, company, email, category, region, city, certifications, description, password_hash, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);
const ids = users.map((u, i) => Number(insertUser.run(...u, password, `-${users.length - i} days`).lastInsertRowid));

const listings = [
  [0, 'offre', 'Pommes Golden calibre 70/75 — 20 tonnes', 'Récolte 2026, conservation en atmosphère contrôlée. Colis 18 kg ou palox. Disponible de novembre à avril.', 'Fruits & légumes', '20 tonnes', '0,95 €/kg HT départ', 'Centre-Val de Loire'],
  [1, 'offre', 'Reblochon AOP fermier — volumes hebdomadaires', 'Reblochon fermier pastille verte, affinage 4 semaines minimum. Livraison hebdomadaire possible.', 'Produits laitiers & fromages', '200 pièces / semaine', 'Sur devis', 'Auvergne-Rhône-Alpes'],
  [2, 'offre', "Huile d'olive vierge extra bio en vrac", 'Récolte nouvelle, cubitainers 20 L. Fiche technique et analyses disponibles.', 'Épicerie sèche', '2 000 L disponibles', '11 €/L HT', "Provence-Alpes-Côte d'Azur"],
  [4, 'offre', 'Barquettes kraft compostables 500 ml', 'Barquettes en fibre de bagasse avec couvercle, adaptées à la vente à emporter.', 'Emballage & conditionnement', 'Cartons de 300', '0,18 €/unité', 'Hauts-de-France'],
  [6, 'demande', 'Recherche producteur de légumes de saison', 'Restaurant parisien cherche un maraîcher pour livraison 2x/semaine : légumes de saison, idéalement bio ou HVE.', 'Fruits & légumes', '150 kg / semaine', 'À négocier', 'Île-de-France'],
  [7, 'demande', 'Fromages AOP pour 3 épiceries fines', 'Nous cherchons un affineur pour élargir notre gamme de fromages AOP (Savoie, Jura).', 'Produits laitiers & fromages', '50 kg / semaine', '', 'Auvergne-Rhône-Alpes'],
  [3, 'offre', "Huîtres creuses n°3 — Bretagne Sud", 'Huîtres affinées en claire, bourriches de 3 kg et 5 kg. Expédition J+1.', 'Produits de la mer', '500 bourriches / semaine', 'Sur devis', 'Bretagne'],
];
const insertListing = db.prepare(`INSERT INTO listings (user_id, type, title, description, category, quantity, price, region, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);
listings.forEach((l, i) => insertListing.run(ids[l[0]], ...l.slice(1), `-${(listings.length - i) * 5} hours`));

const [a, b] = [ids[1], ids[7]].sort((x, y) => x - y);
const conv = Number(db.prepare('INSERT INTO conversations (user_a, user_b, listing_id) VALUES (?, ?, 6)').run(a, b).lastInsertRowid);
const msg = db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)');
msg.run(conv, ids[1], "Bonjour, nous avons vu votre demande. Nous pouvons vous fournir Reblochon, Abondance et Tomme de Savoie. Souhaitez-vous des échantillons ?");
msg.run(conv, ids[7], 'Bonjour ! Avec plaisir, pouvez-vous nous envoyer vos tarifs pro et vos conditions de livraison sur Lyon ?');

console.log(`Seed OK : ${users.length} comptes (mot de passe : demo1234), ${listings.length} annonces.`);
