const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { db, CATEGORIES, COUNTRIES, INCOTERMS, DOCUMENTS, VERIFICATION_DOCS } = require('./db');
const { viewHelpers, requireAuth } = require('./lib/helpers');
const { subscribe } = require('./lib/realtime');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
Object.assign(app.locals, viewHelpers, { CATEGORIES, COUNTRIES, INCOTERMS, DOCUMENTS, VERIFICATION_DOCS });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const countUnread = db.prepare(`
  SELECT COUNT(*) AS n FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE (c.user_a = :me OR c.user_b = :me) AND m.sender_id != :me AND m.read_at IS NULL
`);
const countAdminQueue = db.prepare(`
  SELECT (SELECT COUNT(*) FROM users WHERE verification_status = 'en_attente')
       + (SELECT COUNT(*) FROM listings WHERE status = 'en_moderation')
       + (SELECT COUNT(*) FROM reports WHERE status = 'ouvert') AS n
`);

app.use((req, res, next) => {
  let user = req.session.userId ? getUser.get(req.session.userId) : null;
  if (user && user.verification_status === 'suspendu' && !user.is_admin) {
    req.session.flash = { type: 'error', text: "Votre compte est suspendu. Contactez l'équipe AgroLink." };
    user = null;
  }
  if (!user) delete req.session.userId;
  req.user = user || null;
  res.locals.user = req.user;
  res.locals.unread = user ? countUnread.get({ me: user.id }).n : 0;
  res.locals.adminQueue = user?.is_admin ? countAdminQueue.get().n : 0;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/api/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const unsubscribe = subscribe(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

app.use(require('./routes/media'));
app.use(require('./routes/directory'));
app.use(require('./routes/listings'));
app.use(require('./routes/account'));
app.use(require('./routes/messages'));
app.use(require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { message: 'Page introuvable.' }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`AgroLink en ligne sur http://localhost:${PORT}`));
}

module.exports = app;
