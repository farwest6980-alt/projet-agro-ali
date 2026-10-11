# AgroLink

Place de marché B2B de l'agroalimentaire **Maghreb → Europe** : des fournisseurs vérifiés (Tunisie, Maroc, Algérie) et des acheteurs (France, Belgique) publient des annonces, échangent des devis et négocient dans une messagerie sécurisée.

## Fonctionnalités

- **Annuaire des fournisseurs** : recherche, filtres par catégorie, par pays et « Vérifiés uniquement ».
- **Annonces** (offres et demandes) : incoterm (EXW, FOB, CIF, DAP, Rendu), conditionnement, documents disponibles (EUR.1, certificat phytosanitaire, certificat sanitaire, Bio UE, analyses labo), **jusqu'à 6 photos**. Elles sont redimensionnées en WEBP 1200 px avec une miniature 400 px. La fiche annonce affiche une galerie qu'on peut faire défiler au doigt sur mobile.
- **Modération** : chaque nouvelle annonce reste « en modération » jusqu'à sa validation par un administrateur.
- **Vérification des fournisseurs** : le fournisseur envoie son registre de commerce, son code en douane et son agrément export (PDF ou JPG). Après validation, le badge « Vérifié » s'affiche sur les cartes, les fiches et dans le chat.
- **Messagerie en temps réel** avec **devis** : produit, quantité, prix, incoterm et date de validité. L'acheteur peut accepter, refuser ou négocier en envoyant une contre-proposition. Statuts possibles : envoyé, accepté, refusé, expiré, négocié.
- **Anti-arnaque** : tant qu'aucun devis n'est accepté, un message qui contient un IBAN, un RIB ou un numéro de téléphone est bloqué et un signalement automatique est créé. Un bandeau « Ne payez jamais en dehors de la plateforme » et un bouton « Signaler » apparaissent dans chaque conversation.
- **Espace admin** (`/admin`) : fournisseurs à vérifier avec leurs documents, annonces à modérer, signalements (avec lecture de la conversation), gestion des membres (valider, refuser, suspendre, réactiver).
- **Sécurité** : connexion bloquée 15 minutes après 5 échecs. Le type réel des fichiers envoyés est vérifié (pas seulement l'extension), et les fichiers sont renommés aléatoirement et stockés hors du dossier public. Le téléphone et le site web ne sont jamais affichés publiquement.

## Lancer le projet

Il faut Node.js ≥ 22.13.

```bash
npm install
npm run seed    # données de démo (photos d'exemple générées automatiquement)
npm start       # http://localhost:3000
```

`npm run reset` efface la base (`data/`) et les fichiers envoyés (`uploads/`), puis relance le seed.

Comptes de démo (mot de passe `demo1234`) :

| Rôle | E-mail |
|---|---|
| Admin | `admin@agrolink.test` |
| Fournisseur vérifié (dattes, Douz) | `export@palmeraie-douz.tn` |
| Fournisseur vérifié (huile, Sfax) | `export@zitouna-sfax.tn` |
| Acheteur (Paris), avec un devis en attente | `sourcing@biome-bio.fr` |
| Acheteur (Marseille) | `achats@med-import.fr` |

Variables d'environnement : `PORT`, `SESSION_SECRET` (obligatoire en production), `DB_PATH`, `UPLOADS_DIR`, `TRUST_PROXY` (derrière un reverse proxy, pour que la limite de connexion voie la vraie IP).

## Structure

```
server.js          configuration Express et temps réel (SSE)
db.js              schéma SQLite, catégories, pays, incoterms
routes/            directory, listings, account, messages, admin, media
lib/               uploads (multer + sharp), scam (détection IBAN/RIB/tél.), icons, helpers
views/             pages EJS
public/            style.css, ui.js (galerie, photos), app.js (chat, devis)
```

## Pistes pour la suite

- Sessions persistantes (aujourd'hui, un redémarrage du serveur déconnecte tout le monde)
- Paiement sécurisé ou séquestre sur la plateforme, une fois les devis acceptés
- Notifications par e-mail, mot de passe oublié
- Modification d'une annonce existante (photos comprises)
