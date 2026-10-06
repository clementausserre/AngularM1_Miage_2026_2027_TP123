# TP3 — Rapport des tests

Exécution du 6 octobre 2026, branche `tp3-finalisation`. Aucun test ne dépend d'un backend lancé ni de MongoDB :
- **frontend** : services réels branchés sur `HttpTestingController`, ou composants avec un `TrackService` / `MatSnackBar` simulés ;
- **backend** : serveur Express et JWT réels, accès Mongoose simulés avec `t.mock.method`.

| Commande | Résultat observé |
|---|---|
| `cd frontend-starter && npm test` (`vitest run tests`) | **8 fichiers, 79 tests réussis, 0 échec** |
| `cd backend && npm test` (`node --test`) | **8 tests réussis, 0 échec** |
| `cd frontend-starter && npm run build` | **Compilation réussie** (`Application bundle generation complete`) |

## 1. Tests HTTP des services — `frontend-starter/tests/http-services.spec.ts` (nouveau)

Ces tests vérifient l'URL, la méthode, les paramètres et le corps de chaque requête. `httpMock.verify()` garantit qu'aucune requête inattendue n'est partie.

| Test | Résultat attendu | Observé |
|---|---|---|
| `AuthService.login()` envoie `POST /api/auth/login` | Méthode POST, corps `{ email, password }` ; après la réponse, token dans le signal `token` et dans `localStorage['gpc_token']`, utilisateur dans `currentUser` | ✅ |
| `AuthService.login()` après un 401 | Erreur 401 propagée ; aucun token stocké | ✅ |
| `TrackService.list(2, 5)` | `GET /api/tracks?page=2&limit=5`, page renvoyée telle quelle | ✅ |
| `TrackService.delete('abc')` | `DELETE /api/tracks/abc`, sans corps ; la réponse 204 termine l'observable | ✅ |
| `TrackService.delete()` sur une piste absente ou étrangère | Erreur 404 propagée au composant | ✅ |
| `TrackService.upload()` | `POST /api/tracks`, `reportProgress: true`, `FormData` avec `audio` (fichier) et `title` ; événements reçus dans l'ordre `Sent` → `UploadProgress (3/5)` → `Response` | ✅ |

## 2. Mission 5 — Suppression — `frontend-starter/tests/tracks-page.spec.ts`

| Test | Résultat attendu | Observé |
|---|---|---|
| Confirmation obligatoire, annulation possible | `showModal()` appelé ; aucun `delete` avant confirmation ni après annulation | ✅ |
| Suppression réussie | `delete` appelé **une seule fois** malgré un double clic ; annulation bloquée pendant l'envoi ; audio en cours libéré (`revokeObjectURL`) ; retour à la page 1 si la page devient vide puis rechargement ; dialogue fermé, focus replacé ; SnackBar « « Blues » a été supprimé. » | ✅ |
| Échec réseau (statut 0) | SnackBar « Serveur inaccessible… » ; carte et confirmation conservées pour réessayer ; pas de rechargement | ✅ |
| Piste déjà supprimée ou appartenant à un autre (404) | SnackBar « introuvable » ; confirmation fermée ; liste rechargée | ✅ |

## 3. Mission 6 — Progression de l'upload — `frontend-starter/tests/tracks-page.spec.ts`

| Test | Résultat attendu | Observé |
|---|---|---|
| Fichier invalide (vide, `.txt`, > 25 Mo) | Message d'erreur, aucune requête envoyée | ✅ (3 cas) |
| Upload unique et réinitialisation | Un seul envoi malgré deux soumissions ; titre nettoyé ; champ fichier vidé ; retour à la page 1 | ✅ |
| Progression | `Sent` → aucun pourcentage ; 6/10 → 60 % ; 10/10 → 100 % mais pas encore de succès ; succès seulement à la réponse du serveur | ✅ |
| Taille inconnue, erreur puis nouvel essai | Pourcentage `null` si `total` est absent ; après une erreur, progression effacée, sélection conservée ; nouvel envoi possible | ✅ |
| Échec serveur 400 | « Import refusé… », sélection conservée, titre réactivé | ✅ |

## 4. Tests backend — `backend/test/security.test.js` (nouveau, extension facultative)

| Test | Résultat attendu | Observé |
|---|---|---|
| Sans JWT, sans préfixe `Bearer`, JWT invalide, JWT signé avec un autre secret | 401 dans les quatre cas, MongoDB jamais interrogé | ✅ |
| Upload sans fichier | 400 « Fichier audio requis », aucun `Track.create` | ✅ |
| Upload `text/plain` | 400 « Format audio non accepté », aucun `Track.create` | ✅ |
| `GET /api/tracks?page=2&limit=3` | Requête Mongo `{ ownerId }`, tri `createdAt` décroissant, `skip(3)`, `limit(3)`, sans `storedName` ; réponse `page: 2, limit: 3, total: 7, pages: 3`, `id` à la place de `_id` | ✅ |
| `limit=999` | Plafonné à 20 | ✅ |
| Piste d'un autre utilisateur | 404 sur `GET /api/tracks/:id/audio` et sur `DELETE /api/tracks/:id` ; filtre envoyé à Mongo `{ _id, ownerId: <utilisateur du JWT> }` | ✅ |

Ces tests s'ajoutent à `api.test.js` (santé, schémas) et à `password.test.js` (changement de mot de passe), qui passent toujours.

## 5. Tests existants non modifiés

Ils passent tous : `auth-forms`, `auth-interceptor` (l'en-tête `Authorization: Bearer …` est bien ajouté), `auth-navigation` (le guard redirige un visiteur sans token), `auth-return-url`, `password-form`, `profile-page` et les tests audio de `tracks-page`.

## 6. Preuves Network — à compléter par le binôme

Non réalisées : le backend ne pouvait pas se connecter à MongoDB Atlas, car l'IP n'était pas autorisée.

- [ ] Capture d'une requête `DELETE /api/tracks/:id` → 204 après confirmation (masquer le token)
- [ ] Capture de l'upload `POST /api/tracks` (multipart) et de la barre de progression
- [ ] Console : aucune erreur inattendue, aucun mot de passe ni JWT affiché
