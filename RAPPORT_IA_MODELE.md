# Rapport d'usage de l'IA - TP1

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

## État de ce rapport

Ce brouillon a été préparé avec Codex à partir de nos échanges. Il doit être relu et complété par le binôme, notamment pour les vérifications manuelles, les captures et les apprentissages individuels. Les éléments indiqués « à compléter » ne sont pas des vérifications réalisées.

Assistant utilisé : Codex. Date des échanges : 17 septembre 2026.

## Mission 1 — Inscription, connexion et profil

### Objectif et demandes adressées à l’IA

Améliorer la validation des formulaires d’inscription et de connexion, rendre les erreurs compréhensibles et gérer la navigation selon l’état de connexion.

Extraits des demandes :

> « il faudrait que mes formulaires de login et de register soit réactifs et que la gestion des erreurs soit compréhensible »

> « ne pas pouvoir cliquer ou même modifier l'url pour aller sur la page login si on est déja login […] un bouton de déconnexion qui néttoie l'état local »

> « en cas d'erreur 401 […] rediriger l'utilisateur vers la page de login »

### Démarche proposée et intervention de l’assistant

L’assistant a examiné les composants, les services et les routes. Les formulaires utilisaient déjà Reactive Forms, mais la soumission ne vérifiait pas leur validité. La méthode `AuthService.logout()` existait déjà et effaçait le token du localStorage ainsi que les signaux de session.

Les changements apportés avec l’IA sont :

- validation des champs avant envoi et messages sous les champs ;
- minimum de huit caractères pour le mot de passe à l’inscription, conformément au backend ;
- état d’attente et prévention des doubles soumissions ;
- traduction des erreurs HTTP en messages compréhensibles ;
- guard empêchant l’accès à `/login` et `/register` lorsqu’un token est présent ;
- navigation conditionnelle et bouton de déconnexion utilisant la méthode existante ;
- traitement des réponses 401 des requêtes API protégées : effacement de la session et redirection vers `/login`. Une erreur d’identifiants sur la connexion reste affichée dans le formulaire.

Le profil n’avait pas été amélioré lors de cette première étape. Il a ensuite fait l’objet du complément ci-dessous. Les vérifications manuelles de la mission restent à réaliser par le binôme.

### Fichiers concernés

- `frontend-starter/src/app/components/login-page/login-page.ts`, `.html` et `.css` ;
- `frontend-starter/src/app/components/register-page/register-page.ts`, `.html` et `.css` ;
- `frontend-starter/src/app/components/app/app.ts`, `.html` et `.css` ;
- `frontend-starter/src/app/routes.ts` ;
- `frontend-starter/src/app/shared/guards/guest.guard.ts` ;
- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` ;
- `frontend-starter/src/app/shared/utils/auth-error-message.ts` ;
- `frontend-starter/tests/auth-forms.spec.ts`, `auth-navigation.spec.ts` et `auth-interceptor.spec.ts`.

### Vérifications et preuves disponibles

Vérifications exécutées par l’assistant après les changements d’authentification :

```text
npm run build
Résultat : compilation réussie.

npx vitest run tests
Résultat : 3 fichiers de tests réussis, 22 tests réussis.
```

Ces tests couvrent notamment la validation, les doubles soumissions, les guards, le nettoyage de session et les réponses 401. Ce sont des tests automatisés avec des dépendances simulées ; ils ne constituent pas une vérification de bout en bout avec le backend.

Un [schéma du déroulement de la connexion](schema-connexion.svg) a également été produit avec l’IA. C’est un support d’explication, pas une preuve de fonctionnement dans le navigateur.

Vérifications réalisées personnellement par le binôme : **à compléter après exécution**.

Captures à ajouter au projet, puis à lier ici :

- formulaire invalide montrant les messages de validation ;
- erreur après saisie d’identifiants incorrects ;
- navigation connectée avec le bouton Déconnexion ;
- requête d’authentification dans Network montrant méthode, URL et statut, sans mot de passe ni token ;
- retour à la connexion après une réponse 401 sur une requête protégée.

### Limites, corrections et propositions rejetées

L’assistant n’a pas effectué de vérification dans le panneau Network du navigateur. Le binôme doit donc encore confirmer les scénarios avec l’application et le backend lancés.

Nous avons demandé à l’assistant de ne plus lancer de commandes Git pour les tâches de développement. Une commande de push a ensuite été exécutée à notre demande explicite.

Autres propositions rejetées ou corrections identifiées par le binôme : **à compléter, ou indiquer « aucune » si c’est le cas**.

### Ce que chacun sait expliquer sans l’assistant

À rédiger personnellement, sans affirmer un apprentissage non vérifié :

- Membre 1 — nom : … ; je sais expliquer … ; point restant à revoir : …
- Membre 2 — nom : … ; je sais expliquer … ; point restant à revoir : …

Questions utiles pour préparer cette partie : à quoi servent les validateurs ? Où est stocké le token ? Quelle différence entre un guard et un intercepteur ? Pourquoi un 401 sur `/login` n’a-t-il pas le même traitement qu’un 401 sur `/api/tracks` ?

### Complément — Confort des formulaires et retour après expiration

Demande : « afficher/masquer le mot de passe et la validation pendant la saisie […] le retour après expiration, retour à la page demandée ». Le travail sur le profil est explicitement reporté.

Changements effectués avec l’assistant :

- bouton Afficher/Masquer sur les deux formulaires, sans soumission du formulaire ; le mot de passe est remasqué lors de l’envoi ;
- erreurs visibles après sortie du champ ou soumission, puis mises à jour pendant la correction ;
- focus sur le premier champ invalide à la soumission ;
- message de session expirée ou invalide sur la connexion après un 401 authentifié ;
- conservation de la destination demandée par le guard ou lors du 401 et retour après authentification ;
- conservation de la destination lors du passage entre connexion et inscription ;
- restriction des destinations de retour aux pages protégées connues, pour éviter les URL externes et les boucles vers la connexion ;
- indication visuelle et accessible du lien de navigation actif.

Fichiers concernés : composants login/register/app, `auth.guard.ts`, `auth.interceptor.ts`, nouvel utilitaire `shared/utils/auth-return-url.ts` et tests d’authentification, dont `tests/auth-return-url.spec.ts`.

Vérifications de l’assistant : compilation Angular réussie ; 40 tests automatisés réussis. Les tests couvrent notamment le retour vers la page demandée, les destinations refusées, le focus lors d’une soumission invalide et les redirections après 401. Ils ne remplacent pas une vérification du rendu et des interactions dans le navigateur.

À vérifier par le binôme et à illustrer avec des captures : affichage/masquage du mot de passe avec une valeur fictive, apparition de l’erreur après sortie du champ, correction de cette erreur, message après expiration et retour à la page initialement demandée. Aucune capture n’a été créée par l’assistant.

### Complément — Refonte de la page Profil

Demande : analyser la présentation et les interactions du profil avec le backend, puis mettre en œuvre la proposition validée (« ça me parait vraiment bien, faisons cela »).

L’assistant a constaté que le chargement était manuel, que le formulaire pouvait rester vide après connexion, et que les erreurs et confirmations étaient seulement écrites dans la console. La proposition retenue sépare un résumé du compte (initiales, nom, email, date en français) d’un formulaire de modification du nom.

Changements réalisés :

- chargement automatique via `GET /api/users/me`, avec état d’attente et bouton Réessayer en cas d’erreur ;
- nom prérempli et validation d’au moins deux caractères après suppression des espaces aux extrémités, conforme au modèle backend ;
- bouton de sauvegarde désactivé pour une valeur invalide, inchangée ou pendant une sauvegarde ;
- sauvegarde via `PUT /api/users/me` avec le nom nettoyé et prise en compte de la réponse du serveur ;
- bouton Annuler restaurant le dernier nom chargé ou enregistré, sans requête HTTP ;
- messages visibles de réussite et d’échec, avec conservation de la saisie en cas d’échec ;
- affichage adapté aux petits écrans, labels, messages accessibles et focus visible ;
- arrêt des abonnements HTTP lorsque le composant est détruit.

Fichiers modifiés : `frontend-starter/src/app/components/profile-page/profile-page.ts`, `.html`, `.css`. Fichier de tests ajouté : `frontend-starter/tests/profile-page.spec.ts`. Les routes et le code du backend restent inchangés.

Vérifications exécutées par l’assistant : `npm run build` réussi ; `npx vitest run tests` réussi avec **52 tests dans 5 fichiers**, dont 12 tests du profil. Ces tests utilisent un service simulé et couvrent le chargement automatique, les tentatives après erreur, les noms invalides ou inchangés, les doubles soumissions, la normalisation, la confirmation, l’annulation et la destruction du composant.

Vérifications à effectuer par le binôme : ouvrir `/profile` après actualisation, modifier et annuler le nom, enregistrer puis recharger pour vérifier la persistance, simuler une erreur réseau, vérifier les requêtes GET/PUT dans Network et contrôler le rendu sur mobile. Ajouter les captures correspondantes dans `preuves/` et les lier ici, sans exposer le token. Aucun contrôle visuel dans le navigateur ni capture n’a été réalisé par l’assistant.

Apprentissages individuels à compléter : expliquer la différence entre le nom saisi et le nom enregistré, le rôle de `currentUser`, les états `loading`/`saving`, et pourquoi la validation doit correspondre aux règles du backend.

## Mission 2 — Bibliothèque paginée

### Objectif et demandes adressées à l’IA

Vérifier la conformité de la pagination existante, puis ajouter la gestion de l’erreur avec un Signal.

> « Peux tu stp me dire dans ce cahier des charges, ce qui est pas implémenté, ce qui l'es etc »

> « Peux tu faire le signal pour l'erreur et me dire ou je peux trouver des fichiers audios libre de droit pour avoir plusieurs pages »

### Démarche et changements

L’assistant a constaté que `TrackService.list(page, limit)` transmettait déjà les deux paramètres à `HttpClient`. Le composant possédait les signaux `tracks`, `page`, `pages` et `loading`, utilisait `@for` et `@empty`, et effectuait une nouvelle requête à chaque changement de page. La pagination existante n’a donc pas été écrite par l’assistant pendant ces échanges.

L’assistant a ajouté :

- `readonly error = signal('')` ;
- la remise à zéro du message au début du chargement ;
- un message adapté en cas d’échec réseau ou HTTP ;
- un affichage avec `role="alert"` et un bouton Réessayer ;
- des états de chargement, d’erreur et de résultats exclusifs, pour éviter d’afficher « Aucune piste » pendant le chargement ou une erreur ;
- la désactivation du bouton Actualiser pendant le chargement.

Fichiers modifiés :

- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` ;
- `frontend-starter/src/app/components/tracks-page/tracks-page.html`.

Le backend n’a pas été modifié. Le Paginator Angular Material demandé dans la partie avancée n’a pas été intégré.

### Vérifications et preuves

L’assistant a exécuté `npm run build` après l’ajout du Signal d’erreur : compilation réussie. Aucun test automatisé spécifique à cette modification ni vérification Network n’a été effectué.

Vérifications du binôme : **à réaliser et à compléter**.

Scénarios proposés pour constituer les preuves :

1. Importer au moins six fichiers audio autorisés afin d’obtenir deux pages de cinq pistes maximum.
2. Cliquer sur Suivant et vérifier dans Network une nouvelle requête `GET /api/tracks?page=2&limit=5`.
3. Revenir avec Précédent et vérifier la requête pour la page 1.
4. Simuler une coupure réseau et cliquer sur Actualiser : vérifier le message d’erreur et le bouton Réessayer.
5. Rétablir le réseau et réessayer : vérifier la disparition de l’erreur et le retour des pistes.

Captures à ajouter : page 2 avec la requête Network correspondante ; message d’erreur ; résultat après nouvelle tentative. Ne pas inclure le token dans les captures.

### Limites et apprentissages

La partie avancée Angular Material reste à faire. Le fonctionnement avec plusieurs pages réelles et les scénarios d’erreur restent à confirmer par le binôme.

Propositions rejetées ou corrections identifiées par le binôme : **à compléter**.

- Membre 1 — nom : … ; je sais expliquer … ; point restant à revoir : …
- Membre 2 — nom : … ; je sais expliquer … ; point restant à revoir : …

Questions utiles : comment `page` et `limit` arrivent-ils dans l’URL ? Pourquoi ne faut-il pas découper la liste localement ? Comment le Signal `error` pilote-t-il l’affichage ?

## Ajouter les captures

Créer par exemple un dossier `preuves/`, y déposer les véritables captures, puis utiliser cette syntaxe en adaptant le nom du fichier :

```markdown
![Mission 2 : requête de la page 2 dans Network](preuves/mission-2-pagination.png)
```

Pour chaque capture, préciser le scénario, le résultat attendu et le résultat observé. Ne pas présenter les exemples de noms de fichiers comme des captures déjà présentes. Masquer les mots de passe, tokens et autres secrets avant d’ajouter les images au projet.

## Bonus — Modifier son mot de passe (18 septembre 2026)

Demande : « Fais le, le prof a dit qu'on pouvait inové et je veux faire ça ». Cette autorisation explicite permet une extension du backend pour ce bonus.

L’assistant a ajouté une section Sécurité indépendante dans le profil : mot de passe actuel, nouveau, confirmation, affichage/masquage, validation progressive, effacement du formulaire et blocage des doubles soumissions. Un mauvais mot de passe actuel affiche une erreur sans déconnecter l’utilisateur. Après succès, le formulaire est vidé, la session locale nettoyée et un message sur la connexion invite à se reconnecter.

Côté backend : nouvelle route `PUT /api/users/me/password`, middleware de validation, comparaison bcrypt, hachage du nouveau mot de passe et mise à jour conditionnelle sur l’ancien hash. La méthode spécifique `replacePassword` évite de dépendre du hook de création du compte. Une version de session incrémentée en base invalide les anciens JWT lors des prochaines requêtes protégées. Tous les backends du binôme doivent utiliser cette version du code. Les comptes existants sont compatibles sans migration manuelle.

Fichiers concernés : `backend/src/app.js`, `backend/src/models/User.js`, `backend/src/middleware/validate-password-change.js`, `backend/test/password.test.js`, `frontend-starter/src/app/components/password-form/`, composants profil et connexion, `AuthService`, `frontend-starter/tests/password-form.spec.ts` et `API_CONTRACT.md`.

Preuves automatisées : compilation Angular réussie ; 59 tests frontend réussis. Les tests backend vérifient les réponses HTTP réelles d’un serveur temporaire, le hachage bcrypt réel, le rejet de l’ancien mot de passe et des anciens tokens, les données invalides et les conflits ; la persistance MongoDB est simulée, aucun compte Atlas n’a été modifié. Une première exécution a révélé une erreur dans le substitut de requête Mongoose du test ; l’assistant a corrigé ce substitut pour prendre en charge l’attente directe et `.select()`.

À vérifier par le binôme : changer le mot de passe d’un compte de test, constater le message après redirection, se reconnecter avec le nouveau mot de passe et vérifier qu’un autre navigateur reçoit un 401 avec l’ancienne session. Ajouter les captures sans afficher les mots de passe, le corps de la requête ni les tokens. Aucun contrôle visuel dans le navigateur n’a été effectué par l’assistant.

À expliquer personnellement : différence entre hachage et chiffrement, nécessité du mot de passe actuel, limite bcrypt de 72 octets, mise à jour conditionnelle et révocation des sessions. Apprentissages individuels et captures : à compléter.

## TP2 — Upload, lecture et présentation de la bibliothèque (18 septembre 2026)

Demande : réaliser les trois premières étapes du plan (upload, lecture, présentation) et reporter le choix du format de pagination.

L’assistant a conservé le service HTTP et le contrat backend. Le composant bibliothèque valide la présence du fichier, sa taille (25 Mo maximum), son extension et son type MIME, affiche la sélection et les erreurs, bloque les doubles envois et confirme le succès. Le champ fichier natif et le titre sont vidés après réussite, puis la première page est rechargée. Une erreur serveur conserve la sélection. Les types MIME non reconnus sont refusés avec un message explicite, conformément aux types acceptés par le serveur.

La lecture conserve le flux HttpClient → Blob → ObjectURL → lecteur. Le dernier choix annule le téléchargement précédent ; les erreurs HTTP et celles du lecteur sont affichées. L’ancienne URL est révoquée lors du remplacement et la dernière à la destruction du composant. Les abonnements HTTP sont arrêtés au départ de la page.

La bibliothèque affiche désormais des cartes avec titre, nom original, format, taille convertie en Ko/Mo, date et action de lecture. Un lecteur commun indique le morceau sélectionné. La disposition s’adapte aux petits écrans, avec labels, focus visible et messages accessibles. La pagination reste basée sur les boutons Précédent/Suivant ; aucun Paginator Material ni plugin Mongoose n’a été ajouté.

Fichiers : `frontend-starter/src/app/components/tracks-page/tracks-page.ts`, `.html`, `.css` et `frontend-starter/tests/tracks-page.spec.ts`.

Tests ajoutés : refus des fichiers invalides, doubles envois, réinitialisation après succès, conservation après erreur, respect du dernier choix audio, révocation des ObjectURL et formatage des tailles. Les appels HTTP sont simulés ; le rendu visuel et la lecture réelle restent à vérifier dans le navigateur.

Preuves à compléter par le binôme : capture multipart contenant audio/title (sans token), carte après import, lecteur avec le titre choisi, message pour fichier invalide, contrôle mobile et lecture avec deux comptes pour vérifier la propriété. La validation frontend améliore le retour utilisateur mais ne remplace pas les contrôles backend. Le téléchargement Blob finit avant que le lecteur reçoive son URL : il ne s’agit pas d’une lecture progressive pendant la requête HttpClient.

Résultats des vérifications de l’assistant pour cette étape : compilation Angular réussie (npm run build) et 67 tests réussis dans 7 fichiers (npx vitest run tests), dont 8 tests de la bibliothèque. Aucun test dans un navigateur connecté au backend n’a été effectué.

### TP2 — Harmonisation du header

Demande : espacer le nom Guitar Practice Cloud et sa phrase d’accroche, et donner le même design aux liens et au bouton Déconnexion. Modifications dans `components/app/app.html` et `app.css` : accroche sous le nom avec un espacement explicite, styles communs des contrôles (dimensions, bordures, couleurs et survol), page active distinguée, focus clavier visible et adaptation mobile. Compilation `npm run build` réussie. Vérification visuelle et capture à compléter par le binôme ; aucun test supplémentaire ajouté pour cette modification de présentation.

Ajustement du header demandé ensuite : phrase d’accroche à côté du nom avec espacement (retour à la ligne si nécessaire sur petit écran), et bouton Déconnexion distingué par un fond rouge sombre et une bordure rosée. Fichiers : `app.html` et `app.css`. Compilation Angular réussie ; rendu à vérifier dans le navigateur.

Ajustement visuel TP2 : rétablissement d’une bannière compacte à dégradé vert derrière « MA BIBLIOTHÈQUE / Mes morceaux », avec texte clair et espacement réduit, dans `tracks-page.css`. Aucun changement fonctionnel ; rendu navigateur à vérifier par le binôme.

## TP3 — Suppression, progression d’upload et tests (6 octobre 2026)

Demande : vérifier que les missions 5, 6 et 7 sont terminées, puis compléter ce qui manque (environnement de test, tests HTTP, tests backend facultatifs, rapport des tests et présent rapport).

**Mission 5 — Suppression** (commits `b7ffdcb` puis `32874bf`) :
- chaque carte a un bouton Supprimer ;
- un `<dialog>` natif demande confirmation ;
- le signal `deleting` bloque les doubles clics et l’annulation pendant l’envoi ;
- l’appel passe par `TrackService.delete()` et non par `HttpClient` ;
- les messages s’affichent dans un `MatSnackBar` Angular Material (5 s, bouton Fermer) ;
- après succès, la liste est rechargée, avec retour à la page précédente si la page devient vide, et l’audio de la piste supprimée est libéré ;
- un 404 (piste déjà supprimée dans un autre onglet, ou appartenant à un autre utilisateur, deux cas que le backend ne distingue pas volontairement) ferme la confirmation et recharge la liste ;
- une erreur réseau garde la confirmation ouverte pour réessayer.

**Mission 6 — Progression de l’upload** (commit `77b32c6`) :
- `observe: 'events'` et `reportProgress: true` ;
- le composant distingue l’absence d’envoi, l’envoi avec pourcentage (`loaded / total`, ou indéterminé si `total` est inconnu), la finalisation à 100 %, la réussite (seulement à la réponse du serveur) et l’échec ;
- le titre, le fichier et les boutons sont désactivés pendant l’envoi.

**Mission 7 — Tests** (complétés lors de cette session) :
- Le script `npm test` appelait `ng test`, qui échouait : configuration `build:development` absente de `angular.json`, et pas de DOM. Il lance désormais `vitest run tests`, la commande déjà utilisée dans les rapports précédents.
- `jsdom` a été ajouté en dépendance de développement, uniquement pour le nouveau fichier qui utilise `TestBed`.
- Nouveau `frontend-starter/tests/http-services.spec.ts`, avec `HttpTestingController` : `AuthService.login()` (POST, corps, stockage du token, cas 401), `TrackService.list()` (paramètres `page` et `limit`), `TrackService.delete()` (DELETE, URL, 204 et 404) et `TrackService.upload()` (FormData `audio` et `title`, événements `Sent` → `UploadProgress` → `Response`).
- Nouveau `backend/test/security.test.js` (extension facultative), avec un serveur Express et des JWT réels et un Mongoose simulé :
  - 401 sans JWT ou avec un JWT invalide ou falsifié ;
  - upload sans fichier ;
  - type MIME refusé ;
  - pagination, avec `skip`, `limit` et le plafond à 20 ;
  - piste d’un autre utilisateur : 404, filtre `ownerId` vérifié.

Aucune route ni aucun code applicatif n’a été modifié pendant cette session, et `API_CONTRACT.md` est inchangé.

Fichiers de cette session : `frontend-starter/package.json`, `package-lock.json`, `frontend-starter/tests/http-services.spec.ts`, `backend/test/security.test.js` et `TP3-Rendu/Rapport_Tests.md`.

Résultats observés par l’assistant :
- `npm test` frontend : 79 tests réussis dans 8 fichiers ;
- `npm test` backend : 8 tests réussis ;
- `npm run build` : réussi.

Le détail, avec les résultats attendus et observés, est dans `TP3-Rendu/Rapport_Tests.md`.

Correction en cours de route : une première version des tests HTTP créait un injecteur Angular à la main. Il manquait des services internes de `HttpClient` (`PendingTasks`), donc l’assistant est passé à `TestBed` avec `jsdom`. L’ordre réel des événements d’upload commence aussi par `HttpEventType.Sent`, et le test a été ajusté en conséquence.

Limites :
- aucun test dans un navigateur connecté au backend : MongoDB Atlas refusait la connexion, car l’IP n’était pas autorisée dans Network Access ;
- captures Network (DELETE confirmé, upload avec progression) et contrôle de la console à faire par le binôme ;
- les tests du composant simulent `TrackService` et `MatSnackBar` : le rendu réel du SnackBar et de la barre de progression reste à vérifier visuellement.

À expliquer personnellement :
- pourquoi le guard et l’interface ne protègent pas la suppression (le backend vérifie le JWT et filtre sur `ownerId`) ;
- pourquoi un upload avec progression émet plusieurs événements au lieu d’une seule réponse ;
- comment est calculé le pourcentage ;
- pourquoi les tests HTTP n’ont pas besoin de MongoDB ;
- ce que vérifie un test d’intercepteur ou de guard ;
- la différence entre un test unitaire (composant avec service simulé) et un test d’intégration (serveur Express réel interrogé par `fetch`).

Apprentissages individuels et captures : à compléter.

### TP3 — Synchronisation de la bibliothèque entre onglets (8 octobre 2026)

**Demande.** Une piste ajoutée ou supprimée dans un onglet doit apparaître ou disparaître dans les autres onglets sans clic sur « Actualiser ». Ce point n’est pas exigé par le sujet : c’est une amélioration.

**Démarche.** Nouveau service `shared/services/library-sync.service.ts` :
- après un upload ou une suppression réussis, le composant appelle `notifyChanged()`, qui publie un message sans donnée sur le canal `BroadcastChannel` `gpc-library` ;
- les autres onglets du même navigateur reçoivent ce message (l’émetteur, lui, ne le reçoit pas) ;
- l’événement `visibilitychange` recharge aussi la liste quand on revient sur un onglet, ce qui couvre un ajout fait depuis un autre navigateur ou appareil ;
- un onglet caché attend d’être de nouveau visible avant de recharger.

**Rechargement dans le composant.** Il est *silencieux* : pas de « Chargement… », la liste actuelle reste visible et un échec la conserve sans message d’erreur. Si la page courante n’existe plus, le composant bascule sur la dernière page.

Le backend, l’API et `API_CONTRACT.md` sont inchangés.

**Fichiers :**
- `frontend-starter/src/app/shared/services/library-sync.service.ts` (nouveau) ;
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` ;
- `frontend-starter/tests/library-sync.spec.ts` (nouveau) ;
- `frontend-starter/tests/tracks-page.spec.ts` (6 tests ajoutés) ;
- `TP3-Rendu/Rapport_Tests.md`.

**Résultats observés par l’assistant :**
- `npm test` : 90 tests réussis dans 9 fichiers ;
- `npm run build` : réussi.

**Limites :**
- non vérifié dans un navigateur, faute de backend connecté à Atlas ;
- la synchronisation immédiate ne fonctionne qu’entre onglets du même navigateur. Ailleurs, la mise à jour se fait au retour sur l’onglet.

**À expliquer personnellement :**
- le rôle de `BroadcastChannel` et pourquoi le message ne contient aucune donnée (chaque onglet relit l’API, qui reste la source de vérité et vérifie le JWT) ;
- l’intérêt du rechargement silencieux ;
- la différence avec une vraie synchronisation serveur (WebSocket ou Server-Sent Events).

### TP3 — Fusion de `tp3-finalisation` dans `main` (8 octobre 2026)

**Demande.** Fusionner la branche `tp3-finalisation` dans `main`, qui avait reçu entre-temps le commit du binôme sur les images de couverture. En cas de conflit, conserver si possible le code des deux branches.

**Conflits et résolutions :**
- `frontend-starter/package.json` : les deux branches avaient ajouté `jsdom` (`^30.1.1` sur `main`, `^30.1.2` sur la branche TP3), et `^30.1.2` a été conservé. Les deux façons de lancer les tests sont gardées :
  - `npm test` lance `ng test --watch=false`, configuré par le binôme dans `angular.json` et `tsconfig.spec.json`, qui exécute tous les tests, y compris `covers.spec.ts` ;
  - `npm run test:vitest` lance vitest seul, sans `covers.spec.ts`, pour une vérification rapide.
- `frontend-starter/package-lock.json` : la version de la branche TP3 a été reprise, car elle contenait déjà `jsdom` et le correctif de `npm audit fix`. `npm install` n’y a rien changé.

**Fusions automatiques, relues par l’assistant :** `tracks-page.ts`, `.html` et `.spec.ts`. Les couvertures (sélecteur, éditeur, affichage) et la synchronisation entre onglets y cohabitent.

**Adaptation après fusion.** Dans `backend/test/security.test.js`, deux assertions ont été adaptées aux messages reformulés par le binôme (« Fichier audio requis. » et « Format audio non accepté (MP3, WAV, OGG ou M4A). »). Elles vérifient désormais le début du message.

**Incident.** Le dossier `node_modules` du frontend était incohérent : fichiers manquants après la restauration OneDrive. Il a été réinstallé avec `npm ci`, une fois les serveurs arrêtés.

**Résultats observés :**
- `npm test` frontend : 98 tests réussis dans 10 fichiers ;
- `npm run test:vitest` : 93 tests réussis ;
- `npm test` backend : 16 tests réussis ;
- `npm run build` : réussi.

### Consolidation avant TD4 — 8 octobre 2026

**Demande.** Corriger les quatre points relevés pendant la revue avant de
développer le lecteur permanent, les playlists et le partage entre amis.

**Changements.** Le backend refuse le démarrage sans secret JWT explicite et
rejette l'ancienne valeur de secours. Les tests fournissent un secret aléatoire.
L'inscription contrôle les types, le nom, l'email et la limite de 72 octets UTF-8
du mot de passe avant tout accès à MongoDB ou hachage. Le frontend partage le
validateur de taille entre inscription et changement de mot de passe.

`AuthService` observe les changements de session dans le stockage et au retour
sur un onglet visible. Une session externe différente efface le profil et
annule les requêtes en cours avant de recharger l'onglet. Ce choix simple assure
la suppression des données, des formulaires et de l'audio de l'ancien compte ;
les guards réévaluent ensuite l'accès à l'URL courante. Un ancien événement de
stockage ne doit jamais rétablir un token déjà remplacé.

Les changements de couverture avertissent maintenant les autres onglets. Le
lecteur reprend les métadonnées de la liste ou utilise la nouvelle route privée
`GET /api/tracks/:id` lorsque le morceau est hors de la page courante. L'audio
n'est pas téléchargé à nouveau. Une piste disparue arrête le lecteur, tandis
qu'une erreur réseau temporaire conserve la lecture. Le contrat API et le README
ont été mis à jour. Aucun secret ni compte Atlas n'a été modifié.

**Vérifications observées.** 110 tests frontend, 19 tests backend, compilation
Angular réussie. Test navigateur automatisé avec deux onglets Chrome et serveur
isolé réussi : couvertures synchronisées, requêtes multipart et JWT vérifiés,
anciennes données effacées au changement de compte, déconnexion propagée. La
persistance est simulée ; les preuves avec Atlas restent à compléter par le
binôme. Détails dans `TP3-Rendu/Rapport_Tests.md`, section 8.

**À expliquer par chacun.** Pourquoi bcrypt limite les octets et non les
caractères ; pourquoi le serveur doit refuser un secret absent ; différence
entre `storage` et `BroadcastChannel` ; pourquoi l'absence d'une piste dans une
page paginée ne prouve pas sa suppression. Les apprentissages personnels et
captures de rendu ne sont pas inventés par l'assistant.

## TD4 — Lecteur permanent (8 octobre 2026)

À la demande du binôme, extraction de la lecture de `TracksPageComponent`
vers un service singleton `PlayerService`. Le composant `AudioPlayerComponent`
est monté dans la structure principale, hors de la navigation. L'élément audio
et son téléchargement survivent à la destruction d'une page. Les contrôles
natifs sont conservés pour cette première étape ; aucune route backend ne change.

La session change : le lecteur s'arrête. Le morceau change : la requête
précédente est annulée et l'URL Blob libérée. Une pochette change : seules les
métadonnées et l'image sont actualisées. Un morceau supprimé dans un autre
onglet est détecté même depuis le profil.

Validation : 113 tests frontend passent. Le scénario Chrome utilise désormais
un WAV valide et vérifie lecture, navigation, pause, position, volume,
synchronisation des pochettes et arrêt après suppression depuis le profil.
La persistance du serveur de test est simulée, sans accès à Atlas.
À expliquer : différence entre durée de vie d'une page et d'un service racine,
propriété d'une URL Blob et conservation de l'élément audio entre les routes.
### Complément — enchaînement automatique (8 octobre 2026)

L'événement natif `ended` déclenche la recherche du morceau suivant dans
l'ordre de la bibliothèque. Le service parcourt la pagination de l'API,
puis télécharge uniquement le prochain audio. Il s'arrête en fin de liste.
Un changement manuel de morceau ou la fermeture du lecteur annule la recherche
en cours ; une erreur réseau affiche une action de nouvelle tentative.

Validation : 117 tests frontend passent et la compilation réussit. Le scénario
Chrome a vérifié la fin réelle d'un WAV puis le démarrage automatique du suivant
depuis le profil, ainsi que l'arrêt après le dernier morceau. Serveur de test
isolé avec persistance simulée ; aucune modification du backend.
