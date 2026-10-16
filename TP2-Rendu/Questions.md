# TP2 — Réponses aux questions

Chemins frontend relatifs à `frontend-starter/src/app/`, chemins backend relatifs à `backend/src/`.

## 1. Pagination (mission 2)

Flux : `TracksPageComponent.load()` → `TrackService.list(page, limit)` (`shared/services/track.service.ts:11`) → `HttpClient.get('/api/tracks', { params: { page, limit } })` → `GET /api/tracks?page=2&limit=5`.

Angular construit lui-même la chaîne de requête à partir de l'objet `params`. Chaque clic sur Précédent ou Suivant appelle `go(page)`, qui met à jour le Signal `page` puis relance `load()` : une nouvelle requête part à chaque changement de page.

Côté serveur (`app.js:232`), Mongoose applique `skip((page - 1) * limit)` et `limit(limit)` et renvoie `{ items, page, limit, total, pages }`. La limite est plafonnée à 20.

Pourquoi ne pas tout récupérer pour découper dans Angular ?
- Avec 1 000 morceaux, on transférerait et garderait en mémoire 1 000 objets pour en afficher 5.
- MongoDB sait trier et paginer efficacement.
- Le nombre total de pages vient du serveur, qui seul connaît le vrai total.

## 2. Où se trouve chaque étape de l'upload et de la lecture ?

| Étape | Fichier et méthode |
|---|---|
| Choix du fichier | `components/tracks-page/tracks-page.ts` → `choose(event)` (ligne 68), validé par `fileError(file)` (ligne 58) |
| Construction du `FormData` | `shared/services/track.service.ts` → `upload()` (ligne 17) : `audio`, `title`, et `cover` en option |
| Appel HTTP d'upload | même méthode : `http.post('/api/tracks', body, { observe: 'events', reportProgress: true })` |
| Récupération du `Blob` | `TrackService.audio(id)` (ligne 28) : `GET /api/tracks/:id/audio` avec `responseType: 'blob'` |
| Création de l'`ObjectURL` | `shared/services/player.service.ts` → `loadTrack()` : `URL.createObjectURL(blob)` |
| Affectation au lecteur | `components/audio-player/audio-player.html` : `<audio [attr.src]="player.audioUrl() \|\| null">` |
| Révocation de l'ancienne URL | `PlayerService.releaseAudio()` : `URL.revokeObjectURL(url)`, appelée quand le morceau change, à la fermeture du lecteur, à la déconnexion et à la suppression du morceau |

Lors du TP2, la lecture était gérée directement dans `TracksPageComponent`. Le TD4 l'a déplacée dans `PlayerService`, pour que la musique continue entre les pages. Le flux reste le même.

**Flux d'upload :** composant (`upload()`) → `TrackService.upload()` → `HttpClient` → intercepteur (ajout du JWT) → `POST /api/tracks` en multipart → Multer → validation → fichier sur disque et métadonnées dans MongoDB → réponse `201` avec la piste.

**Flux de lecture :** API → octets du fichier → `HttpClient` les assemble en `Blob` → `URL.createObjectURL()` donne une URL locale `blob:http://localhost:4200/…` → `<audio>` lit cette URL.

## 3. Pourquoi une URL placée directement dans `src` ne reçoit pas le JWT

`shared/interceptors/auth.interceptor.ts` ajoute `Authorization: Bearer <token>` à toutes les requêtes `/api/…` protégées. Mais un intercepteur Angular ne voit que les requêtes envoyées par `HttpClient`.

Avec `<audio src="/api/tracks/123/audio">`, c'est le navigateur qui télécharge le fichier, sans passer par Angular : aucun en-tête `Authorization` n'est ajouté. Le backend répond alors `401`.

Mettre le token dans l'URL (`?token=…`) serait une mauvaise solution : il apparaîtrait dans l'historique, les logs du serveur et les captures d'écran.

On télécharge donc le fichier avec `HttpClient` (donc avec le JWT), puis on donne au lecteur une URL locale qui ne nécessite plus d'authentification.

## 4. Contrôles backend de l'upload et vérifications frontend

Contrôles backend (`middleware/track-upload.js` et `routes/track-covers.js:25`) :
- `multer.fields([{ name: 'audio' }, { name: 'cover' }])` : le fichier doit arriver dans le champ `audio` ;
- `fileFilter` : types MIME acceptés `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`. Sinon `400` « Format audio non accepté » ;
- `limits.fileSize: 25 * 1024 * 1024` : au-delà, Multer lève `LIMIT_FILE_SIZE`, transformée en `413` « Le fichier audio dépasse la limite de 25 Mo. » (`app.js:364`) ;
- pas de fichier : `400` « Fichier audio requis. » ; fichier vide refusé dans `keepAudio()` ;
- `title` est lu dans `req.body.title`. S'il est vide, c'est le nom original du fichier qui est utilisé.

Le frontend construit bien le `FormData` avec exactement `audio` et `title` (plus `cover`, facultatif). C'est vérifié par le test `TrackService.upload()` de `tests/http-services.spec.ts`.

Vérifications ajoutées côté frontend avant l'appel HTTP (`fileError()`) : fichier non vide, 25 Mo maximum, extension `.mp3/.wav/.ogg/.m4a` et type MIME de la même liste que le backend. En cas d'échec, un message clair s'affiche et aucune requête ne part.

**Pourquoi la validation frontend ne remplace jamais celle du backend.** La validation frontend évite d'envoyer 25 Mo pour rien et donne un retour immédiat. Mais le code Angular s'exécute chez l'utilisateur : il peut être modifié, désactivé, ou contourné en appelant l'API directement (curl, Postman). Seul le backend est sous notre contrôle, c'est donc lui qui doit refuser les fichiers invalides.

## 5. Choix du `Blob` et de l'`ObjectURL`

- **`Blob`** : objet binaire en mémoire dans le navigateur. Avec `responseType: 'blob'`, `HttpClient` renvoie le fichier audio sous cette forme au lieu d'essayer de le lire comme du JSON.
- **`ObjectURL`** : `URL.createObjectURL(blob)` crée une URL `blob:…` qui pointe vers ce Blob en mémoire. L'élément `<audio>` sait lire une URL, pas un objet JavaScript : c'est le pont entre les deux.

On a fait ce choix parce que c'est la seule façon simple de lire un fichier protégé par JWT : le téléchargement passe par `HttpClient` et l'intercepteur, puis le lecteur utilise une URL qui ne demande plus d'authentification.

Le prix à payer : le fichier entier doit être téléchargé avant de commencer la lecture, et il occupe la mémoire tant que l'URL n'est pas révoquée.

## 6. Blob téléchargé, buffering du navigateur et streaming serveur

- **Téléchargement complet d'un `Blob`** (notre cas) : `HttpClient` attend la fin de la réponse, puis émet le Blob entier. La lecture ne peut commencer qu'après.
- **Buffering du navigateur** : avec `<audio src="https://…">`, le navigateur télécharge une partie du fichier, commence à jouer, puis continue en arrière-plan. Il peut aussi demander seulement certains morceaux du fichier quand on avance dans la piste (requêtes `Range`).
- **Streaming côté serveur** : le serveur envoie le fichier par morceaux depuis le disque, sans tout charger en mémoire. Cela concerne le serveur ; le client peut quand même attendre la fin, ce que fait `HttpClient`.

## 7. Questions sur la mémoire, le buffering et le streaming

**Le backend envoie-t-il le fichier entier en mémoire ou peut-il l'envoyer progressivement depuis le disque ?**

Il l'envoie progressivement. La route `GET /api/tracks/:id/audio` (`app.js:295`) vérifie le propriétaire, puis appelle `res.sendFile(audioPath)` (ligne 310). `sendFile` ouvre un flux de lecture sur le fichier et l'envoie par morceaux : le serveur ne charge jamais tout le fichier en mémoire. `sendFile` gère aussi les requêtes `Range` (réponse `206 Partial Content`).

**Avec `HttpClient` et `responseType: "blob"`, à quel moment le composant reçoit-il le fichier ?**

À la fin du téléchargement. `HttpClient` assemble toute la réponse, puis émet une seule valeur : le Blob complet. Avant cela, le lecteur n'a rien à lire. C'est pour ça que l'interface affiche « Téléchargement du morceau… » (`audioLoading`).

**Si la bibliothèque contient 100 morceaux, les 100 fichiers sont-ils chargés en mémoire dès l'affichage de la liste ?**

Non. `GET /api/tracks` ne renvoie que les métadonnées JSON, et seulement 5 par page : la route exclut le nom du fichier stocké et ne lit jamais le fichier audio. Le seul appel à `TrackService.audio()` est dans `PlayerService.loadTrack()`, déclenché par un clic sur Lire, la fin d'un morceau ou une playlist. De plus, `releaseAudio()` révoque l'URL précédente avant chaque nouveau chargement : il n'y a jamais qu'un seul Blob audio en mémoire à la fois.

**Quelle différence y aurait-il avec 100 éléments `<audio>` utilisant directement une URL HTTP ?**

1. Ça ne marcherait pas avec notre API : ces requêtes n'auraient pas l'en-tête `Authorization`, donc 100 réponses `401`.
2. Sans protection, le navigateur pourrait précharger chaque lecteur (selon `preload`) : jusqu'à 100 requêtes au chargement de la page, de la bande passante et de la mémoire gaspillées.
3. En revanche, chaque lecteur pourrait commencer à jouer avant la fin du téléchargement et se déplacer dans la piste sans tout télécharger, ce que notre Blob ne permet pas.

**Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?**

Tant que l'URL `blob:` existe, le navigateur garde le Blob en mémoire, même si plus aucune variable ne le référence : le ramasse-miettes ne peut pas le libérer. Sans `URL.revokeObjectURL()`, chaque morceau écouté resterait en mémoire jusqu'à la fermeture de l'onglet, soit plusieurs Mo par morceau.

On révoque donc l'ancienne URL dans `releaseAudio()` :
- avant chaque nouveau morceau ;
- à la fermeture du lecteur ;
- à la déconnexion ;
- quand le morceau en cours est supprimé.

Le test « révocation des ObjectURL » de `tests/tracks-page.spec.ts` le vérifie.

## 8. Checkpoint Network — ce qu'on doit observer

| Vérification | Ce qu'on voit dans Network |
|---|---|
| Changement de page | `GET /api/tracks?page=2&limit=5` puis `page=1` |
| Upload multipart | `POST /api/tracks`, `Content-Type: multipart/form-data; boundary=…`, parties `audio` (binaire) et `title` |
| Réponse de lecture | `GET /api/tracks/:id/audio` → `200`, `Content-Type: audio/mpeg` (ou ogg…), type « media » ou « fetch » |
| Fichier invalide | `400` avec message affiché. Avec un `.txt` renommé en `.mp3`, la validation frontend bloque déjà sur le type MIME |
| Propriétaire uniquement | Avec le compte B, `GET /api/tracks/<id du compte A>/audio` → `404`. Le backend filtre sur `{ _id, ownerId }` et ne dit pas si la piste existe |

Captures à ajouter dans `TP2-Rendu/Capture_Network/`, en masquant l'en-tête `Authorization`.
