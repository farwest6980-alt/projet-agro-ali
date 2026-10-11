# AgroLink 🌾

Annuaire et place de marché B2B des fournisseurs agroalimentaires : les fournisseurs et les acheteurs publient des annonces et discutent en direct.

## Fonctionnalités

- **Comptes fournisseur / acheteur** : inscription, connexion, profil d'entreprise (activité, région, labels, contact)
- **Annuaire des fournisseurs** : recherche + filtres par catégorie et par région, fiche entreprise
- **Annonces** : offres (vente) et demandes (achat), avec filtres, publication et clôture
- **Messagerie en temps réel** entre membres (Server-Sent Events), liée ou non à une annonce, avec compteur de messages non lus
- Interface en français, responsive (mobile)

## Lancer le projet

Il faut Node.js ≥ 22.13 (SQLite est intégré à Node, rien d'autre à installer).

```bash
npm install
npm run seed   # optionnel : données de démo (mot de passe des comptes : demo1234)
npm start      # http://localhost:3000
```

Comptes de démo : `ventes@fromagerie-alpes.fr` (fournisseur), `nadia@epicerie-hamidi.fr` (acheteur).

Variables d'environnement : `PORT`, `SESSION_SECRET` (à définir en production), `DB_PATH` (par défaut `data/agro.db`).

## Stack

Express 5 · EJS · SQLite (`node:sqlite`) · CSS et JS natifs.

## Pistes pour la suite

- Sessions persistantes (store SQLite/Redis) : pour l'instant, redémarrer le serveur déconnecte tout le monde
- Photos des produits et logos d'entreprise
- Vérification de l'e-mail et des entreprises (SIRET), mot de passe oublié
- Notifications e-mail pour les nouveaux messages
- Abonnements premium pour les fournisseurs (mise en avant)
