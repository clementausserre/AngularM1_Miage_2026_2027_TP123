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
