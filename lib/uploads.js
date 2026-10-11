const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const DIRS = {
  listings: path.join(UPLOADS_DIR, 'listings'),
  logos: path.join(UPLOADS_DIR, 'logos'),
  verification: path.join(UPLOADS_DIR, 'verification'),
};
Object.values(DIRS).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const MAX_PHOTOS = 6;
const MB = 1024 * 1024;

// Détection du vrai type à partir des premiers octets, sans faire confiance à l'extension ni au mimetype envoyé.
function sniff(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

const randomName = () => crypto.randomBytes(16).toString('hex');

function uploader(limits) {
  return multer({ storage: multer.memoryStorage(), limits });
}

// Enveloppe un middleware multer pour transformer ses erreurs en message lisible (req.uploadError).
function handle(middleware) {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (err) {
        req.uploadError =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Un fichier dépasse la taille maximale autorisée.'
            : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
              ? `Trop de fichiers envoyés (${MAX_PHOTOS} photos maximum).`
              : "Erreur lors de l'envoi des fichiers.";
        req.body = req.body || {};
      }
      next();
    });
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function checkImage(file) {
  if (!IMAGE_TYPES.includes(sniff(file.buffer))) throw new Error(`« ${file.originalname} » n'est pas une image JPG, PNG ou WEBP.`);
  try {
    await sharp(file.buffer).metadata();
  } catch {
    throw new Error(`« ${file.originalname} » est illisible ou corrompue.`);
  }
}

// Enregistre une photo d'annonce : 1200 px max + miniature 400 px, en WEBP. Retourne le nom de base.
async function saveListingPhoto(buffer) {
  const name = randomName();
  const base = sharp(buffer, { failOn: 'error' }).rotate();
  await base.clone().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(DIRS.listings, `${name}.webp`));
  await base.clone().resize({ width: 400, height: 300, fit: 'cover' }).webp({ quality: 75 }).toFile(path.join(DIRS.listings, `${name}_thumb.webp`));
  return name;
}

async function saveLogo(buffer) {
  const name = randomName();
  await sharp(buffer, { failOn: 'error' }).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toFile(path.join(DIRS.logos, `${name}.webp`));
  return name;
}

function removeListingPhoto(name) {
  for (const f of [`${name}.webp`, `${name}_thumb.webp`]) fs.rm(path.join(DIRS.listings, f), { force: true }, () => {});
}

function removeLogo(name) {
  if (name) fs.rm(path.join(DIRS.logos, `${name}.webp`), { force: true }, () => {});
}

const DOC_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg' };

function saveVerificationDoc(file) {
  const mime = sniff(file.buffer);
  if (!DOC_TYPES[mime]) throw new Error(`« ${file.originalname} » doit être un PDF ou un JPG.`);
  const filename = `${randomName()}.${DOC_TYPES[mime]}`;
  fs.writeFileSync(path.join(DIRS.verification, filename), file.buffer);
  return { filename, mime };
}

module.exports = {
  DIRS,
  MAX_PHOTOS,
  photosUpload: handle(uploader({ fileSize: 5 * MB, files: MAX_PHOTOS }).array('photos', MAX_PHOTOS)),
  logoUpload: handle(uploader({ fileSize: 5 * MB, files: 1 }).single('logo')),
  docsUpload: handle(
    uploader({ fileSize: 10 * MB, files: 3 }).fields([
      { name: 'registre_commerce', maxCount: 1 },
      { name: 'code_douane', maxCount: 1 },
      { name: 'agrement_export', maxCount: 1 },
    ])
  ),
  checkImage,
  saveListingPhoto,
  saveLogo,
  removeListingPhoto,
  removeLogo,
  saveVerificationDoc,
};
