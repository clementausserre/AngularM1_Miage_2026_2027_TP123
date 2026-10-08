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
