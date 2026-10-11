// Sélection commune des cartes d'annonces publiées (avec la 1re photo et les infos de l'auteur).
const listingCardSelect = `
  SELECT l.*, u.company, u.logo, u.city, u.verification_status, u.role AS owner_role,
    (SELECT filename FROM listing_photos WHERE listing_id = l.id ORDER BY position, id LIMIT 1) AS photo
  FROM listings l JOIN users u ON u.id = l.user_id
  WHERE l.status = 'publiee' AND u.verification_status != 'suspendu'`;

module.exports = { listingCardSelect };
