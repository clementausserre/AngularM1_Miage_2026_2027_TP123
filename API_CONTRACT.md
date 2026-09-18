# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

## Bonus — Changement de mot de passe (18 septembre 2026)

- Méthode et URL : `PUT /api/users/me/password`.
- Authentification : `Authorization: Bearer <token>` valide et non révoqué.
- Paramètres d’URL ou de requête : aucun.
- Corps JSON : `{ "currentPassword": "…", "newPassword": "…" }`. Les deux valeurs doivent être des chaînes ; le mot de passe actuel est obligatoire. Le nouveau doit contenir au moins 8 caractères (unités UTF-16), ne pas dépasser 72 octets UTF-8 et être différent de l’actuel. Les espaces ne sont pas supprimés. La confirmation est vérifiée uniquement dans le formulaire.
- Succès : `204 No Content`. Le nouveau hash bcrypt et l’incrément de version de session sont enregistrés dans une même opération conditionnelle sur l’ancien hash.
- Erreurs JSON `{message}` : `400` données invalides ou mot de passe inchangé ; `401` token absent, invalide, expiré ou révoqué ; `403` mot de passe actuel incorrect ; `409` modification concurrente ; `500` échec interne ; `503` impossibilité de vérifier la session en base.
- Un `403` sur cette route conserve la session pour permettre la correction.

Les JWT nouvellement émis incluent `sessionVersion`. Chaque route protégée compare cette version à celle du compte en base. Un ancien token sans version est traité comme une version 0, de même qu’un ancien compte sans ce champ. Après modification, les anciennes sessions sont refusées lors de leur prochaine requête protégée ; les requêtes déjà autorisées ne sont pas annulées. Le frontend efface sa session et affiche une confirmation sur `/login`, puis demande une nouvelle connexion. Tous les backends partageant la base doivent être mis à jour pour appliquer cette révocation.
