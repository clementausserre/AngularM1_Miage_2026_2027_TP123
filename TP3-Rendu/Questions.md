# TP3 — Réponses aux questions

Chemins frontend relatifs à `frontend-starter/src/app/`, chemins backend relatifs à `backend/src/`.

## Mission 5 — Pourquoi le guard Angular et l'interface ne suffisent pas à sécuriser la suppression

Le guard (`shared/guards/auth.guard.ts`) vérifie seulement qu'un token est présent dans le navigateur avant d'afficher `/tracks`. Il ne vérifie ni sa signature, ni son expiration, ni à qui appartiennent les pistes. L'interface, elle, n'affiche le bouton Supprimer que sur les pistes de l'utilisateur.

Tout cela s'exécute dans le navigateur, donc sous le contrôle de l'utilisateur :
- il peut modifier le code ou le `localStorage` depuis les DevTools ;
- il peut surtout appeler l'API sans Angular, par exemple `curl -X DELETE http://localhost:3000/api/tracks/<id>`, avec ou sans token, et avec l'identifiant de n'importe quelle piste.

La vraie protection est dans le backend, sur la route `DELETE /api/tracks/:id` (`app.js:325`) :
1. le middleware `auth` (`app.js:32`) exige `Authorization: Bearer <jwt>`, et `jwt.verify()` contrôle la signature (secret connu du serveur seul) et l'expiration. Sinon : `401` ;
2. il vérifie aussi `sessionVersion` : un token émis avant un changement de mot de passe est refusé ;
3. la suppression utilise `Track.findOneAndDelete({ _id: req.params.id, ownerId: req.auth.sub })`. L'identifiant de l'utilisateur vient du JWT vérifié, jamais d'un champ envoyé par le client. Une piste qui appartient à un autre utilisateur ne correspond pas au filtre : réponse `404`, sans dire si la piste existe.

Le guard et l'interface améliorent seulement l'expérience utilisateur : on ne montre pas une page inutilisable, ni un bouton qui échouerait.

## Mission 6 — Pourquoi un upload avec progression ne se traite pas comme une requête à réponse unique

Une requête HTTP classique (`http.get<Track[]>(…)`) émet **une seule valeur**, la réponse finale, puis se termine : il suffit d'un `next` (succès) et d'un `error`.

Avec `observe: 'events'` et `reportProgress: true` (`TrackService.upload()`), l'Observable émet **une suite d'événements** de types différents :

```text
Sent → UploadProgress (loaded/total) → UploadProgress … → ResponseHeader → Response (corps : la piste créée)
```

Le composant doit donc (`tracks-page.ts`, `upload()`) :
- **trier les événements** par `event.type` : mettre à jour le pourcentage sur `UploadProgress`, ignorer `Sent` et `ResponseHeader`, et ne traiter le succès que sur `Response` ;
- **ne pas conclure trop tôt** : 100 % signifie que le navigateur a fini d'envoyer, pas que le serveur a accepté le fichier. Le serveur doit encore valider et enregistrer, et il peut refuser avec un `400`. L'interface affiche donc « Finalisation… » à 100 %, et le succès seulement à la réponse ;
- **gérer un état sur toute la durée** : `uploading` reste vrai pendant tous les événements et bloque la seconde soumission. `finalize()` le remet à faux et efface la progression, que l'upload réussisse ou échoue ;
- **prévoir le cas où `total` est inconnu** : le pourcentage vaut `null` et la barre devient indéterminée.

États affichés :

| État | Signaux |
|---|---|
| aucun upload | `uploading = false` |
| en cours | `uploading = true`, `uploadProgress = 0…100` (ou `null` si inconnu) |
| réussite | `uploadSuccess` contient le message |
| échec | `uploadError` contient le message |

## Restitution orale

### 1. Pourquoi la suppression passe par un service ?

- **Séparation des responsabilités** : le composant gère l'affichage (confirmation, état `deleting`, SnackBar, rechargement), et `TrackService` gère la communication HTTP (`delete(id)` → `DELETE /api/tracks/:id`). Le composant ne connaît ni l'URL ni `HttpClient`.
- **Un seul endroit à modifier** : si l'URL ou le contrat changent, seul `track.service.ts` est touché, et toutes les opérations sur les pistes y sont regroupées.
- **Tests plus simples** : dans `tests/tracks-page.spec.ts`, on remplace `TrackService` par un faux service pour tester le composant sans HTTP. Dans `tests/http-services.spec.ts`, on teste le vrai service avec `HttpTestingController`.
- **Même chemin pour toutes les requêtes** : l'appel passe par `HttpClient`, donc par l'intercepteur qui ajoute le JWT et gère les `401`.

### 2. Comment le backend protège-t-il la suppression ?

En trois contrôles (détaillés plus haut) : présence et format `Bearer` du token, puis `jwt.verify()` (signature et expiration) et `sessionVersion`, puis un filtre `{ _id, ownerId: req.auth.sub }` dans la requête MongoDB. On ne peut supprimer que ses propres pistes : un token absent ou invalide donne `401`, une piste d'un autre utilisateur ou déjà supprimée donne `404`.

Le backend supprime ensuite le fichier audio et la couverture du disque, puis répond `204`. Ces cas sont testés dans `backend/test/security.test.js`.

### 3. Comment Angular calcule-t-il le pourcentage d'upload ?

Pendant l'envoi, le navigateur signale régulièrement combien d'octets sont partis. `HttpClient` transforme ces signaux en événements `HttpEventType.UploadProgress` avec :
- `loaded` : octets déjà envoyés ;
- `total` : taille totale du corps de la requête, s'il est connu.

Le composant calcule :

```ts
Math.min(100, Math.floor(100 * event.loaded / event.total))
```

Si `total` est absent ou nul, le pourcentage vaut `null`. `total` correspond au corps multipart entier (fichier, titre, séparateurs), pas seulement au fichier. Ce pourcentage mesure l'envoi par le navigateur, pas le traitement côté serveur.

### 4. Pourquoi les tests HTTP n'ont-ils pas besoin de MongoDB ?

On teste notre code, pas MongoDB, donc on remplace ce qui est extérieur par des faux :
- **Frontend** : `provideHttpClientTesting()` remplace l'envoi réseau. `HttpTestingController` intercepte la requête (`expectOne('/api/tracks/abc')`), on vérifie sa méthode, son URL, ses paramètres et son corps, puis on fournit nous-mêmes la réponse (`flush(…)`, `event(…)`, erreur `404`). Aucune requête ne quitte le test : ni backend, ni base de données.
- **Backend** : le vrai serveur Express démarre sur un port libre, avec de vrais JWT, mais les méthodes Mongoose (`Track.find`, `findOneAndDelete`, `User.findById`…) sont remplacées par des faux avec `t.mock.method`. On peut aussi vérifier le filtre envoyé à Mongo (`{ _id, ownerId }`).

Les tests sont donc rapides, donnent toujours le même résultat, fonctionnent sans connexion (Atlas refusait d'ailleurs notre IP) et ne modifient aucune vraie donnée.

### 5. Que vérifie un test d'intercepteur ou de guard ?

**Intercepteur** (`tests/auth-interceptor.spec.ts`) :
- avec un token, une requête `/api/...` protégée repart avec `Authorization: Bearer <token>` ;
- vers les routes publiques (`/api/auth/login`, `/api/auth/register`) ou un autre site, l'en-tête n'est pas ajouté : le JWT ne fuit pas ;
- sur un `401`, la session est effacée (`logout()`), l'utilisateur est redirigé vers `/login?returnUrl=…&reason=expired` et l'erreur est transmise au composant ;
- un ancien `401` n'efface pas une session plus récente.

**Guard** (`tests/auth-navigation.spec.ts`) :
- sans token, `authGuard` ne laisse pas passer : il renvoie vers `/login` en gardant la page demandée (`returnUrl`) ;
- avec un token, la navigation est autorisée ;
- `guestGuard` fait l'inverse : il empêche un utilisateur connecté d'ouvrir `/login` et `/register` ;
- après la déconnexion, les pages protégées sont de nouveau bloquées.

Ces tests vérifient le comportement de navigation et de sécurité côté client, sans afficher de page ni appeler l'API.

### 6. Quelle différence entre un test unitaire et un test d'intégration ?

- **Test unitaire** : il teste une seule pièce, isolée, et remplace ce dont elle dépend par des faux. Exemple : `tests/tracks-page.spec.ts` teste `TracksPageComponent` avec un faux `TrackService` et un faux `MatSnackBar`. On vérifie que `delete` n'est appelé qu'une fois malgré un double clic, que la liste est rechargée, que le bon message s'affiche. C'est rapide et ça montre exactement où est le problème, mais ça ne prouve pas que les pièces fonctionnent ensemble.
- **Test d'intégration** : il fait travailler plusieurs pièces réelles ensemble. Exemple : `backend/test/security.test.js` envoie de vraies requêtes HTTP (`fetch`) à un vrai serveur Express, qui enchaîne routes, middleware `auth`, vérification JWT, Multer et gestionnaire d'erreurs. Seule la base est simulée. `tests/http-services.spec.ts` est aussi intermédiaire : le vrai `TrackService` et le vrai `HttpClient`, avec l'intercepteur, mais un backend simulé.

Un test de bout en bout irait plus loin : navigateur, frontend, backend et MongoDB réels. C'est la vérification manuelle dans l'onglet Network.

## Vérifications finales — ce qu'on doit observer

| Vérification | Résultat attendu |
|---|---|
| Network : suppression | aucune requête à l'ouverture de la confirmation ; `DELETE /api/tracks/:id` → `204` après clic sur Supprimer ; puis `GET /api/tracks?page=…&limit=5` |
| Network : upload | `POST /api/tracks` multipart (`audio`, `title`) → `201` ; barre de progression qui avance pendant l'envoi (plus visible avec le débit limité à « Slow 4G ») |
| Console | aucune erreur inattendue ; seuls des statuts et identifiants de pistes sont journalisés, jamais de mot de passe ni de JWT |

Captures à ajouter dans `TP3-Rendu/Capture_Network/`, en masquant l'en-tête `Authorization`.
