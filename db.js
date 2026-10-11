const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'agro.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

const SCHEMA_VERSION = 2;
const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (hasUsers && db.prepare('PRAGMA user_version').get().user_version < SCHEMA_VERSION) {
  throw new Error(
    `La base ${DB_PATH} date d'une ancienne version du site. Supprimez le dossier data/ (et uploads/) puis relancez "npm run seed".`
  );
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('fournisseur', 'acheteur')),
  is_admin INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'non_verifie'
    CHECK (verification_status IN ('non_verifie', 'en_attente', 'verifie', 'refuse', 'suspendu')),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  certifications TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verification_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('registre_commerce', 'code_douane', 'agrement_export')),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('offre', 'demande')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  price TEXT DEFAULT '',
  country TEXT DEFAULT '',
  incoterm TEXT DEFAULT '',
  packaging TEXT DEFAULT '',
  documents TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'en_moderation'
    CHECK (status IN ('en_moderation', 'publiee', 'refusee', 'cloturee')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listing_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  filename TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  product TEXT NOT NULL,
  quantity TEXT NOT NULL,
  price TEXT NOT NULL,
  incoterm TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'envoye'
    CHECK (status IN ('envoye', 'accepte', 'refuse', 'expire', 'negocie')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'texte' CHECK (type IN ('texte', 'devis')),
  body TEXT NOT NULL DEFAULT '',
  quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'traite')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_listing ON listing_photos(listing_id, position);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations(user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_quotes_conv ON quotes(conversation_id, status);
`);
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

const CATEGORIES = [
  'Dattes',
  "Huile d'olive",
  'Épices & herbes',
  'Fruits secs',
  'Agrumes',
  'Cosmétique naturelle (argan, figue de barbarie)',
  'Céréales & couscous',
  'Conserves & harissa',
  'Emballage',
];

const COUNTRIES = ['Tunisie', 'Maroc', 'Algérie', 'France', 'Belgique', 'Autre'];

const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DAP', 'Rendu'];

const DOCUMENTS = {
  eur1: 'EUR.1',
  phyto: 'Certificat phytosanitaire',
  sanitaire: 'Certificat sanitaire',
  bio_ue: 'Bio UE',
  analyses: 'Analyses labo',
};

const VERIFICATION_DOCS = {
  registre_commerce: 'Registre de commerce',
  code_douane: 'Code en douane',
  agrement_export: 'Agrément export',
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

module.exports = {
  db,
  CATEGORIES,
  COUNTRIES,
  INCOTERMS,
  DOCUMENTS,
  VERIFICATION_DOCS,
  hashPassword,
  verifyPassword,
};
