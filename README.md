# Guitar Practice Cloud — package étudiant

Ce dépôt contient les ressources des TP : `backend/` (Express, Mongoose,
MongoDB Atlas) et `frontend-starter/` (Angular), ainsi que les sujets, les
documents utiles et nos rendus.

## Sommaire

- [Prérequis](#prérequis)
- [Démarrer le backend](#démarrer-le-backend) et [le frontend](#démarrer-le-frontend)
- [Tests et build](#tests-et-build)
- [TP1 — Authentification et profil](#tp1--authentification-et-profil)
- [TP2 — Bibliothèque, upload et lecture audio](#tp2--bibliothèque-upload-et-lecture-audio)
- [TP3 — Suppression, progression d'upload et tests](#tp3--suppression-progression-dupload-et-tests)
- [TD4 — Lecteur permanent, amis et playlists](#td4--lecteur-permanent)
- [Rendus et documents de travail](#rendus)

## Prérequis

- Node.js 22 ou plus récent ;
- un compte MongoDB Atlas par binôme ;
- Git et un navigateur récent ;
- un IDE de qualité ;
- recommandé : un abonnement à un assistant IA (voir
  [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md)).

Consulter [ATLAS_SETUP.md](ATLAS_SETUP.md) pour créer la base de données.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
```

Renseigner dans `.env` l’URI MongoDB Atlas et le secret JWT. Ne jamais publier
ce fichier ni copier un secret dans le code Angular.

`JWT_SECRET` est obligatoire : le backend refuse de démarrer s'il est absent,
vide ou égal à l'ancienne valeur de secours. Choisir un secret aléatoire privé.

```bash
npm install
npm start
```

Le backend écoute normalement sur `http://localhost:3000`. Si Atlas refuse la
connexion, vérifier que votre adresse IP est autorisée dans **Network Access**.

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le compte de démonstration est
`demo@example.com` / `Demo1234!`. Le proxy (`proxy.conf.json`) redirige `/api`
vers `http://localhost:3000`.

Après récupération de nouveaux changements, relancer `npm install` dans
`backend/` et `frontend-starter/`, puis redémarrer les deux serveurs.

## Tests et build

Aucun test ne nécessite un backend lancé ni MongoDB : les requêtes HTTP sont
simulées côté frontend et la persistance Mongoose est simulée côté backend.

```bash
cd backend && npm test               # node --test : serveur Express et JWT réels
cd frontend-starter && npm test      # ng test --watch=false : tous les tests Angular
cd frontend-starter && npm run test:vitest   # vitest seul, sans covers.spec.ts
cd frontend-starter && npm run build
```

Le détail des tests, avec résultats attendus et observés, est dans
[TP3-Rendu/Rapport_Tests.md](TP3-Rendu/Rapport_Tests.md).

## TP1 — Authentification et profil

Sujet : [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md). Flux étudié :
composant → `AuthService` → `HttpClient` → API Express → MongoDB
([schéma annoté du flux de connexion](schema-connexion.svg)).

- **Inscription et connexion** (`/register`, `/login`) : Reactive Forms,
  messages d'erreur sous les champs après sortie du champ ou soumission, focus
  sur le premier champ invalide, bouton Afficher/Masquer le mot de passe,
  blocage des doubles soumissions, erreurs HTTP traduites en messages clairs.
  Les mots de passe font 8 caractères minimum et 72 octets UTF-8 maximum, avec
  la même validation dans le formulaire et l'API.
- **Session** : le JWT est stocké dans `localStorage` (jamais affiché ni
  journalisé) ; l'utilisateur connecté est dans le Signal `currentUser`.
  Redirection après connexion ou inscription, bouton Déconnexion qui nettoie
  l'état local.
- **Guards et intercepteur** : `authGuard` protège les pages privées et
  mémorise la page demandée ; `guestGuard` empêche d'ouvrir `/login` et
  `/register` une fois connecté. `auth.interceptor.ts` ajoute
  `Authorization: Bearer …` ; un `401` sur une route protégée efface la session
  et renvoie vers `/login` avec un message « session expirée », puis vers la
  page initiale après reconnexion.
- **Profil** (`/profile`) : chargement automatique via `GET /api/users/me`,
  modification du nom (2 caractères minimum) via `PUT /api/users/me`, bouton
  Annuler, messages de succès et d'erreur.
- **Bonus — changement de mot de passe** : section Sécurité du profil,
  `PUT /api/users/me/password` (mot de passe actuel exigé, hachage bcrypt).
  Les anciens JWT sont ensuite refusés et l'utilisateur doit se reconnecter.
- Un changement de compte ou une déconnexion dans un autre onglet recharge la
  page pour effacer les données de l'ancien compte.

Fichiers clés : `components/login-page`, `register-page`, `profile-page`,
`password-form`, `shared/services/auth.service.ts`, `shared/guards/`,
`shared/interceptors/auth.interceptor.ts`.

## TP2 — Bibliothèque, upload et lecture audio

Sujet : [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md).

- **Pagination serveur** (`/tracks`) : `TrackService.list(page, limit)` envoie
  `GET /api/tracks?page=…&limit=5` à chaque changement de page ; rien n'est
  découpé localement. Signaux `tracks`, `page`, `pages`, `loading` et `error`,
  affichage avec `@for`, `@empty` et `@if`, boutons Précédent/Suivant désactivés
  aux bornes, bouton Réessayer en cas d'erreur.
- **Upload** : `FormData` avec `audio` et `title`. Avant l'envoi, le frontend
  refuse les fichiers vides, de plus de 25 Mo ou d'un format autre que MP3,
  WAV, OGG ou M4A ; le backend refait ces contrôles. Pendant l'envoi les
  contrôles sont désactivés ; après succès le formulaire est vidé et la page 1
  rechargée ; une erreur serveur conserve la sélection.
- **Cards** responsives et accessibles : couverture, titre, nom original,
  format, taille en Ko/Mo, date d'ajout, actions.
- **Lecture authentifiée** : `GET /api/tracks/:id/audio` via `HttpClient`
  (l'intercepteur ajoute le JWT, ce que ne ferait pas une URL placée dans
  `src`) → `Blob` → `URL.createObjectURL` → `<audio>`. L'URL est révoquée quand
  le morceau change, à la fermeture du lecteur et à la déconnexion. Les
  fichiers audio ne sont téléchargés qu'au moment de la lecture.

### Avancé — Couvertures

Le formulaire d'import accepte une couverture facultative JPEG, PNG ou WebP
(5 Mo maximum, non animée). Chaque card permet aussi d'ajouter, remplacer ou
retirer une couverture. L'aperçu reste local jusqu'à l'enregistrement.
Le serveur transforme les images en WebP de 800 pixels maximum et les conserve
dans `backend/data/uploads/covers` lorsque le backend est lancé depuis son
dossier. Seul le propriétaire peut les télécharger
(`/api/tracks/:id/cover`). Les anciennes pistes restent compatibles et
affichent un visuel par défaut. Sharp est utilisé côté serveur.

Les modifications de couverture actualisent également le lecteur et les autres
onglets. Dans Network, vérifier le multipart `audio`/`title`/`cover` et les
requêtes privées `/api/tracks/:id/cover`.

Non réalisés (facultatifs) : Paginator Angular Material, pagination avec
`aggregate-paginate-v2`, filtre par titre.

## TP3 — Suppression, progression d'upload et tests

Sujet : [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md).

- **Mission 5 — Suppression** : bouton Supprimer sur chaque card, confirmation
  dans un `<dialog>`, signal `deleting` contre les doubles clics, messages dans
  un `MatSnackBar`. L'appel passe par `TrackService.delete()` →
  `DELETE /api/tracks/:id`. Après succès la liste est rechargée (page
  précédente si la page devient vide) et le lecteur s'arrête si le morceau
  supprimé était en cours. Un `404` (piste déjà supprimée dans un autre onglet
  ou appartenant à un autre utilisateur) ferme la confirmation et recharge la
  liste ; une erreur réseau la garde ouverte pour réessayer. La vraie
  protection reste le backend, qui vérifie le JWT et filtre sur `ownerId`.
- **Mission 6 — Progression de l'upload** : `observe: 'events'` et
  `reportProgress: true`. États distincts : aucun envoi, envoi avec
  pourcentage (`loaded / total`, indéterminé si `total` est inconnu),
  finalisation à 100 %, réussite à la réponse du serveur, échec.
- **Mission 7 — Tests** :
  - frontend : `tests/http-services.spec.ts` (URL, méthode, paramètres et
    corps de `AuthService.login()`, `TrackService.list()`, `delete()` et
    `upload()` avec `HttpTestingController`), `tests/tracks-page.spec.ts`
    (suppression et progression), plus les tests d'intercepteur et de guard ;
  - backend (extension facultative) : `backend/test/security.test.js` —
    `401` sans JWT ou avec un JWT invalide, upload sans fichier, type MIME
    refusé, pagination, accès interdit à la piste d'un autre utilisateur.
- **Amélioration — synchronisation entre onglets** : après un ajout ou une
  suppression, `LibrarySyncService` prévient les autres onglets via
  `BroadcastChannel` ; la liste se recharge aussi au retour sur un onglet.

## TD4 — Lecteur permanent

Le lecteur apparaît en bas de l'application après sélection d'un morceau et
reste présent entre la bibliothèque et le profil. Les contrôles natifs du
navigateur permettent lecture/pause, déplacement dans le morceau et volume
(selon le navigateur, le volume mobile se règle avec les boutons du téléphone).
« Fermer » arrête la lecture. Sélectionner à nouveau le même morceau reprend
la lecture sans télécharger le fichier une seconde fois.

`PlayerService` conserve le morceau et son URL Blob en mémoire ;
`AudioPlayerComponent`, placé hors du `router-outlet`, conserve l'élément audio.
Les fichiers restent sur le serveur et sont téléchargés par l'API authentifiée
existante. Aucun fichier audio n'est ajouté au localStorage. La navigation
conserve la lecture, mais un rechargement complet de la page la réinitialise.
La déconnexion, un changement de session ou la suppression du morceau arrêtent
le lecteur et libèrent l'URL Blob. Les pochettes restent synchronisées, y
compris lorsqu'on consulte le profil.

À la fin d'un morceau, le lecteur charge automatiquement le suivant dans
l'ordre affiché par la bibliothèque, y compris sur les pages suivantes. Il
s'arrête après le dernier morceau, sans revenir au premier. Les métadonnées de
la bibliothèque sont relues à chaque transition ; seul l'audio du morceau
suivant est téléchargé. Une erreur réseau permet de réessayer l'enchaînement
depuis le lecteur.

## TD4 — Amis

Pour préparer ou vérifier les collections dans la base configurée par le backend :

```bash
cd backend
npm run db:friends
```

Cette commande crée les index manquants sans supprimer les données ni changer
les comptes. Elle affiche uniquement les noms des collections, leurs index et
le nombre de documents, jamais l'URI de connexion ni les codes personnels.
Vérification effectuée le 9 octobre 2026 sur la base configurée : collections
`friendcodes` et `friendships` accessibles, index uniques présents. Aucun faux
compte ni fausse relation n'a été ajouté pour cette vérification.

L'onglet **Amis** permet de partager son code personnel, d'ajouter quelqu'un
par son code, de gérer les demandes reçues/envoyées et de retirer un ami avec
confirmation. Le code est aussi disponible dans le profil avec un bouton Copier
(copie manuelle possible si le navigateur refuse le presse-papiers).

Les noms actuels restent inchangés et peuvent être identiques. Les codes
`GPC-XXXX-XXXX` sont générés par le serveur au premier affichage et stockés dans
`friendcodes`. Les relations sont dans `friendships`. Les index uniques sont
préparés au démarrage pour empêcher doublons et collisions. **Redémarrer le
backend après cette mise à jour** ; aucune migration manuelle des comptes ni
nouvelle dépendance n'est nécessaire.

Pour essayer à deux : chacun ouvre son profil, partage son code, puis le premier
recherche le code du second et confirme l'envoi. Le second ouvre **Amis →
Demandes → Reçues**, actualise si nécessaire et accepte. Pour deux comptes sur
un seul ordinateur, utiliser deux profils de navigateur ou une fenêtre privée :
les onglets ordinaires partagent la même session.

La pastille compte les demandes reçues et se rafraîchit à la navigation ou au
retour dans l'onglet. Les listes ont un bouton Actualiser ; elles ne sont pas
encore en temps réel. Être amis ne donne aucun accès automatique aux morceaux.
Le contrat détaillé est dans `API_CONTRACT.md`.

## TD4 — Playlists personnelles

- Ouvrir **Playlists → Nouvelle playlist** pour créer une sélection.
- Dans la bibliothèque, cliquer sur **Ajouter à une playlist** sous un morceau,
  puis choisir une playlist (ou en créer une dans cette fenêtre).
- Ouvrir la playlist pour renommer, retirer des morceaux et modifier leur ordre
  avec les flèches. Les commandes restent utilisables au clavier et sur mobile.
- **Tout lire** lance son ordre ; cliquer sur un morceau commence à cet endroit.
  Le lecteur permanent garde la file pendant la navigation et s'arrête à la fin.
- Supprimer une playlist conserve les morceaux dans la bibliothèque.

Les playlists sont privées et stockées dans MongoDB, avec au maximum 200 morceaux
distincts chacune. Une édition concurrente affiche un message demandant une
actualisation. L'ordre du lecteur est une copie prise au lancement : relancer
la playlist pour prendre en compte une modification. Les morceaux supprimés
de la bibliothèque ne figurent plus dans les playlists affichées.

Redémarrer le backend pour charger les nouvelles routes. La collection et
l'index sont préparés au démarrage ; vérification manuelle possible avec
`cd backend` puis `npm run db:playlists`. Cette préparation a été exécutée sur
la base configurée le 9 octobre 2026 : collection `playlists` accessible et index
sur propriétaire/date/identifiant présent, sans création de données de test.

## Rendus

- [TP1-Rendu/Questions.md](TP1-Rendu/Questions.md) : différence entre Signal et
  `localStorage` ;
- [TP1-Rendu/Capture_Network/](TP1-Rendu/Capture_Network/) : requête de
  connexion (en-têtes et réponse) ;
- [schema-connexion.svg](schema-connexion.svg) : schéma annoté du flux de
  connexion ;
- [TP2-Rendu/Questions.md](TP2-Rendu/Questions.md) : choix `Blob`/`ObjectURL`,
  flux d'upload et de lecture, questions sur la mémoire, le buffering et le
  streaming ;
- [TP3-Rendu/Questions.md](TP3-Rendu/Questions.md) : sécurité de la
  suppression, progression d'upload et questions de la restitution orale ;
- [TP3-Rendu/Rapport_Tests.md](TP3-Rendu/Rapport_Tests.md) : rapport des tests ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : rapport d'usage de l'IA pour
  chaque mission.

## Documents de travail

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : missions des trois séances ;
- [API_CONTRACT.md](API_CONTRACT.md) : endpoints, authentification et formats échangés ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : modèle de compte rendu ;
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : utiliser correctement un assistant IA, quel que soit l’outil choisi.

Le backend contient également ses propres consignes pour les assistants :
[`backend/AGENTS.md`](backend/AGENTS.md), [`backend/CLAUDE.md`](backend/CLAUDE.md),
[`backend/GEMINI.md`](backend/GEMINI.md) et
[`backend/best-practices.md`](backend/best-practices.md). Elles couvrent
Node.js, Express, Mongoose, MongoDB, l’authentification, Multer, les uploads,
les logs et les tests.

Les fichiers audio présents dans `frontend-starter/fichiers-audio-de-test/` sont
des fixtures fournies pour les essais. Aucun fichier uploadé, dossier de
dépendances (`node_modules`), fichier `.env` ou identifiant local n'est inclus.
