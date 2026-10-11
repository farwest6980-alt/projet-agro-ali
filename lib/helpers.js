const { icon } = require('./icons');

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non connecté' });
  req.session.flash = { type: 'info', text: 'Connectez-vous pour accéder à cette page.' };
  res.redirect(`/connexion?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (req.user?.is_admin) return next();
  res.status(404).render('error', { message: 'Page introuvable.' });
}

const isVerified = (u) => u?.verification_status === 'verifie';

// Helpers disponibles dans toutes les vues (app.locals), y compris les fragments rendus pour le temps réel.
const viewHelpers = {
  icon,
  LISTING_STATUS: { en_moderation: 'En modération', publiee: 'Publiée', refusee: 'Refusée', cloturee: 'Clôturée' },
  VERIF_STATUS: { non_verifie: 'Non vérifié', en_attente: 'En attente', verifie: 'Vérifié', refuse: 'Refusé', suspendu: 'Suspendu' },
  QUOTE_STATUS: { envoye: 'En attente de réponse', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré', negocie: 'Contre-proposition envoyée' },
  formatDate(iso) {
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  },
  formatDay(isoDay) {
    return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  },
  avatar(u, size = '') {
    const cls = `avatar ${size ? `avatar-${size}` : ''}`;
    if (u?.logo) return `<span class="${cls}"><img src="/media/logos/${escapeHtml(u.logo)}.webp" alt=""></span>`;
    return `<span class="${cls}">${escapeHtml((u?.company || '?').slice(0, 1).toUpperCase())}</span>`;
  },
  verifiedBadge(u, withLabel = true) {
    if (!isVerified(u)) return '';
    return `<span class="verified" title="Entreprise vérifiée par AgroLink">${icon('verified')}${withLabel ? 'Vérifié' : ''}</span>`;
  },
};

module.exports = { clean, pick, escapeHtml, safeNext, requireAuth, requireAdmin, isVerified, viewHelpers };
