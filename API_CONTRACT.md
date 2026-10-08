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
| PUT | `/users/me/password` | `{currentPassword, newPassword}` | `204` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title`, `cover` facultatif | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | image WebP |
| PUT | `/tracks/:id/cover` | multipart : `cover` + JWT | `200 Track` |
| DELETE | `/tracks/:id/cover` | JWT | `204` |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

## TP2 — Couvertures des morceaux

Les URL ci-dessous sont relatives à `/api`. Toutes nécessitent un JWT valide et
une session non révoquée. Le propriétaire est déterminé par le JWT, jamais par
le formulaire. Les routes avec `:id` recherchent simultanément l'identifiant de
la piste et son propriétaire ; une piste absente ou appartenant à un autre
utilisateur renvoie `404`. Aucun paramètre de query n'est requis pour les images.

### Données publiques

`Track` expose `id`, `ownerId`, `title`, `originalName`, `mimeType`, `size`,
`createdAt` et `cover`. `cover` vaut `null` pour les anciennes pistes et les
pistes sans image. Sinon, il contient :

```json
{
  "mimeType": "image/webp",
  "size": 18420,
  "width": 800,
  "height": 600,
  "version": "identifiant-unique-de-la-couverture"
}
```

La version change à chaque remplacement. `size`, `width` et `height` décrivent
l'image transformée. Aucun nom de stockage, chemin disque ou contenu Base64
n'est exposé. La liste paginée et les réponses d'écriture utilisent le même
format public. Les paramètres et le format `Page<Track>` restent inchangés.

### Import et modification

- `POST /tracks` : multipart avec un fichier `audio` obligatoire (MP3, WAV,
  OGG ou M4A, non vide, 25 × 1024 × 1024 octets maximum), un champ texte `title`
  facultatif (nom du fichier utilisé par défaut) et au plus un fichier `cover`.
  Réponse `201 Track`. Sans `cover`, le contrat précédent continue à fonctionner.
  Si l'image est refusée, aucun morceau n'est créé. Les fichiers déjà écrits
  sont nettoyés en cas d'échec de validation ou de création en base.
- `PUT /tracks/:id/cover` : multipart contenant uniquement un fichier `cover`
  obligatoire. Ajoute ou remplace la couverture, sans modifier l'audio.
  Réponse `200 Track`. Une écriture conditionnelle sur la version observée au
  début de la requête évite d'écraser une modification concurrente : `409` si
  la piste ou sa couverture a changé pendant le traitement. L'ancienne image
  n'est supprimée qu'après l'enregistrement de la nouvelle référence.
- `DELETE /tracks/:id/cover` : aucun corps. Retire la couverture et son fichier,
  réponse `204` sans corps. Une piste existante sans couverture retourne aussi
  `204`. Une modification concurrente peut retourner `409`.
- `DELETE /tracks/:id` : aucun corps. Supprime la piste, son audio et sa couverture
  éventuelle ; réponse `204` sans corps. Les deux suppressions de fichiers sont
  tentées même si l'une échoue.

Contraintes des couvertures : JPEG, PNG ou WebP non animé, non vide, au maximum
5 × 1024 × 1024 octets et 16 millions de pixels. Le backend vérifie le format
décodé et refuse les SVG, les fichiers corrompus et les images animées. Sharp
applique l'orientation, réduit l'image à 800 × 800 maximum sans agrandir ni
recadrer, retire les métadonnées et encode en WebP (qualité 82).

Pour l'import combiné, Multer borne chaque fichier à 25 Mo pendant la réception,
puis le backend contrôle la limite de 5 Mo de l'image avant son décodage. Pour
`PUT`, la limite de réception est directement de 5 Mo. Le nombre de fichiers et
de champs est borné. Un titre multipart est limité à 4 096 octets.

Erreurs JSON `{ "message": "…" } : `400` fichier absent/invalide, image animée
ou trop grande en pixels, champs/fichiers inattendus, validation ; `401` JWT
absent/invalide/expiré/révoqué ; `404` piste inaccessible ; `409` modification
concurrente ; `413` fichier trop volumineux ; `500` échec interne ou nettoyage
incomplet ; `503` vérification de session indisponible. Après un `500`, actualiser
la liste : une suppression peut déjà être enregistrée en base. Un nettoyage
échoué après remplacement est journalisé sans annuler la nouvelle couverture.

### Lecture et stockage

`GET /tracks/:id/cover` retourne `200` avec le binaire WebP, `Content-Type:
image/webp`, `Cache-Control: private, no-store` et `X-Content-Type-Options:
nosniff`. Pas de corps de requête. Une couverture absente ou un fichier disparu
retourne `404` JSON. Les erreurs d'authentification et de serveur restent celles
décrites ci-dessus. Angular appelle cette route avec `HttpClient` et le JWT,
puis affiche le `Blob` via une `ObjectURL`, révoquée quand elle n'est plus utile.

MongoDB conserve seulement les métadonnées et le nom de stockage interne.
Les images sont dans `data/uploads/covers`, les fichiers en cours de traitement
dans `data/uploads/.incoming` et les audios dans `data/uploads`, relativement au
répertoire de lancement du backend. Ces dossiers sont ignorés par Git. Prévoir
un disque persistant et sauvegarder les fichiers avec MongoDB. Les compensations
gèrent les échecs ordinaires ; un arrêt brutal du processus ou un échec disque
peut laisser des fichiers orphelins à nettoyer (pas de transaction disque/MongoDB).

## Bonus — Changement de mot de passe (18 septembre 2026)

- Méthode et URL : `PUT /api/users/me/password`.
- Authentification : `Authorization: Bearer <token>` valide et non révoqué.
- Paramètres d’URL ou de requête : aucun.
- Corps JSON : `{ "currentPassword": "…", "newPassword": "…" }`. Les deux valeurs doivent être des chaînes ; le mot de passe actuel est obligatoire. Le nouveau doit contenir au moins 8 caractères (unités UTF-16), ne pas dépasser 72 octets UTF-8 et être différent de l’actuel. Les espaces ne sont pas supprimés. La confirmation est vérifiée uniquement dans le formulaire.
- Succès : `204 No Content`. Le nouveau hash bcrypt et l’incrément de version de session sont enregistrés dans une même opération conditionnelle sur l’ancien hash.
- Erreurs JSON `{message}` : `400` données invalides ou mot de passe inchangé ; `401` token absent, invalide, expiré ou révoqué ; `403` mot de passe actuel incorrect ; `409` modification concurrente ; `500` échec interne ; `503` impossibilité de vérifier la session en base.
- Un `403` sur cette route conserve la session pour permettre la correction.

Les JWT nouvellement émis incluent `sessionVersion`. Chaque route protégée compare cette version à celle du compte en base. Un ancien token sans version est traité comme une version 0, de même qu’un ancien compte sans ce champ. Après modification, les anciennes sessions sont refusées lors de leur prochaine requête protégée ; les requêtes déjà autorisées ne sont pas annulées. Le frontend efface sa session et affiche une confirmation sur `/login`, puis demande une nouvelle connexion. Tous les backends partageant la base doivent être mis à jour pour appliquer cette révocation.
