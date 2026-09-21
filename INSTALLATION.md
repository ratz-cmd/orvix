# Installer et lancer Orvix — et de quelles APIs le site a besoin

Deux parties : **la marche à suivre** (script, 5 minutes) puis **la liste des
services externes** dont le site dépend, avec ce qui est obligatoire et ce qui
ne l'est pas.

---

## 1. Installation en une commande

```bash
git clone --depth 1 https://github.com/ratz-cmd/orvix.git
cd orvix
bash scripts/install.sh
```

Le script :

1. vérifie l'environnement (git, Node 20+, npm, Python, MySQL/Redis) et
   **avertit sans bloquer** pour ce qui manque ;
2. clone le dépôt si besoin (`--dir` pour choisir le dossier) ;
3. installe les dépendances du frontend puis de l'API ;
4. crée et complète les fichiers `.env` — **sans jamais écraser une valeur
   existante** — et génère les secrets locaux (`JWT_SECRET`, `ADMIN_SECRET`,
   `MEDIA_SIGNING_SECRET`, `INTERNAL_API_KEY`) ;
5. demande votre clé TMDB si vous ne l'avez pas fournie ;
6. lance l'API puis le site.

### Options utiles

| Commande | Effet |
| --- | --- |
| `bash scripts/install.sh --check` | contrôle l'environnement, ne modifie rien |
| `bash scripts/install.sh --skip-backend` | site seul (utilise une API distante déjà déployée) |
| `bash scripts/install.sh --with-proxies` | installe aussi proxiesembed (Python, extraction avancée) |
| `bash scripts/install.sh --prod` | construit le site et sert `dist/` (port 3001) |
| `bash scripts/install.sh --stop` | arrête ce que le script a lancé |
| `bash scripts/install.sh --allow-host x.trycloudflare.com` | accepte un domaine de tunnel / proxy |
| `bash scripts/install.sh --dir /srv/orvix` | dossier d'installation |

Variables d'environnement équivalentes : `ORVIX_DIR`, `ORVIX_GIT_URL`,
`ORVIX_FRONT_PORT`, `ORVIX_API_PORT`, `ORVIX_TMDB_KEY`, `ORVIX_NPM_INSECURE=1`
(proxy TLS d'entreprise), `ORVIX_DEV_ALLOWED_HOSTS`.

### Après le lancement

| Service | URL | Rôle |
| --- | --- | --- |
| Site | http://localhost:3000 | interface (Vite, rechargement à chaud) |
| API principale | http://localhost:25565 | sources, comptes, VIP, extraction |
| proxiesembed | http://localhost:25569 | extraction avancée (*si `--with-proxies`*) |
| Site (production, `--prod`) | http://localhost:3001 | `dist/` servi par `server/index.js` |

Les journaux sont dans `.orvix/logs/`.

---

## 2. Les APIs dont le site a besoin

### Vue d'ensemble

| # | Service | Rôle | Obligatoire ? | Où ça se configure | Coût |
| --- | --- | --- | --- | --- | --- |
| 1 | **API principale Orvix** (`API/Mainapi`, ce dépôt) | catalogue, sources, extraction, comptes, VIP | **Oui** | `VITE_MAIN_API` (front) | hébergement |
| 2 | **TMDB** (`api.themoviedb.org`) | fiches, affiches, métadonnées, recherche | **Oui** | `VITE_TMDB_API_KEY` + `TMDB_API_KEY` | gratuit |
| 3 | **MySQL** | comptes, sessions, favoris, VIP, commentaires | Oui pour ces fonctions (le site démarre sans) | `DB_*` dans `API/Mainapi/.env` | hébergement |
| 4 | **proxiesembed** (`API/proxiesembed`, ce dépôt) | extraction JS (fsvid/vidzy), Live TV, DRM, relais signés | Recommandé | `VITE_PROXIES_EMBED_API` + `PROXIESEMBED_*` | hébergement |
| 5 | **Redis** | cache | Non (jamais bloquant) | `REDIS_*` | hébergement |
| 6 | Cloudflare Turnstile | anti-bot sur les formulaires | Non | `VITE_TURNSTILE_*` + `TURNSTILE_SECRET_KEY` | gratuit |
| 7 | FStream | source de lecture | Non (compte requis) | `FSTREAM_LOGIN_*` | compte |
| 8 | Uqload (XVideoSharing) | extraction Uqload | Non | `UQLOAD_API_KEY` | compte |
| 9 | SwiftFlow / NorthLive | catalogue MP4, Live TV sport | Non (partenaire) | `SWIFTFLOW_API_KEY` | payant |
| 10 | PayGate / Payblis | paiements VIP par carte | Non | `VIP_PAYGATE_*`, `VIP_PAYBLIS_*` | commission |
| 11 | Explorateurs BTC/LTC | vérification des paiements crypto | Non | `BTC_EXPLORER_API`, `LTC_EXPLORER_API` | gratuit |
| 12 | BestDebrid | débridage de liens | Non | `BESTDEBRID_API_KEY` | abonnement |
| 13 | Xtream / fournisseur IPTV | chaînes Live TV | Non | `XTREAM_*` | abonnement |
| 14 | OpenRouter | fonctions IA | Non | `OPENROUTER_API_KEY` | à l'usage |
| 15 | Web Push (VAPID) | notifications navigateur | Non | `VAPID_*` | gratuit |
| 16 | Discord (webhooks) | alertes internes | Non | `DISCORD_*` | gratuit |
| 17 | AniSkip / SkipDB / IntroDB | segments générique/intro | Non | rien (sauf `THEINTRODB_API_KEY`) | gratuit |

**Minimum pour un site qui marche** : 1 + 2. Sans MySQL vous perdez les comptes
et le VIP ; sans proxiesembed vous perdez une partie des extractions, la Live TV
et le DRM.

---

### 2.1 API principale Orvix (indispensable)

C'est le backend de ce dépôt (`API/Mainapi`, Node.js, port **25565**). Elle
expose le catalogue TMDB mis en cache, les agrégateurs de sources, l'extraction
des flux, les comptes, les favoris, les commentaires et les licences VIP.

```bash
cd API/Mainapi && npm install && npm start
```

Côté frontend : `VITE_MAIN_API=http://localhost:25565`.
Côté serveur : `PUBLIC_API_BASE` (URL publique de l'API) et
`FRONTEND_BASE_URL` (domaine du site) servent à construire les liens absolus.

> **Piège n°1 : le domaine du site doit être autorisé par l'API.** La liste des
> origines acceptées contient les miroirs officiels (`orvix.*`) ; votre domaine
> doit être ajouté, sinon la page se charge puis **toutes** les requêtes API
> échouent (CORS). Renseignez :
>
> ```
> ORVIX_ALLOWED_ORIGINS=orvix.fr,www.orvix.fr
> ```
>
> `bash scripts/install.sh` le remplit automatiquement à partir de
> `VITE_SITE_URL`.

### 2.2 TMDB (indispensable, gratuit)

Fournit les métadonnées : titres, affiches, résumés, saisons, recherche.
Créez une clé (gratuite) sur <https://www.themoviedb.org/settings/api>.

Deux variables, **la même clé** :

| Fichier | Variable | Usage |
| --- | --- | --- |
| `.env` (front) | `VITE_TMDB_API_KEY` | affiches, fiches, pages de recherche |
| `API/Mainapi/.env` | `TMDB_API_KEY` | catalogue côté serveur, agrégateurs |

Sans elle : le site s'affiche, mais sans contenu.

### 2.3 MySQL (comptes, VIP, commentaires)

Le serveur **démarre sans** MySQL (`MySQL connection error (non-fatal in dev)`),
mais tout ce qui touche aux comptes échoue. Tables créées automatiquement au
premier démarrage.

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=orvix
DB_PASSWORD=...
DB_NAME=orvix
```

### 2.4 proxiesembed (recommandé)

Service Python du dépôt (`API/proxiesembed/server.py`, port **25569**). Il
apporte :

- l'exécution de JavaScript dans un bac à sable (extraction fsvid/vidzy) ;
- les flux Live TV et le DRM (France.tv, KissKH) ;
- le relais d'en-têtes **signé** (HMAC) utilisé quand un CDN d'hébergeur
  refuse le CORS.

```bash
cd API/proxiesembed
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

`MEDIA_SIGNING_SECRET` et `INTERNAL_API_KEY` doivent être **identiques** dans
`API/Mainapi/.env` et `API/proxiesembed/.env` (le script le fait pour vous).
Côté navigateur : `VITE_PROXIES_EMBED_API` et `PROXIESEMBED_PUBLIC_URL`.

### 2.5 Redis (optionnel)

Cache uniquement : le site fonctionne sans, un peu plus lentement. Utile si
vous hébergez plusieurs instances.

### 2.6 Services optionnels, par fonctionnalité

| Fonctionnalité | Services / clés |
| --- | --- |
| Anti-bot (inscriptions, likes, commentaires) | Cloudflare Turnstile : `VITE_TURNSTILE_SITE_KEY`, `VITE_TURNSTILE_INVISIBLE_SITEKEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_IP_SALT` |
| Source FStream | `FSTREAM_LOGIN_NAME`, `FSTREAM_LOGIN_PASSWORD` |
| Extraction Uqload | `UQLOAD_API_KEY` |
| Catalogue MP4 + Live TV sport (partenaire) | `SWIFTFLOW_BASE_URL`, `SWIFTFLOW_API_KEY`, `NORTHLIVE_BASE_URL`, `VAVOO_BASE_URL` |
| Chaînes IPTV | `XTREAM_URL`, `XTREAM_USER`, `XTREAM_PASS` |
| Paiements VIP carte | `VIP_PAYGATE_*` ou `VIP_PAYBLIS_*` |
| Paiements VIP crypto | `VIP_BTC_XPUB`, `VIP_LTC_XPUB`, `BTC_EXPLORER_API`, `LTC_EXPLORER_API` |
| Débridage | `BESTDEBRID_API_KEY` |
| Notifications push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Alertes internes | `DISCORD_SCRAPER_WEBHOOK`, `DISCORD_COMMENTS_WEBHOOK_URL`, `VITE_ERROR_DISCORD_WEBHOOK_URL`, … |
| Fonctions IA | `OPENROUTER_API_KEY` |
| Segments intro/outro | AniSkip, SkipDB et IntroDB sont ouverts ; `THEINTRODB_API_KEY` pour TheIntroDB |
| Publicités (optionnel) | `VITE_AD_DIRECT_URLS_ADULT`, `VITE_AD_DIRECT_URL_SFW`, `VITE_AD_SCRIPT_SRC`, `VITE_SWIFTFLUX_AD_URL` — vides, le site tourne sans publicité |
| Analytique | `VITE_ANALYTICS_PROVIDER` (`none`, `ga`, `plausible`) |

---

## 3. Mise en production

1. **Construire le site** : `VITE_SITE_URL=https://votre-domaine.fr npm run build`
   (`VITE_SITE_URL` est obligatoire : le build échoue sans, volontairement).
2. **Servir `dist/`** : `npm start` (Hono, port 3001) ou un serveur statique.
3. **Lancer l'API** : `cd API/Mainapi && NODE_ENV=production npm start` (25565).
4. **Reverse proxy** (nginx/Caddy) conseillé : `/` → front, `/api` → API, sous
   un même domaine HTTPS. Renseignez alors :

   ```ini
   VITE_SITE_URL=https://votre-domaine.fr
   VITE_MAIN_API=https://api.votre-domaine.fr     # ou https://votre-domaine.fr si /api est proxifié
   ORVIX_ALLOWED_ORIGINS=votre-domaine.fr          # dans API/Mainapi/.env
   FRONTEND_BASE_URL=https://votre-domaine.fr      # dans API/Mainapi/.env
   PUBLIC_API_BASE=https://api.votre-domaine.fr    # dans API/Mainapi/.env
   ```

5. **Penser à** `NODE_ENV=production`, un `JWT_SECRET` unique et long, et le
   plafond `ORVIX_RELAY_MAX_STREAMS` (8 par défaut) si vous relayez des flux.

Un `Dockerfile` est fourni pour le frontend. Attention : il ne copie pas `API/`
ni `extension/` ; si vous déployez l'API séparément, publiez aussi le dossier
`extension/` à côté d'elle, sinon l'extraction « sans publicité » est muette
(`ORVIX_EXTRACTORS_PATH` permet de pointer ailleurs).

---

## 4. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| La page se charge, aucune donnée, erreurs CORS en console | Domaine absent de la liste des origines de l'API | `ORVIX_ALLOWED_ORIGINS=votre-domaine.fr` dans `API/Mainapi/.env`, puis redémarrage |
| Catalogue vide, affiches cassées | Clé TMDB manquante | `VITE_TMDB_API_KEY` (front) + `TMDB_API_KEY` (API) |
| `Blocked request. This host is not allowed.` | Serveur de dev exposé derrière un tunnel/proxy | `bash scripts/install.sh --allow-host votre-domaine` ou `VITE_DEV_ALLOWED_HOSTS` |
| `npm install` échoue (projet SSL) | Proxy TLS d'entreprise | `ORVIX_NPM_INSECURE=1 bash scripts/install.sh` |
| `npm install` de l'API échoue | Compilation native (`better-sqlite3`, `cycletls`, `impit`) : toolchain manquante | Installez `build-essential python3 make g++` ou lancez `--skip-backend` |
| Extraction sans publicité inopérante | Backend sans dossier `extension/`, ou extracteur désactivé dans les réglages | Copiez `extension/` à côté de `API/` (ou `ORVIX_EXTRACTORS_PATH`) |
| Comptes / VIP indisponibles | MySQL absent ou mal configuré | Voir § 2.3 |
| Vidéo « bloquée » au démarrage | CDN sans CORS et relais désactivé/plafonné | Vérifier `MEDIA_SIGNING_SECRET`, `ORVIX_RELAY_MAX_STREAMS` ; le membre peut autoriser le relais dans le lecteur |

---

## 5. Rappel des ports

| Port | Service | Variable |
| --- | --- | --- |
| 3000 | Site (développement) | `PORT` / `ORVIX_FRONT_PORT` |
| 3001 | Site (production, `npm start`) | `PORT` |
| 25565 | API principale | fixe (`server.js`) |
| 25566 | WatchParty | `API/watchpartyAPI/.env` |
| 25569 | proxiesembed | `PROXIESEMBED_PUBLIC_URL` |
