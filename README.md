# Guitar Practice Cloud — package étudiant

Ce dépôt contient uniquement les ressources nécessaires aux trois TP :
`backend/` et `frontend-starter/`, ainsi que les sujets et documents utiles.

## Prérequis

- Node.js 22 ou plus récent ;
- un compte MongoDB Atlas par binôme ;
- Git et un navigateur récent.
- Un IDE de qualité
- Recommandé : un abonnement à un 

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

Le backend écoute normalement sur `http://localhost:3000`.

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le compte de démonstration est
`demo@example.com` / `Demo1234!`.

## Documents de travail

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : missions des trois séances ;
- [API_CONTRACT.md](API_CONTRACT.md) : endpoints, authentification et formats échangés ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : modèle de compte rendu.
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

## Couvertures — TP2

Le formulaire d'import accepte une couverture facultative JPEG, PNG ou WebP
(5 Mo maximum, non animée). Chaque card permet aussi d'ajouter, remplacer ou
retirer une couverture. L'aperçu reste local jusqu'à l'enregistrement.
Le serveur transforme les images en WebP de 800 pixels maximum et les conserve
dans `backend/data/uploads/covers` lorsque le backend est lancé depuis son
dossier. Seul le propriétaire peut les télécharger. Les anciennes pistes
restent compatibles et affichent un visuel par défaut.

Après récupération des changements, exécuter `npm install` dans `backend/`
et `frontend-starter/`, puis redémarrer le backend et le frontend. Sharp est
utilisé côté serveur ; jsdom permet d'exécuter les tests Angular.

Vérification automatisée : `npm test` dans chaque dossier, puis `npm run build`
dans `frontend-starter/`. Les tests backend utilisent de vrais uploads HTTP et
un disque temporaire avec une persistance MongoDB simulée, sans toucher Atlas.
Les tests frontend vérifient notamment le JWT, les aperçus et la révocation des
URL temporaires. Dans le navigateur, vérifier dans Network le multipart
`audio`/`title`/`cover` et les requêtes privées `/api/tracks/:id/cover`.

Les modifications de couverture actualisent également le lecteur et les autres
onglets. Un changement de compte ou une déconnexion dans un autre onglet provoque
un rechargement complet pour effacer les données et la lecture de l'ancien compte.
Les mots de passe créés ou modifiés sont limités à 72 octets UTF-8 (minimum 8
caractères), avec la même validation dans le formulaire et l'API.
# Lecteur permanent — TD4

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
compris lorsqu'on consulte le profil. Cette base pourra ensuite accueillir
les playlists. À la fin d'un morceau, le lecteur charge automatiquement le
suivant dans l'ordre affiché par la bibliothèque, y compris sur les pages
suivantes. Il s'arrête après le dernier morceau, sans revenir au premier.
Les métadonnées de la bibliothèque sont relues à chaque transition ; seul
l'audio du morceau suivant est téléchargé. Une erreur réseau permet de
réessayer l'enchaînement depuis le lecteur.
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
