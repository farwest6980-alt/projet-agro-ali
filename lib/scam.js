// Détection de coordonnées bancaires ou téléphoniques dans un message, pour bloquer
// les tentatives de paiement hors plateforme tant qu'aucun devis n'a été accepté.

function ibanIsValid(candidate) {
  const iban = candidate.replace(/\s+/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function findIban(text) {
  const re = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi;
  for (const match of text.matchAll(re)) {
    if (ibanIsValid(match[0])) return true;
  }
  return false;
}

// RIB : relevé français (banque 5 + guichet 5 + compte 11 + clé 2) ou RIB maghrébin de 20 à 24 chiffres.
function findRib(text) {
  if (/\b\d{5}[ -]?\d{5}[ -]?[A-Z0-9]{11}[ -]?\d{2}\b/i.test(text)) return true;
  for (const match of text.matchAll(/\d[\d -]{18,40}\d/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 20 && digits.length <= 24) return true;
  }
  return false;
}

function findPhone(text) {
  for (const match of text.matchAll(/(?:\+|\b00)?\d[\d .\-()]{6,20}\d/g)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    // International : +216…, +212…, +213…, +33…, +32…, ou 00XXX…
    if (/^(\+|00)/.test(raw) && digits.replace(/^00/, '').length >= 8 && digits.length <= 15) return true;
    // France, Belgique, Maroc, Algérie : 10 chiffres commençant par 0 (06 12 34 56 78, 0470 12 34 56…)
    if (digits.length === 10 && digits.startsWith('0')) return true;
    // Belgique fixe : 9 chiffres commençant par 0
    if (digits.length === 9 && digits.startsWith('0') && /^0\d[ .]?\d{3}/.test(raw)) return true;
    // Tunisie : 8 chiffres commençant par 2, 4, 5 ou 9, écrits « 98 123 456 » ou « 98123456 »
    if (digits.length === 8 && /^[2459]/.test(digits) && !/000$/.test(digits) && /^(\d{2}[ .]?\d{3}[ .]?\d{3})$/.test(raw)) return true;
  }
  return false;
}

/** Retourne la liste des types de coordonnées détectées (vide si rien). */
function detectSensitive(text) {
  const found = [];
  if (findIban(text)) found.push('IBAN');
  if (findRib(text)) found.push('RIB');
  if (findPhone(text)) found.push('numéro de téléphone');
  return found;
}

module.exports = { detectSensitive };
