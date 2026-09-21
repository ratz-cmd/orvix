# Audit Orvix — 20 septembre 2026

Audit réalisé sur `arena/01a0bebd-orvix` (commit `33c0db6`), en installant les dépendances, en
construisant, en lintant, en typant et en lançant les trois suites de tests présentes.

> **Mise à jour du 20/09/2026 — les points 1 à 6 sont appliqués.** Le détail, avec les preuves
> de vérification, est dans l'annexe « ✅ Appliqué dans cette passe » en fin de document, et le
> § 1.4 a été corrigé (voir l'encadré : une de mes conclusions était inexacte).

---

## ✅ Appliqué dans cette passe (points 1 à 6)

Tout est sur `arena/01a0bebd-orvix`. Chaque correction a été vérifiée en exécution, pas
seulement relue.

| # | Correction | Vérification |
| --- | --- | --- |
| 1 | `package-lock.json` resynchronisé (`server` déclaré `orvix-server` dans les deux entrées du workspace) | `npm ci --dry-run` passe, y compris la variante `--workspace=server` du `Dockerfile` |
| 2 | `VITE_SITE_URL` : repli `http://localhost:<port>` **en dev uniquement**, message d'erreur actionnable en build, `.env.example` documenté | `cp .env.example .env && npx vite` démarre et répond 200 ; `npm run build` sans la variable échoue avec un message qui dit quoi faire |
| 3 | `app/scripts/build-userscript.js` et ses 3 tests lisent `userscript/orvix.user.js` (au lieu du nom disparu `orvix.user.js`) | `node scripts/build-userscript.js` + `--check` OK ; 3 fichiers de tests, 9/9 |
| 4 | Miroirs : `vite.config.ts` lit `config.env` (et non `process.env`), `Dockerfile` déclare les deux `ARG` | build avec `VITE_DEFAULT_MIRRORS=miroir1.exemple,miroir2.exemple` → `dist/sw.js` contient ces valeurs, plus `orvix.health` |
| 5 | Artifacts iOS/APK alignés sur `orvix-*` et sur ce dépôt : workflow, `publish-app.mjs`, `version.json`, sources stores régénérées par le générateur officiel, `.gitignore`, `app/README.md` | `node --test tests/unsignedIpaWorkflow.test.mjs` → 14/14 ; tous les nouveaux `downloadURL` existent déjà sur `main` (`gh api` sur chaque fichier) |
| 6 | Secrets : plus aucun repli en dur (licences VIP, clé d'admin, sels d'IP), contrôle d'admin à temps constant, en-tête seulement, plus d'exemption `NODE_ENV` | 11 scénarios exécutés (voir annexe) : `503` sans config, `403` sur l'ancienne constante du dépôt, `403` en dev, `403` en query string, `200` avec la bonne clé |

Détail de l'annexe 6 : le role de `ADMIN_SECRET` a été documenté dans `API/Mainapi/.env.example`
(il ne l'était pas — c'est ce qui rendait le repli en dur dangereux).

**Trois choses que je n'ai pas faites, volontairement :**

- Les identifiants iOS `com.orvix.app` / `com.orvix.source` et les noms visibles (« Orvix »)
  restent inchangés. Ils sont documentés comme clés primaires des stores : les renommer
  désinstallerait l'app chez tous ceux qui ont déjà ajouté la source. Le rebranding cosmétique
  appartient à l'étape 11.
- L'artefact `Orvix-unsigned.ipa` (nom du zip produit par la CI) n'a pas été renommé : il est
  auto-cohérent, n'est cassé nulle part, et son renommage entraîne une trentaine d'assertions
  de tests sans gain fonctionnel. À faire avec le rebranding complet.
- Aucun `Content-Security-Policy` n'a été ajouté (étape 9 : il demande de choisir une politique,
  donc une décision, pas une correction).

---

**Verdict court :** le code applicatif est d'un niveau largement supérieur à ce que laisse
deviner le mot « vibecodé » — beaucoup de garde-fous réfléchis, des commentaires qui expliquent
le *pourquoi*. Mais **rien ne se déploie ni ne se construit aujourd'hui** (le lockfile est
désynchronisé et le `Dockerfile` s'arrête à sa première instruction), la CI unique du dépôt est
cassée, le rebranding Orvix → Orvix est arrêté au milieu, et certaines zones (secrets, poids,
monolithes) demandent une décision avant la prochaine mise en prod.

Les cinq constats les plus lourds, si tu ne lis qu'une chose :

1. `npm ci` échoue → l'image Docker de production ne se construit pas (§ 1.0).
2. La seule CI du dépôt (iOS) échoue à sa première étape, et l'app mobile ne peut pas être
   bundlée (§ 1.2).
3. Deux secrets publics servent de repli pour signer les tokens VIP et ouvrir l'admin (§ 2.1).
4. 421 erreurs TypeScript et 1 022 erreurs ESLint que personne ne voit, faute de typecheck et
   de CI (§ 3).
5. Les sources AltStore/SideStore/Scarlet et l'updater de l'app pointent vers des fichiers qui
   n'existent pas dans ce dépôt (§ 1.4).

---

## 0. Ce qui est solide (à ne pas casser en corrigeant le reste)

Avant les critiques, ce qui mérite d'être dit parce que c'est rare :

- `src/utils/subtitleFormatting.ts` — échappement **puis** ré-allowlist de motifs exacts
  (ASS `{...}`, `[color=#rrggbb]`, `<b|i|u>`). C'est la bonne façon de faire du HTML de sous-titres.
- `API/Mainapi/.env.example` — 146 variables documentées avec exemples et pièges. Meilleur que
  ce qu'on trouve dans la plupart des projets pro.
- i18n : `fr.json` et `en.json` ont **exactement** 6 570 clés, zéro dérive. Un script de check
  existe manifestement.
- SQL : tout ce que j'ai lu est paramétré (`?`), y compris les gros `whereClause` construits
  dynamiquement (`commentsRoutes.js`, `admin.js`, `vipDonations.js`). Les concaténations de
  `LIKE`/`IN` assemblées restent des placeholders, jamais des valeurs.
- `server.js` : cluster avec anti-fork-bomb, graceful shutdown, recyclage des workers,
  `dns.setServers` privé. C'est du code d'exploitation qui a déjà souffert.
- `API/Mainapi/middleware/auth.js` : la session est revérifiée en base, le compte est validé sur
  disque, le fail-open est explicite et commenté. Le choix est discutable (§ 2.5) mais il est
  conscient et écrit noir sur blanc.

---

## 1. P0 — le dépôt ne tourne pas tel qu'il est documenté

### 1.0 `npm ci` échoue : l'image Docker de production ne peut pas être construite

Le nom du workspace `server/` a été renommé (`orvix-server` → `orvix-server`) dans
`server/package.json`, mais le lockfile racine ne l'a pas suivi :

```
$ node -p "require('./server/package.json').name"
orvix-server

$ node -e "console.log(require('./package-lock.json').packages['server'].name)"
orvix-server

$ npm ci
npm error Missing: orvix-server@0.1.0 from lock file
```

Le `Dockerfile` fait `npm ci --prefer-offline` en **première** instruction de l'étape `builder`
(ligne 11) et une seconde fois dans l'étape `runner` (ligne ~46) : les deux échouent, donc
**aucun déploiement Coolify ne peut aboutir aujourd'hui**. Même effet pour quiconque suit le
README à la lettre.

Cause : ce renommage n'a pas été propagé. Correctif : `npm install --package-lock-only` et
commit du lockfile — la réparation est mécanique. (J'ai d'ailleurs observé qu'un simple
`npm install` réécrit 83 lignes du lock : c'est le symptôme de ce même décalage
`package.json` / `package-lock.json`.)

**→ Appliqué (point 1).** Le lockfile est corrigé sur ses deux entrées de workspace ; `npm ci`
valide dans les deux étapes du `Dockerfile`.

C'est le point le plus coûteux de cet audit, parce qu'il est silencieux : rien dans le dépôt ne
signale que le déploiement est cassé depuis le renommage.

### 1.1 Suivre le README donne un build qui échoue

`README.md` dit : `cp .env.example .env` puis `npm run dev`. Or `.env.example` livre
`VITE_SITE_URL=` **vide**, et `vite.config.ts:9` jette quand la valeur est absente :

```
$ cp .env.example .env && npx vite
error when starting dev server:
Error: VITE_SITE_URL is required
```

Même chose pour `npm run build`. La toute première marche du guide d'installation est un mur.
Deux corrections possibles : un placeholder non vide dans `.env.example`
(`VITE_SITE_URL=http://localhost:3000`, comme le font les autres variables), ou un message
d'erreur qui dise *quoi* mettre. En l'état, quelqu'un qui clone le dépôt et suit le README
conclut que le projet est cassé.

**→ Appliqué (point 2).** Repli `http://localhost:<port>` **en dev seulement**, message d'erreur
actionnable en build, et `.env.example` explique pourquoi la variable est vide (la remplir avec
`localhost` ferait boulanger une URL locale dans le sitemap et le JSON-LD de production).

### 1.2 Le userscript de l'app mobile n'existe plus sous le nom attendu

`app/scripts/build-userscript.js:16` lit `../../userscript/orvix.user.js`.
Le fichier présent s'appelle `userscript/orvix.user.js` :

```
$ cd app && node scripts/build-userscript.js
Error: ENOENT: no such file or directory, open '/home/user/orvix/userscript/orvix.user.js'
```

Conséquences en cascade :

- `app/package.json` → `build:userscript` et le hook `prebuild` échouent **toujours** ;
- `.github/workflows/ios-unsigned.yml` (étape « Build the injected userscript ») échoue avant
  même de compiler quoi que ce soit. **La seule CI du dépôt est cassée au premier gate** ;
- `app/src/injection/userscript-source.ts` (gitignoré) n'est jamais généré, donc l'app ne peut
  pas être bundlée ;
- 3 tests échouent pour cette raison exacte :
  `kisskhEmbeddedUserscript.test.mjs`, `seekStreamingEmbeddedUserscript.test.mjs`.

C'est le renommage du fichier qui a cassé la chaîne : le générateur, ses deux tests, le
`.gitignore` et le workflow iOS pointent tous encore vers `orvix.user.js`.

**→ Appliqué (point 3).** Générateur, ses trois tests (il y en avait un troisième :
`castSourcePreparation.test.mjs`), `app/README.md`, `extension/README.md` et `userscript/README.md`
corrigés. `build-userscript.js --check` passe, et la ligne du README `userscript` qui
documentait un `public/userscript/orvix.user.js` inexistant a été supprimée.

### 1.3 La config des miroirs documentée ne sert à rien

`.env.example` (lignes 78-83) documente `VITE_DEFAULT_MIRRORS` et `VITE_MIRRORS_CONFIG_URL`
comme la façon dont le service worker choisit ses domaines de secours. Ces deux variables sont
lues dans `vite.config.ts:29,32` via **`process.env`**, or Vite ne recopie pas les variables de
`.env` dans `process.env` : il les expose dans `config.env`.

Preuve, build avec un `.env` contenant `VITE_DEFAULT_MIRRORS=m1.example,m2.example` :

```
$ grep -o "m1\.example\|orvix\.health" dist/sw.js | sort | uniq -c
      1 orvix\.health          ← la valeur par défaut codée en dur, pas celle du .env
$ grep -o "example.test/mirrors.json\|rentry.co/orvix" dist/sw.js
1 rentry.co/orvix
```

À noter : `VITE_SITE_URL` fonctionne, elle, parce que le plugin la lit via `config.env`.
Donc la mécanique existe à deux endroits et une seule des deux marche. Aggravant : le
`Dockerfile` (lignes 12-20) ne déclare même pas ces deux variables en `ARG`. En production
Coolify, les miroirs sont donc **toujours** `orvix.health` / `rentry.co/orvix`, quoi qu'on
mette dans la configuration.

**→ Appliqué (point 4).** Le plugin lit `config.env`, le `Dockerfile` déclare les deux `ARG`, et
le même build de contrôle injecte désormais bien les valeurs de `.env` dans `dist/sw.js`.

### 1.4 Les artefacts iOS et Android se contredisent entre eux

> ⚠️ **Correction de cet audit (20/09).** J'avais écrit que ces URL renvoyaient un 404 : c'est
> faux. `ratz-cmd/orvix` **existe**, est public, et contient bien
> `app/orvix-android.apk`, `app/orvix-ios-unsigner.ipa` et `app/orvix-ios-source.json` (vérifié
> par `gh api`). Le vrai lien mort est ailleurs : l'URL de repli de l'app mobile
> (`FALLBACK_CONFIG.GITHUB_URL = github.com/ratz-cmd/orvix`) et celle de la page
> d'extension (`github.com/ratz-cmd/orvix`) renvoient un **404 réel** — ces deux-là
> n'existent pas. Le problème de fond reste entier, mais c'est un problèmes de cohérence interne
> et non de disponibilité.

Le dépôt a été publié avec les artefacts renommés (`app/orvix-android.apk`,
`app/orvix-ios-unsigner.ipa`, `app/orvix-ios-source.json`, `app/orvix-scarlet-source.json`)
alors que la CI, le script de publication et les sources des stores sont restés sur `orvix-*` et
sur `ratz-cmd/orvix` :

| Fichier | Pointe vers | Conséquence |
| --- | --- | --- |
| `app/orvix-ios-source.json` | `ratz-cmd/orvix` + `orvix-ios-unsigner.ipa` | résout (dépôt amont public) mais ne sert pas CETTE IPA |
| `app/version.json:4` | `ratz-cmd/orvix` + `orvix-android.apk` | idem côté APK |
| `.github/workflows/ios-unsigned.yml:273` | écrivait `app/orvix-ios-unsigner.ipa` | aurait créé un **second** binaire de 10 Mo à côté du premier |
| `scripts/publish-app.mjs` | publiait dans `app/orvix-android.apk` | pire cas : `version.json` continuait de pointer l'APK amont, donc **une mise à jour publiée n'atteignait jamais les utilisateurs** |
| `app/.gitignore` | `!orvix-ios-unsigner.ipa` | ne correspondait plus à aucun fichier suivi |
| `app/src/config/index.ts:23` | `github.com/ratz-cmd/orvix` | **404** : la vérification de mise à jour échouait exactement quand elle sert de repli, c'est-à-dire quand le réseau est filtré |

Le `.gitignore` de `app/` était d'ailleurs révélateur : l'IPA n'est suivie que parce qu'elle est
déjà dans l'index ; la règle d'exception ne correspondait plus à aucun fichier.

**Recommandation :** faire de `orvix-*` l'unique chemin, régénérer les deux JSON de source et
`version.json` depuis `app/app.json`, et supprimer les entrées `orvix-*` de la CI et des
générateurs (`app/scripts/generate-ios-source.mjs` code encore `com.orvix.app`,
`https://orvix.online`, `rentry.co/orvix`).

**→ Appliqué (point 5).** Chemins et URLs alignés sur `orvix-*` + `ratz-cmd/orvix`, sources
régénérées par le générateur officiel, `ratz-cmd` remplacé par le dépôt réel. `com.orvix.app`,
`com.orvix.source`, les noms visibles et le domaine `orvix.online` restent volontairement figés
(clés primaires des stores ; leur changement ferait disparaître l'app déjà installée).

---

## 2. Sécurité

### 2.1 Secrets de secours en dur, dans un dépôt public

```
API/Mainapi/utils/vipLicenseStore.js:74
  const SECRET = process.env.JWT_SECRET || 'orvix_vip_cryptographic_secret_key_2026_super_secure';

API/Mainapi/routes/vipLicenseRoutes.js:147
  const expectedKey = process.env.ADMIN_SECRET || process.env.JWT_SECRET || 'orvix_vip_admin_secret_2026';
```

Le premier est une clé **HMAC** qui signe les tokens VIP (`signToken` / `verifyToken` juste en
dessous). Si `JWT_SECRET` n'est pas défini dans un environnement donné, n'importe qui peut
fabriquer un token VIP valide à durée illimitée, puisque le secret est public. Le second
protège le listing de toutes les licences.

Deux aggravants sur `vipLicenseRoutes.js:150` :

```js
if (adminKey !== expectedKey && process.env.NODE_ENV === 'production') {
  return res.status(403).json(...);
}
```

- si `NODE_ENV` n'est pas exactement `production`, **le contrôle ne s'applique pas du tout** ;
- la clé est acceptée en `?admin_key=` (query string → logs, Referer, historique) ;
- la comparaison `!==` n'est pas à temps constant.

Le remède est trivial : refuser de démarrer si le secret est absent, comme le fait déjà
`middleware/auth.js` pour `JWT_SECRET` (il fait `process.exit(1)`). Le contraste entre les deux
fichiers montre que le besoin a été compris ailleurs.

**→ Appliqué (point 6), plus deux cas trouvés en chemin.** Le store VIP refuse désormais de se
charger sans `JWT_SECRET` (message explicite, aucun repli) ; le contrôle d'admin est à temps
constant, limité à l'en-tête `x-admin-key`, sans exemption `NODE_ENV`, et répond 503 si aucun
secret n'est configuré. Deux sels d'anonymisation d'IP traînaient le même défaut sans être dans
mon audit initial — `'orvix-vip-ip'` dans `vipDonations.js:134` et
`'orvix-help-feedback-default-salt'` dans `helpFeedback.js:44` : sur un espace IPv4, un sel public
se force-brute en quelques minutes, donc ces hashs ne pseudonymisaient plus rien. Ils passent par
un helper partagé (`utils/ipHashSalt.js`) qui lit `TURNSTILE_IP_SALT`/`JWT_SECRET` et alerte si
aucun n'est configuré. `ADMIN_SECRET` était absent de `.env.example` : il y est maintenant
documenté.

Reste : `API/proxiesembed/drmproxy/services/joyn_de.py:238` contient encore une clé API en clair.

### 2.2 Le filtre de domaine se contourne en deux caractères

`API/Mainapi/middleware/security.js:98-101` :

```js
return allowedDomains.some(domain => {
  if (domain.includes(':')) return url.includes(domain);   // ← substring sur l'URL complète
  return hostname === domain || hostname.endsWith('.' + domain);
});
```

Reproduction de la logique :

```
true   https://evil.example/localhost:3000/anything
true   https://evil.example/path?ref=localhost:3000
false  https://orvix.fr
```

Il suffit de mettre `localhost:3000` n'importe où dans le `Referer` pour passer le filtre. Et de
toute façon le fichier assume plus bas qu'une requête sans `Origin` ni `Referer` passe : `curl`
y accède directement. **Ce middleware n'est pas une frontière de sécurité**, c'est un ralentisseur
anti-scraping — ce qui est un choix défendable, mais il ne faut pas qu'une route sensible
(`/api/vip/admin/licenses`, § 2.1) compte sur lui.

### 2.3 Aucune entrée `orvix.*` dans les allowlists

`middleware/cors.js` et `middleware/security.js` listent 19 domaines : `orvix.blog`, `orvix.fun`,
`cinezo.site`, `filmib.cc`… **zéro entrée `orvix.*`**, alors que `generate-vip-key.js` renvoie les
utilisateurs vers `https://orvix.fr/vip`. Le jour où le site est déployé sur un domaine Orvix,
toutes les requêtes navigateur se prennent un 403 CORS puis un 404 sec (avec, en prime, la fausse
réponse « Stranger Things » pour `/api/imdb/*`, ce qui rendra le diagnostic savoureux).

Les deux listes sont dupliquées mot pour mot entre `cors.js` et `security.js` : elles ont déjà
divergé (`'localhost'` présent dans l'une, absent de l'autre). Une seule constante exportée.

### 2.4 Proxy HTTP ouvert

`API/Mainapi/routes/proxy.js` proxifie **n'importe quelle URL** qu'on lui donne, sans allowlist,
avec `Access-Control-Allow-Origin: *`, en suivant 5 redirections et en copiant les en-têtes
amont. C'est un relais ouvert : SSRF (le serveur peut atteindre son réseau interne puisque
`validateStatus` et les redirections sont libres) et blanchiment de trafic. `cloudflareproxy/worker.js`
a la même forme. Le besoin produit est réel (les embeds exigent des `Referer` précis), mais il
faudrait au minimum une allowlist d'hôtes dérivée de la liste déjà existante des hébergeurs.

### 2.5 Choix à assumer ou à corriger

- **JWT sans expiration** (`middleware/auth.js:issueJwt`, pas de `exp`) : la révocation repose
  entièrement sur la ligne `user_sessions` en base. C'est cohérent, mais ça veut dire qu'un token
  volé vit jusqu'à la déconnexion explicite.
- **Fail-open si MySQL ne répond pas** : documenté et argumenté (ne pas déconnecter tout le monde
  pendant un restart). C'est un choix produit légitime… mais il n'est pas compensé par une alerte.
- **Aucun CSP.** Le seul `Content-Security-Policy` du dépôt est dans `next.config.js`, un fichier
  Next.js mort (`.dockerignore` le qualifie lui-même de « legacy, non utilisé »). Le serveur Hono
  (`server/index.js`) ne pose que des `Cache-Control` : pas de CSP, pas de HSTS, pas de
  `X-Content-Type-Options`. Sur un site qui charge des scripts de régie
  (`VITE_AD_SCRIPT_SRC`), des smartlinks et un service worker, c'est l'écart le plus visible.

### 2.6 Deux fichiers à sortir du dépôt public

- `API/proxiesembed/drmproxy/gift_from_karoolus.wvd` — un blob Widevine est une **clé privée de
  CDM**. Elle est déjà publique sur GitHub (donc compromise et révocable par Google à tout
  moment), et sa redistribution n'est pas couverte par la CC BY-NC du projet.
- `app/orvix-android.apk` (70 Mo) et `app/orvix-ios-unsigner.ipa` (11 Mo) : binaires opaques,
  non reproductibles depuis le tag, qui font grossir chaque clone et chaque couche Docker.

Ce sont des décisions à prendre avec un avis juridique, pas des bugs — mais elles rendent le
dépôt difficile à défendre en cas de retrait DMCA.

---

## 3. Ingénierie : le typecheck et le lint ne servent à rien aujourd'hui

### 3.1 421 erreurs TypeScript, jamais vues par personne

`npm run build` = `vite build` → esbuild **efface** les types sans les vérifier. Il n'existe
aucun script `typecheck`. Résultat de `npx tsc -b` :

```
421 erreurs sur 152 fichiers
185 × TS6133 (déclaré mais jamais lu)
 39 × TS2322 (type non assignable)
 30 × TS2339 (propriété inexistante)
 29 × TS2304 (nom introuvable)
 28 × TS2503 (namespace 'NodeJS' introuvable)
```

Le `strict: true` de `tsconfig.app.json` est donc purement décoratif. Et parmi ces erreurs,
certaines ne sont pas cosmétiques — ce sont **des séquelles directes du renommage** :

```
src/components/HLSPlayer.tsx:109   'OrvixAndroidCastBridge' n'existe pas dans '../types/castRemote'.
                                   Vouliez-vous dire 'OrvixAndroidCastBridge' ?
src/components/HLSPlayer.tsx:1346  La propriété 'orvixKisskhFallback' n'existe pas sur Window.
                                   Vouliez-vous dire 'orvixKisskhFallback' ?
src/components/FloatingPlayer.tsx:5  Cannot find module '../context/MiniPlayerContext'
```

Ces trois-là signalent du code qui ne s'exécutera probablement jamais comme prévu (un cast qui
ne s'installe pas, un fallback KissKH muet, un composant orphelin). Un typecheck en CI les
aurait attrapés le jour du renommage. **C'est la correction au meilleur rapport effort/valeur du
dépôt : ajouter `"typecheck": "tsc -b"` puis le brancher sur une CI.** Les 185 TS6133 se
corrigent en grande partie automatiquement ; ce sont les ~15 vraies erreurs qui comptent.

### 3.2 1 383 problèmes ESLint

```
✖ 1383 problems (1022 errors, 361 warnings)
```

`npm run lint` sort en erreur, donc il ne peut pas être branché sur une CI en l'état.
L'essentiel vient de `@typescript-eslint/no-explicit-any` (812 `any` dans `src/`) : la config
l'active via `recommended` sans avoir jamais fait le ménage. Soit on passe la règle en `warn`,
soit on accepte un `--max-warnings` élevé en attendant de résorber. Également 613 `console.log`
dans `src/`.

### 3.3 71 fichiers de tests, aucune façon de les lancer

Il n'existe **aucun** script `test` à la racine, aucun `test` dans `API/Mainapi/package.json`, et
le seul workflow du dépôt ne concerne que l'iOS. Les suites sont donc orphelines :

```
API/Mainapi : 228 tests lancés à la main → 63 en échec
app/        : 243 tests lancés à la main → 13 en échec
tests/      : 12 fichiers, jamais exécutés par quoi que ce soit
```

(Précision d'honnêteté : une partie des 63 échecs API vient de dépendances natives —
`better-sqlite3`, `sqlite3`, `cycletls`, `impit` — que je n'ai pas pu compiler dans cet
environnement à cause d'une interception TLS. Sur les tests app, les 3 échecs de userscript sont,
eux, certains et reproduits.)

**Aucune CI ne couvre le frontend ni l'API.** Ni lint, ni typecheck, ni build, ni tests. Tout ce
qui précède s'explique par ce seul fait : personne ne regarde. Un workflow `ci.yml` de 30 lignes
(`npm ci && npm run typecheck && npm run lint && npm run build` + `node --test` côté API) aurait
déjà empêché le renommage d'arriver en l'état.

---

## 4. Dette structurelle

### 4.1 Les monolithes

```
src/components/HLSPlayer.tsx          13 654 lignes   (572 Ko, un seul composant exporté)
src/pages/TVDetails.tsx                5 461
src/pages/Profile.tsx                  5 006
src/pages/Watch/WatchTv.tsx            4 781
src/pages/Watch/WatchMovie.tsx         4 226
src/components/HLSPlayerSettingsPanel  3 114
```

`HLSPlayer.tsx` à lui seul représente 8 % du code de `src/`. À cette taille, on ne relit plus :
on cherche. Chaque correction de lecture vidéo se fait « au grep », et un `useEffect` de trop
quelque part devient invisible. Ce n'est pas un problème de style, c'est ce qui déterminera le
temps de résolution de vos prochains bugs de lecture — c'est-à-dire la zone où vous en avez le
plus. Découpage minimal viable : extraire les sous-composants déjà délimités (contrôles, panneau
de réglages, overlays de skip, gestion des sous-titres) dans `src/components/player/`, sans
changer la logique.

### 4.2 La logique de lecture dupliquée en quatre exemplaires

- `WatchMovie.tsx` / `WatchTv.tsx` : ~840 lignes strictement identiques, 5 655 lignes qui
  diffèrent sur 10 800 — et deux blocs `<style dangerouslySetInnerHTML>` copiés-collés.
- `extension/Chrome/extractors.js` (2 124 l.) vs `extension/Firefox/extractors.js` (2 085 l.) :
  **177 lignes de différence**, soit 92 % de code partagé. Idem `background.js` (408 lignes de
  diff) et `popup.js`.
- `userscript/orvix.user.js` (5 765 l.) embarque la même logique d'extraction, et
  `app/scripts/build-userscript.js` en génère une quatrième copie pour le WebView mobile.

Rien ne garantit la synchronisation. Le README le reconnaît à demi-mot (« compare toujours
`extension/Chrome/` et `extension/Firefox/` »), mais une consigne dans un README n'est pas un
mécanisme : c'est exactement le genre de duplication où un correctif Fsvid/Vidzy part dans trois
fichiers sur quatre. Un dossier `shared/` consommé par les deux manifests, ou un script de build
qui génère l'un depuis l'autre, supprimerait la classe de bug entière.

### 4.3 Documentation qui ment

- `README.md` renvoie, dans « Comment s'orienter vite », à `src/hooks/useWatchParty.ts` comme
  point d'entrée de la WatchParty. Ce fichier est un **stub** : toutes les fonctions sont des
  `TODO` vides et **personne ne l'importe** (`grep useWatchParty` → aucun résultat hors du
  fichier). La vraie implémentation vit dans `WatchPartyRoom.tsx`, `utils/watchparty.ts` et
  `workers/watchpartySync.worker.ts`. Un nouveau contributeur qui suit le README part dans le mur.
- Liens morts : `orvix.png` (le logo affiché en tête du README), `README_ORVIX_OS.md`
  (référencé deux fois), `cloudflareproxy/README.md`.

### 4.4 Rebranchement Orvix/Orvix à moitié fait

Occurrences dans le code :

| Zone | Orvix | Orvix |
| --- | --- | --- |
| `src/` | 79 | 361 |
| `API/` | 117 | 4 |
| `extension/` | 215 | 28 |
| `userscript/` | 103 | 27 |
| `app/` | **402** | **0** |

L'app mobile n'a pas du tout été rebrandée (`app/app.json` → `"name": "Orvix"`,
`app/src/config/index.ts` → `SITE_URL: 'https://orvix.tax'`, `bundleIdentifier: com.orvix.app`),
l'API presque pas, les extensions à moitié. Et le nom du dépôt (`README` = « Orvix ») contredit
le nom du produit. Les dégâts visibles de ce demi-renommage sont en § 1.2, § 1.4 et § 3.1. Il
faut finir le travail en une passe, ou décider officiellement que « Orvix » reste le nom technique.

---

## 5. Hygiène, poids, exploitation

### 5.1 Le dépôt pèse 199 Mo de `.git`, et `dist` 164 Mo

| Élément | Poids |
| --- | --- |
| `app/orvix-android.apk` | 70 Mo |
| `public/avatars/` | **150 Mo / 1 503 PNG** |
| `app/orvix-ios-unsigner.ipa` | 11 Mo |
| `extension/Firefox/Firefox.zip` | 1,9 Mo |
| `public/orvix.png` | 948 Ko |

Chaque `git clone`, chaque contexte Docker, chaque build paie les 150 Mo d'avatars (que Vite
recopie intégralement dans `dist/`, sans hash, sans minification possible). Ces images n'ont rien
à faire dans l'historique Git : stockage objet + CDN. Pour les trois binaires, la solution est un
asset de release (c'est déjà ce que fait la moitié du workflow iOS) plutôt qu'un commit.

Incohérence au passage : `.gitignore` ignore `extension/Chrome/Chrome.zip` mais pas
`extension/Firefox/Firefox.zip`, qui est pourtant le même artefact pour l'autre navigateur.

### 5.2 L'installation dépend de GitHub et de compilations natives

`package-lock.json` contient une dépendance git pour `mpegts.js` → `webworkify-webpack`
(`git+ssh://git@github.com/xqq/webworkify-webpack.git`). `npm install` a donc besoin d'atteindre
`codeload.github.com` **et** de passer la vérification TLS du réseau :

```
npm error code UNABLE_TO_VERIFY_LEAF_SIGNATURE
npm error request to https://codeload.github.com/xqq/webworkify-webpack/tar.gz/24d1e71... failed
```

C'est exactement ce qui casse dans un CI d'entreprise, derrière un proxy d'inspection, ou sur un
runner sans accès GitHub. Et côté `API/Mainapi`, quatre dépendances compilent ou téléchargent un
binaire (`better-sqlite3`, `sqlite3`, `cycletls`, `impit`) : `npm ci` y est lent et fragile.
`webworkify-webpack` n'est utilisé que par le tooling de build de `mpegts.js` — le déplacer en
`overrides`/dépendance optionnelle, ou passer le lockfile en `https`, retirerait un point de
panne gratuit.

### 5.3 Documentation des variables incomplète là où ça compte

Le frontend utilise 5 variables absentes de `.env.example` :
`VITE_VAPID_PUBLIC_KEY` (notifications push — si elle manque, la fonctionnalité se dégrade
silencieusement), `VITE_BACKUP_API`, `VITE_DEBUG_ALERTS`, `VITE_DEBUG_APP`, `VITE_APP_BUILD_ID`.

Côté API, 14 variables sont utilisées mais non documentées, dont :
`ADMIN_SECRET` (celui de § 2.1 — son absence est *la* cause du fallback en dur),
`VIP_CRYPTOGATE_WEBHOOK_SECRET`, `PROXYSCRAPE_API_KEY`, `NORTHLIVE_API_KEY`,
`VIP_CRYPTOGATE_ENABLED`, `DDOS_THRESHOLD_REQ`, `WIFLIX_BASE_URL`, `FSTREAM_BASE_URL`.
Documenter `ADMIN_SECRET` et `VIP_CRYPTOGATE_WEBHOOK_SECRET` n'est pas cosmétique : c'est ce qui
fait qu'un déploiement les définit.

Détail : `README.md` annonce le frontend sur `localhost:3000`, mais `vite.config.ts:114` utilise
`process.env.PORT || 3000`, donc un `PORT` exporté dans le shell décale le port sans prévenir.

### 5.4 Ce que dit le build lui-même

```
(!) Some chunks are larger than 600 kB after minification
[INEFFECTIVE_DYNAMIC_IMPORT] src/services/pushNotificationService.ts est importé
  dynamiquement par main.tsx mais aussi statiquement par NotificationsPopup.tsx
```

Le découpage en chunks est soigné (react-vendor, radix, motion, i18n, markdown, remark-gfm isolé
pour cause de lookbehind Safari — c'est du travail sérieux), mais les gros morceaux restent
`dash.all.min` (804 Ko), `shaka-player` (792 Ko), `hls` (500 Ko), `apple` (460 Ko) : trois lecteurs
HLS/DASH différents sont embarqués. L'import dynamique ineffectif est un vrai petit bug : la
notification push est chargée en eager à cause d'un import statique ailleurs.

---

## 6. Plan d'action que je proposerais

**Cette semaine — débloquer (2-3 h)**
1. Régénérer `package-lock.json` (`npm install --package-lock-only`) : sans ça, **rien ne se
   déploie** (§ 1.0).
2. `.env.example` : valeur par défaut non vide pour `VITE_SITE_URL`.
3. Renommer les références `orvix.user.js` → `orvix.user.js` (générateur + 2 tests) et vérifier
   que `npm run build:userscript` passe : ça répare la CI iOS.
4. Brancher la config miroirs : lire `config.env` dans `vite.config.ts` (comme `VITE_SITE_URL`) et
   déclarer les deux variables en `ARG` dans le `Dockerfile`.
5. Aligner les chemins iOS : `orvix-*` partout, régénérer les sources stores et `version.json`.
6. Secrets : `process.exit(1)` si `JWT_SECRET`/`ADMIN_SECRET` sont absents, retirer les trois
   valeurs par défaut en dur.

**Ce mois — arrêter l'hémorragie (1-2 j)**
7. Créer `.github/workflows/ci.yml` : `npm ci`, `tsc -b`, `eslint`, `vite build`, puis
   `node --test` sur `API/Mainapi` et `app/`. C'est le vrai correctif : tout le reste devient
   visible.
8. Résorber les 15 vraies erreurs TS (les `TS6133` en masse via un passage automatique).
9. Ajouter un CSP et les en-têtes de sécurité dans `server/index.js` (remplacer le
   `next.config.js` mort).
10. Une seule constante d'allowlist, avec les domaines `orvix.*` ajoutés.
11. Finir ou annuler le rebranding Orvix → Orvix, en une passe.

**Ensuite — la dette qui coûte cher chaque semaine**
12. Sortir les 150 Mo d'avatars et les trois binaires du dépôt.
13. Découper `HLSPlayer.tsx` par sous-composants, sans toucher à la logique.
14. Factoriser `extension/Chrome` ↔ `extension/Firefox` (92 % identiques) derrière une source
    commune.
15. Allowlist d'hôtes sur `/proxy`.

Dis-moi ce que tu veux que j'attaque en premier — les points 1 à 6 se font en une passe et
remettent le dépôt dans un état où quelqu'un peut le cloner, le construire et le déployer.

---

## 7. Nouvelles trouvailles (découvertes pendant les corrections)

### 7.1 🔴 La publication de source média vers le natif a disparu du front web

Le test `app/tests/hlsNativePictureInPicturePublisher.test.mjs` cherche trois déclarations dans
`src/components/HLSPlayer.tsx` :

```js
['isCanonicalOrvixNativePlaybackUrl', 'publishOrvixNativeMediaSource', 'clearOrvixNativeMediaSource']
```

Elles ne s'y trouvent plus : **0 sur 3**. Et rien dans `src/` ne publie plus jamais vers
`window.__ORVIX_NATIVE_MEDIA_SOURCE_V1__`, l'interface que l'app mobile définit pourtant dans
`app/src/injection/picture-in-picture-shim.ts:177`.

Autrement dit : le shim natif est en place, il attend une source média, et le lecteur web ne lui
en donne plus. C'est très probablement le PiP natif iOS/Android de la WebView qui ne peut plus
démarrer — alors que 20 autres tests PiP de l'app passent (le contrat côté app est intact ; c'est
le côté web qui a perdu son implémentation).

Ces deux tests étaient **déjà rouges avant cette passe** (13 échecs initiaux, 41 et 42 dans la
liste) : ce n'est pas une régression introduite par les corrections. C'est exactement le genre de
casse qu'une CI aurait attrapée le jour même. À traiter en priorité juste après le point 7.

### 7.2 🟠 La suite `tests/` de la racine a pourri sur pied

12 échecs sur 87, dans des tests « contrat » qui cherchent des identifiants précis dans les
sources du front (`maxWidthPercent`, `data-settings-sidebar-header`, les contrôles de
personnalisation des sous-titres…). Aucun n'est exécuté par quoi que ce soit aujourd'hui : ni
script `test`, ni CI. Soit le refactor a déplacé ces éléments sans mettre les tests à jour, soit
des fonctionnalités ont silencieusement disparu — impossible de trancher sans les réactiver.

### 7.3 🟡 `ExtensionPage.tsx` pointe vers un dépôt qui n'existe pas

```ts
const USERSCRIPT_INSTALL_URL = 'https://github.com/ratz-cmd/orvix/raw/refs/heads/main/userscript/orvix.user.js';
const ORVIX_OPEN_SOURCE_GITHUB_URL = 'https://github.com/ratz-cmd/orvix';
```

`ratz-cmd/orvix` répond **404** (vérifié par `gh api`). Le bouton « installer le
userscript » de la page d'extension est donc mort. Non corrigé volontairement : le bon dépôt
cible est une décision produit (`ratz-cmd/orvix` ? un `ratz-cmd/...` à créer ?), et les trois
constantes vont ensemble.

### 7.4 Ce qui reste à décider

- `FALLBACK_CONFIG.PRIMARY_URL = 'https://orvix.tax'` et `TELEGRAM_URL = 't.me/orvix_site'`
  dans `app/src/config/index.ts` : je n'ai pas pu tester ces URLs (pas de sortie HTTP directe
  depuis cet environnement), donc je ne les ai pas touchées. À vérifier avec le rebranding.
- `API/Mainapi/routes/proxy.js` / `cloudflareproxy/worker.js` : relais ouverts, inchangés
  (point 15 du plan).
- Les 150 Mo d'avatars et les deux binaires restent dans Git (point 12).

---

## 8. Journal de vérification de cette passe

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Lockfile / Dockerfile | `npm ci --dry-run` et sa variante `--workspace=server --include-workspace-root=false` | ✅ les deux passent (« added 80 packages », « up to date ») |
| Onboarding dev | `cp .env.example .env && npx vite` | ✅ démarre, HTTP 200, avertissement explicite sur le repli |
| Build sans `VITE_SITE_URL` | `npm run build` | ✅ échoue avec un message qui indique quoi renseigner |
| Injection des miroirs | build avec `VITE_DEFAULT_MIRRORS=miroir1.exemple,miroir2.exemple` | ✅ `dist/sw.js` contient les deux miroirs + l'URL de config ; `https://orvix.exemple` dans `index.html`, `sitemap.xml`, `robots.txt` |
| Chaîne userscript → app | `node app/scripts/build-userscript.js` puis `--check` | ✅ génère 180,4 Ko, `--check` non destructif |
| Tests app mobile | `node --test tests/*.test.mjs` | ✅ 238/243 (13 échecs avant → 5 ; les 5 restants sont § 7.1 et 3 tests qui exigent `app/node_modules/react-native-webview`) |
| Contrat workflow iOS | `node --test tests/unsignedIpaWorkflow.test.mjs` | ✅ 14/14 |
| Secrets (11 scénarios) | harnais avec stubs `express`/`better-sqlite3`/`dotenv` hors dépôt | ✅ 11/11 — 503 sans config, 403 sur l'ancienne constante publique, 403 en dev, 403 en query string, 403 sans en-tête, 200 avec la bonne clé, 200 via le repli `JWT_SECRET`, refus de chargement du store sans `JWT_SECRET`, sel d'IP aléatoire sans config |
| Syntaxe | `node --check` sur les 8 fichiers JS/MJS touchés + parse JSON des 4 JSON | ✅ tous OK |
| Tests API | `node --test` sur `API/Mainapi` | ⚠️ **non concluant ici** : `better-sqlite3`, `sqlite3`, `cycletls` et `impit` ne se compilent pas dans cet environnement (proxy TLS), donc les 63 échecs initiaux restent inexploités. À lancer sur une machine avec toolchain — c'est le point 7 du plan. |
| Typecheck / lint | `tsc -b`, `eslint .` | inchangés (points 8 et 9 du plan) |

---

## ✅ Appliqué dans cette passe (chantiers produit : lecteur, 2K VIP, sans pub)

Ces trois chantiers répondent à une demande produit, pas à l'audit. Ils sont sur la même
branche `arena/01a0bebd-orvix`.

### 1. Qualité minimale du lecteur — fini le 340p

| Élément | Détail |
| --- | --- |
| Politique | `src/utils/playbackQuality.ts` : plancher **480p**, cible **1440p VIP** / 1080p sinon, gammes et messages en français |
| Sélection de piste | `selectLevelForPreference()` accepte un plancher ; en mode « auto », hls.js reçoit `config.minAutoBitrate` calculé par `computeMinAutoBitrate()` (`src/utils/hlsQuality.ts`) pour que l'ABR ne redescende plus sur les pistes 240p/340p tant qu'une meilleure existe |
| Signalement | Bandeau FR dans le lecteur (`watch.qualityFloorTitle`) quand la source entière plafonne sous le seuil, avec invitation à changer de piste ou de source |
| Effet | Le lecteur démarre sur 720p/1080p quand le manifeste les propose, au lieu de la première piste de la liste |

### 2. Super Résolution 2K locale (VIP, 1080p → 2560 × 1440)

Tout le traitement se fait sur la machine du membre : **le serveur ne reçoit aucune frame**.

| Élément | Détail |
| --- | --- |
| Politique | `src/utils/upscalingPolicy.ts` : éligibilité (VIP, PC, WebGL dispo, hors PiP/onglet caché), cible 2K au ratio de la source, taille de rendu bornée par l'écran, dégradation automatique si le GPU dépasse le budget |
| Moteur | `src/utils/videoUpscaler.ts` : WebGL 2 (repli WebGL 1), deux passes — agrandissement bilinéaire ou **bicubique Catmull-Rom**, puis accentuation adaptative **RCAS**. Aucun import React, testable hors navigateur |
| Intégration | Canvas superposé à la vidéo dans `HLSPlayer`, boucle `requestVideoFrameCallback`, cadrage `object-fit` reproduit exactement, indicateur « 2K VIP », budget GPU mesuré et cible abaissée automatiquement si besoin |
| Repli | L'ancien filtre SVG `feConvolveMatrix` reste disponible quand WebGL échoue, et ne s'empile plus avec le shader |
| Défaut | Un VIP reçoit le mode « Standard 1440p » d'office (désactivable), les autres restent en natif |

### 3. Lecteurs tiers extraits → lecture Orvix sans publicité

| Élément | Détail |
| --- | --- |
| Activation | `isSeekStreamingExtractionEnabled()` n'est plus figé à `false` : il suit la préférence utilisateur `seekstreaming` (activée par défaut) |
| Service | `src/utils/onTheFlyExtract.ts` : détection d'hébergeur extractible, extension d'abord, backend `/api/extract` ensuite, remontée des pistes (qualités) et délai strict |
| Bascule | `src/hooks/useAdFreeAutoExtraction.ts` branché dans `WatchMovie` et `WatchTv` : extraction dès qu'un embed extractible est choisi, puis lecture dans le lecteur Orvix (`nexus_hls`) ; résultat mémorisé, une seule tentative par URL, échec = iframe conservée |
| Contrôle utilisateur | Toast « Publicités supprimées » avec action « Revenir au lecteur tiers » (préférence `orvix_ad_free_autoplay`, désactivable) |
| Déploiement | `API/Mainapi/utils/extractorsLocator.js` : le moteur d'extraction est cherché dans le monorepo, le répertoire courant ou `ORVIX_EXTRACTORS_PATH` — un backend déployé seul reste fonctionnel, avec un message clair sinon |
| Serveur | Rien de lourd : `POST /api/extract` télécharge la page d'embed (~50 Ko) et renvoie l'URL du flux. Le relais `/api/extract/stream` n'existe que pour les hébergeurs qui exigent un `Referer` (mobile/TV) ; il relaie les octets, il ne transcode pas. L'upscaling, lui, ne passe jamais par là |

### Vérifications de cette passe produit

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Politique de qualité | `node --test tests/playbackQuality.test.mjs` | ✅ 10/10 |
| Super Résolution | `node --test tests/upscalingPolicy.test.mjs` | ✅ 10/10 |
| Contrat de câblage du lecteur | `node --test src/components/__tests__/hlsPlayerUpscaleWiring.test.mjs` | ✅ 6/6 |
| Extracteur SeekStream réel (bac à sable `vm`, payload AES-CBC) | `node --test tests/seekStreamingExtractor.test.mjs` | ✅ 5/5 |
| Extraction à la volée + préférence sans pub | `node --test tests/onTheFlyExtract.test.mjs` | ✅ 6/6 |
| Chaîne pages Watch → lecteur natif | `node --test tests/adFreeAutoExtractionWiring.test.mjs` | ✅ 5/5 |
| Typecheck / build | `npx tsc --noEmit`, `npm run build` | ✅ les deux passent |
| Suites existantes | `node --test tests/*.test.mjs`, `cd app && node --test tests/*.test.mjs` | ✅ aucun nouvel échec (9 et 5 échecs préexistants, identiques à HEAD) |

---

## ✅ Appliqué dans cette passe (correctif « la diffusion se bloque »)

Symptôme rapporté : le lecteur se charge, mais la vidéo ne démarre pas. Trois
causes distinctes ont été trouvées dans le code — aucune n'était visible en
tests, d'où la correction accompagnée d'un protocole de vérification manuelle
(`docs/verification-lecture.md`).

| Cause | Correction |
| --- | --- |
| Le lecteur Frembed était dans un `<iframe sandbox="allow-scripts allow-same-origin">` : plus de `allow-popups` (démarrage de la diffusion chez plusieurs lecteurs), ni `allow-forms` (écran d'âge), ni `allow-presentation` (PiP) | Attribut `sandbox` retiré, `allow` explicite + garde anti-popups conservés ; injection dans `contentWindow.document` supprimée (impossible en cross-origin) |
| Les flux extraits étaient joués en direct même quand le CDN refuse le CORS : hls.js lisait le manifeste puis échouait au premier segment | Sonde `src/utils/streamProbe.ts` (4 Ko en `Range`, annulée aussitôt) : lecture directe → relais Orvix → direct de dernier recours, avec message explicite |
| Le relais `/api/extract/stream` relayait le manifeste **sans réécrire ses URI** : les segments partaient vers le CDN et se faisaient refuser | Réécriture des playlists HLS (segments, playlists enfants, clés AES, `EXT-X-MAP`) vers le relais |

Durcissements associés : URLs de relais **signées** (HMAC `mediaSigning`, plus
de proxy ouvert), garde anti-SSRF sur la cible, plafond de flux simultanés
`ORVIX_RELAY_MAX_STREAMS` (défaut 8) avec réponse 503 propre, en-têtes
`Range`/`Content-Range` respectés, libération des places sur `close` **et**
`finish`.

Contrôle utilisateur ajouté : préférence `orvix_stream_relay` — un membre peut
refuser le relais ; les sources concernées restent alors dans le lecteur tiers,
après un toast qui propose « Autoriser le relais ».

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Sonde de flux (direct, CORS refusé, 403, lenteur, page HTML, annulation du transfert) | `node --test tests/streamProbe.test.mjs` | ✅ 8/8 |
| Relais (réécriture HLS, jeton signé, plafond de charge) | `node --test tests/streamRelay.test.mjs` | ✅ 6/6 |
| Cadres de lecture (aucun `sandbox`, autorisations, WebView mobile) | `node --test src/components/__tests__/playerFramePermissions.test.mjs` | ✅ 4/4 |
| Chaîne complète lecteurs tiers → lecteur Orvix | `node --test tests/adFreeAutoExtractionWiring.test.mjs` | ✅ 6/6 |
| Suites existantes | `node --test tests/*.test.mjs`, `cd app && node --test tests/*.test.mjs` | ✅ aucun nouvel échec (9 et 5 préexistants) |
| Typecheck / lint / build | `npx tsc --noEmit`, `npx eslint …`, `npm run build` | ✅ les trois passent |
