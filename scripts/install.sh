#!/usr/bin/env bash
#
# Orvix — installation et lancement en une commande.
#
#   bash scripts/install.sh                 # clone, installe, configure, lance
#   bash scripts/install.sh --check         # vérifie l'environnement, ne modifie rien
#   bash scripts/install.sh --prod          # build + serveur de production
#   bash scripts/install.sh --skip-backend  # frontend seul (pas d'API locale)
#   bash scripts/install.sh --stop          # arrête ce que le script a lancé
#   bash scripts/install.sh --allow-host x.trycloudflare.com   # tunnel / proxy
#
# Le script est idempotent : relancé, il réutilise le clone, complète les .env
# manquants (sans jamais écraser une valeur existante) et réinstalle seulement
# ce qui manque.
#
# Variables d'environnement reconnues :
#   ORVIX_DIR         dossier d'installation        (défaut : ./orvix)
#   ORVIX_GIT_URL     dépôt à cloner                (défaut : GitHub ratz-cmd/orvix)
#   ORVIX_FRONT_PORT  port du site                  (défaut : 3000)
#   ORVIX_API_PORT    port de l'API principale      (défaut : 25565)
#   ORVIX_PROXY_PORT  port de proxiesembed          (défaut : 25569)
#   ORVIX_TMDB_KEY    clé TMDB (sinon une question est posée en interactif)
#   ORVIX_NPM_INSECURE=1  relance npm avec --strict-ssl=false (proxy TLS d'entreprise)
#   ORVIX_DEV_ALLOWED_HOSTS  domaines acceptés par le serveur de dev (tunnel, proxy)

set -euo pipefail

# ────────────────────────────────────────────────────────────────────────────
#  Valeurs par défaut et options
# ────────────────────────────────────────────────────────────────────────────

ORVIX_GIT_URL="${ORVIX_GIT_URL:-https://github.com/ratz-cmd/orvix.git}"
TARGET_DIR="${ORVIX_DIR:-$PWD/orvix}"
FRONT_PORT="${ORVIX_FRONT_PORT:-3000}"
API_PORT="${ORVIX_API_PORT:-25565}"
PROXY_PORT="${ORVIX_PROXY_PORT:-25569}"

SKIP_BACKEND=0
WITH_PROXIES=0
CHECK_ONLY=0
DO_START=1
STOP_ONLY=0
MODE="dev"
FULL_CLONE=0
TMDB_KEY="${ORVIX_TMDB_KEY:-}"
ALLOWED_HOSTS="${ORVIX_DEV_ALLOWED_HOSTS:-}"

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)          TARGET_DIR="$2"; shift 2 ;;
    --git-url)      ORVIX_GIT_URL="$2"; shift 2 ;;
    --port)         FRONT_PORT="$2"; shift 2 ;;
    --api-port)     API_PORT="$2"; shift 2 ;;
    --proxy-port)   PROXY_PORT="$2"; shift 2 ;;
    --skip-backend) SKIP_BACKEND=1; shift ;;
    --with-proxies) WITH_PROXIES=1; shift ;;
    --prod)         MODE="prod"; shift ;;
    --build)        MODE="prod"; DO_START=0; shift ;;
    --no-start)     DO_START=0; shift ;;
    --full-clone)   FULL_CLONE=1; shift ;;
    --allow-host)   ALLOWED_HOSTS="${ALLOWED_HOSTS:+$ALLOWED_HOSTS,}$2"; shift 2 ;;
    --check)        CHECK_ONLY=1; DO_START=0; shift ;;
    --stop)         STOP_ONLY=1; DO_START=0; shift ;;
    -h|--help)      usage ;;
    *) echo "Option inconnue : $1" >&2; usage ;;
  esac
done

# ────────────────────────────────────────────────────────────────────────────
#  Affichage
# ────────────────────────────────────────────────────────────────────────────

if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
fi

step()  { printf '\n%s── %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET"; }
ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
info()  { printf '  %s·%s %s\n' "$C_DIM" "$C_RESET" "$*"; }
die()   { printf '\n%s✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# Vrai si le port est occupé. Silencieux si aucun outil ne permet de savoir :
# on préfère démarrer et laisser le serveur échouer explicitement.
port_in_use() {
  local port="$1"
  if have lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0 || return 1
  fi
  if have ss; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$" && return 0 || return 1
  fi
  if have netstat; then
    netstat -an 2>/dev/null | grep -qE "[:.]${port}[[:space:]].*LISTEN" && return 0 || return 1
  fi
  return 1
}

random_secret() {
  if have openssl; then
    openssl rand -hex 32
  else
    # Repli sans openssl : 64 caractères hexadécimaux depuis /dev/urandom.
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  fi
}

# Renseigne une clé dans un fichier .env, sans jamais écraser une valeur
# existante non vide. Crée la ligne si absente.
set_env_var() {
  local file="$1" key="$2" value="$3"
  [ -f "$file" ] || : > "$file"
  if grep -qE "^${key}=" "$file"; then
    local current
    current="$(grep -E "^${key}=" "$file" | head -1 | cut -d= -f2-)"
    if [ -n "$current" ]; then return 0; fi
    # Valeur vide : on la complète (portable GNU/BSD sed).
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" '
      BEGIN { FS = "="; done = 0 }
      {
        if (!done && $1 == k) { print k "=" v; done = 1 } else { print }
      }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# ────────────────────────────────────────────────────────────────────────────
#  1. Vérifications de l'environnement
# ────────────────────────────────────────────────────────────────────────────

step "1/6 · Vérification de l'environnement"

[ -n "$TARGET_DIR" ] || die "Dossier cible vide"

have git || die "git est introuvable. Installez git puis relancez."
ok "git $($(command -v git) --version | awk '{print $3}')"

have node || die "Node.js est introuvable. Installez Node.js 20 ou plus (https://nodejs.org)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js $(node -v) est trop ancien : il faut la version 20 ou plus."
elif [ "$NODE_MAJOR" -lt 20 ]; then
  warn "Node.js $(node -v) : 18 fonctionne, 20+ est recommandé."
else
  ok "Node.js $(node -v)"
fi

have npm || die "npm est introuvable (il vient normalement avec Node.js)."
ok "npm $(npm -v)"

if have python3; then
  ok "python3 $(python3 -V 2>&1 | awk '{print $2}') (utile seulement pour proxiesembed)"
else
  warn "python3 absent : le service proxiesembed sera indisponible (extraction avancée, Live TV, DRM)."
fi

have mysql || have mysqld || warn "MySQL absent : le site démarre, mais comptes, favoris, VIP et commentaires seront inactifs."
have redis-server || have redis-cli || warn "Redis absent : il ne sert que de cache, le site fonctionne sans."

# État des ports (avertissement seulement : l'utilisateur peut avoir déjà lancé le site)
if port_in_use "$FRONT_PORT"; then warn "Le port $FRONT_PORT est déjà utilisé (site déjà lancé ?)."; fi
if [ "$SKIP_BACKEND" -eq 0 ] && port_in_use "$API_PORT"; then
  warn "Le port $API_PORT est déjà utilisé (API déjà lancée ?)."
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf '\n%sVérification terminée.%s Rien n'"'"'a été modifié (mode --check).\n' "$C_BOLD" "$C_RESET"
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
#  2. Récupération du dépôt
# ────────────────────────────────────────────────────────────────────────────

step "2/6 · Récupération du dépôt"

# Cas 1 : on est déjà dans un clone d'Orvix (le script est lancé depuis le dépôt).
if [ -f "$PWD/package.json" ] && grep -q '"streaming-site"' "$PWD/package.json" 2>/dev/null; then
  TARGET_DIR="$PWD"
  ok "Dépôt déjà présent : $TARGET_DIR"
elif [ -d "$TARGET_DIR/.git" ]; then
  ok "Dépôt déjà cloné : $TARGET_DIR"
  if [ "$STOP_ONLY" -eq 0 ]; then
    info "Mise à jour (git pull --ff-only)…"
    git -C "$TARGET_DIR" pull --ff-only || warn "Mise à jour impossible (modifications locales ?), on continue en l'état."
  fi
elif [ -e "$TARGET_DIR" ]; then
  die "$TARGET_DIR existe déjà et n'est pas un dépôt git. Choisissez un autre dossier avec --dir."
else
  info "Clonage de $ORVIX_GIT_URL → $TARGET_DIR"
  if [ "$FULL_CLONE" -eq 1 ]; then
    git clone "$ORVIX_GIT_URL" "$TARGET_DIR" || die "Clone impossible. Vérifiez l'accès au dépôt."
  else
    # Clone superficiel : ~2× plus rapide, suffisant pour faire tourner le site.
    git clone --depth 1 "$ORVIX_GIT_URL" "$TARGET_DIR" \
      || git clone "$ORVIX_GIT_URL" "$TARGET_DIR" \
      || die "Clone impossible. Vérifiez l'accès au dépôt."
  fi
  ok "Dépôt cloné"
fi

cd "$TARGET_DIR"
ROOT="$PWD"          # chemin absolu : les logs/pids ne dépendent plus du cwd
mkdir -p .orvix/logs .orvix/pid

# ────────────────────────────────────────────────────────────────────────────
#  --stop : arrêt des services lancés par ce script
# ────────────────────────────────────────────────────────────────────────────

stop_services() {
  step "Arrêt des services Orvix"
  local stopped=0 pidfile name pid waited
  for pidfile in .orvix/pid/*.pid; do
    [ -e "$pidfile" ] || continue
    name="$(basename "$pidfile" .pid)"
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Laisse le temps au serveur de s'arrêter proprement (l'API prévient ses
      # workers, le site termine les requêtes en cours).
      waited=0
      while [ "$waited" -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
        sleep 1
        waited=$((waited + 1))
      done
      if kill -0 "$pid" 2>/dev/null; then
        warn "$name ne répond pas : arrêt forcé."
        command -v pkill >/dev/null 2>&1 && pkill -TERM -P "$pid" 2>/dev/null || true
        kill -9 "$pid" 2>/dev/null || true
      fi
      ok "$name arrêté (pid $pid)"
    else
      info "$name n'était plus actif"
    fi
    rm -f "$pidfile"
    stopped=1
  done
  [ "$stopped" -eq 1 ] || info "Aucun service lancé par ce script n'était actif."
  info "Journaux conservés dans .orvix/logs/"
}

if [ "$STOP_ONLY" -eq 1 ]; then
  stop_services
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
#  3. Dépendances
# ────────────────────────────────────────────────────────────────────────────

step "3/6 · Installation des dépendances"

npm_install() {
  local dir="$1"
  local extra=()
  [ "${ORVIX_NPM_INSECURE:-0}" = "1" ] && extra+=(--strict-ssl=false)
  ( cd "$dir" && npm install --no-audit --no-fund "${extra[@]}" )
}

if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
  ok "Dépendances du frontend déjà installées"
else
  info "Installation des dépendances du frontend (une à deux minutes)…"
  if ! npm_install .; then
    warn "L'installation a échoué. Si vous êtes derrière un proxy d'entreprise :"
    warn "  ORVIX_NPM_INSECURE=1 bash scripts/install.sh"
    die "npm install a échoué."
  fi
  ok "Dépendances du frontend installées"
fi

BACKEND_DIR="API/Mainapi"
if [ "$SKIP_BACKEND" -eq 1 ]; then
  warn "API locale ignorée (--skip-backend) : le site utilisera VITE_MAIN_API."
elif [ -d "$BACKEND_DIR" ]; then
  if [ -d "$BACKEND_DIR/node_modules" ]; then
    ok "Dépendances de l'API déjà installées"
  else
    info "Installation des dépendances de l'API (compilation native possible, quelques minutes)…"
    if npm_install "$BACKEND_DIR"; then
      ok "Dépendances de l'API installées"
    else
      warn "L'installation de l'API a échoué (souvent : better-sqlite3/cycletls demandent une"
      warn "toolchain de compilation — build-essential, python3, make, g++)."
      warn "Le site peut tourner sans : relancez avec --skip-backend."
      die "npm install (API) a échoué."
    fi
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
#  4. Configuration (.env) — jamais destructif
# ────────────────────────────────────────────────────────────────────────────

step "4/6 · Configuration (.env)"

SITE_URL="http://localhost:${FRONT_PORT}"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then cp .env.example .env; else : > .env; fi
  ok "Fichier .env créé à partir de .env.example"
else
  ok "Fichier .env déjà présent (valeurs conservées)"
fi

set_env_var .env VITE_SITE_URL "$SITE_URL"
set_env_var .env VITE_MAIN_API "http://localhost:${API_PORT}"
if [ -n "$ALLOWED_HOSTS" ]; then
  set_env_var .env VITE_DEV_ALLOWED_HOSTS "$ALLOWED_HOSTS"
  ok "Hôtes de développement autorisés : $ALLOWED_HOSTS"
fi
if [ "$WITH_PROXIES" -eq 1 ]; then
  set_env_var .env VITE_PROXIES_EMBED_API "http://localhost:${PROXY_PORT}"
fi

# Clé TMDB : indispensable pour les fiches, affiches et le catalogue.
if [ -z "$TMDB_KEY" ]; then
  TMDB_KEY="$(grep -E '^VITE_TMDB_API_KEY=' .env | head -1 | cut -d= -f2- || true)"
fi
if [ -z "$TMDB_KEY" ] && [ -t 0 ]; then
  printf '\n  Clé API TMDB (gratuite sur https://www.themoviedb.org/settings/api), laisser vide pour plus tard : '
  read -r TMDB_KEY || true
fi
if [ -n "$TMDB_KEY" ]; then
  set_env_var .env VITE_TMDB_API_KEY "$TMDB_KEY"
  ok "Clé TMDB enregistrée côté frontend"
else
  warn "Aucune clé TMDB : le catalogue et les affiches resteront vides jusqu'à ce que"
  warn "VITE_TMDB_API_KEY (frontend) et TMDB_API_KEY (API) soient renseignées."
fi

if [ "$SKIP_BACKEND" -eq 0 ]; then
  BACKEND_ENV="$BACKEND_DIR/.env"
  if [ ! -f "$BACKEND_ENV" ]; then
    if [ -f "$BACKEND_DIR/.env.example" ]; then
      cp "$BACKEND_DIR/.env.example" "$BACKEND_ENV"
    else
      : > "$BACKEND_ENV"
    fi
    ok "Fichier $BACKEND_ENV créé"
  else
    ok "Fichier $BACKEND_ENV déjà présent (valeurs conservées)"
  fi

  # Secrets générés localement. Le serveur refuse de signer des licences VIP
  # sans JWT_SECRET, et proxiesembed refuse de servir un flux sans signature.
  set_env_var "$BACKEND_ENV" JWT_SECRET "$(random_secret)"
  set_env_var "$BACKEND_ENV" ADMIN_SECRET "$(random_secret)"
  set_env_var "$BACKEND_ENV" MEDIA_SIGNING_SECRET "$(random_secret)"
  set_env_var "$BACKEND_ENV" INTERNAL_API_KEY "$(random_secret)"
  set_env_var "$BACKEND_ENV" PUBLIC_API_BASE "http://localhost:${API_PORT}"
  # Sans ça, l'API refuse le domaine du site : la page se charge puis toutes
  # les requêtes échouent (CORS + restriction de domaine).
  SITE_HOST="$(printf '%s' "$SITE_URL" | sed -E 's#^https?://##; s#/.*$##')"
  if [ -n "$SITE_HOST" ]; then
    set_env_var "$BACKEND_ENV" ORVIX_ALLOWED_ORIGINS "$SITE_HOST"
    ok "Origine autorisée côté API : $SITE_HOST"
  fi
  set_env_var "$BACKEND_ENV" FRONTEND_BASE_URL "$SITE_URL"
  set_env_var "$BACKEND_ENV" NODE_ENV "development"
  if [ -n "$TMDB_KEY" ]; then
    set_env_var "$BACKEND_ENV" TMDB_API_KEY "$TMDB_KEY"
  fi
  ok "Secrets locaux générés dans $BACKEND_ENV (JWT, admin, signature média, clé interne)"

  if ! have mysql && ! have mysqld; then
    warn "MySQL absent : renseignez DB_HOST/DB_USER/DB_PASSWORD/DB_NAME dans $BACKEND_ENV"
    warn "sinon comptes, favoris, VIP et commentaires resteront inactifs."
  fi
  if ! have redis-server && ! have redis-cli; then
    warn "Redis absent : renseignez REDIS_HOST/REDIS_PORT si vous en installez un."
  fi
fi

if [ "$WITH_PROXIES" -eq 1 ] && [ -d API/proxiesembed ]; then
  # Le secret de signature doit être identique des deux côtés : on recopie
  # celui de Mainapi plutôt que d'en générer un second.
  SHARED_SECRET=""
  SHARED_KEY=""
  if [ -f "$BACKEND_DIR/.env" ]; then
    SHARED_SECRET="$(grep -E '^MEDIA_SIGNING_SECRET=' "$BACKEND_DIR/.env" | head -1 | cut -d= -f2-)"
    SHARED_KEY="$(grep -E '^INTERNAL_API_KEY=' "$BACKEND_DIR/.env" | head -1 | cut -d= -f2-)"
  fi
  # Sans API locale (--skip-backend), on génère plutôt que d'écrire du vide.
  [ -n "$SHARED_SECRET" ] || SHARED_SECRET="$(random_secret)"
  [ -n "$SHARED_KEY" ] || SHARED_KEY="$(random_secret)"
  PROXY_ENV="API/proxiesembed/.env"
  [ -f "$PROXY_ENV" ] || { [ -f API/proxiesembed/.env.example ] && cp API/proxiesembed/.env.example "$PROXY_ENV" || : > "$PROXY_ENV"; }
  set_env_var "$PROXY_ENV" MEDIA_SIGNING_SECRET "$SHARED_SECRET"
  set_env_var "$PROXY_ENV" INTERNAL_API_KEY "$SHARED_KEY"
  ok "Signature partagée recopiée dans $PROXY_ENV"
fi

# ────────────────────────────────────────────────────────────────────────────
#  5. Build (mode --prod uniquement)
# ────────────────────────────────────────────────────────────────────────────

step "5/6 · Préparation"

if [ "$MODE" = "prod" ]; then
  info "Construction du site (npm run build)…"
  npm run build || die "La construction a échoué (VITE_SITE_URL renseignée ?)."
  ok "Site construit dans dist/"
  MODE_LABEL="production"
else
  MODE_LABEL="développement (rechargement à chaud, aucune compilation préalable)"
  ok "Mode $MODE_LABEL"
fi

if [ "$WITH_PROXIES" -eq 1 ] && [ -d API/proxiesembed ]; then
  if [ ! -d API/proxiesembed/.venv ]; then
    info "Installation de proxiesembed (environnement Python isolé)…"
    python3 -m venv API/proxiesembed/.venv && \
      API/proxiesembed/.venv/bin/pip install -q -r API/proxiesembed/requirements.txt \
      || warn "Installation de proxiesembed impossible : ce service restera arrêté."
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
#  6. Lancement
# ────────────────────────────────────────────────────────────────────────────

start_background() {
  local name="$1" dir="$2"; shift 2
  # Chemins absolus : les redirections sont faites depuis un sous-shell, donc
  # un chemin relatif ou $OLDPWD partirait dans le dossier de lancement.
  local log="$ROOT/.orvix/logs/${name}.log" pidfile="$ROOT/.orvix/pid/${name}.pid"
  : > "$log"
  case "$dir" in
    /*) local absdir="$dir" ;;
    *)  local absdir="$ROOT/$dir" ;;
  esac
  # `exec` remplace le sous-shell par le service : le pid enregistré est celui
  # du service lui-même. Sans lui, on ne retenait que le pid du sous-shell et
  # --stop tuait l'enveloppe en laissant le serveur tourner.
  ( cd "$absdir" && exec nohup "$@" >>"$log" 2>&1 ) &
  local pid=$!
  printf '%s\n' "$pid" >"$pidfile"
  sleep 2
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    ok "$name démarré (pid $pid, journal : .orvix/logs/${name}.log)"
  else
    warn "$name n'a pas démarré — dernières lignes du journal :"
    tail -n 8 "$log" | sed 's/^/      /'
    rm -f "$pidfile"
    return 1
  fi
}


step "6/6 · Lancement"

if [ "$DO_START" -eq 0 ]; then
  info "Lancement ignoré (--no-start / --build)."
else
  if [ "$SKIP_BACKEND" -eq 0 ] && [ -d "$BACKEND_DIR" ]; then
    if port_in_use "$API_PORT"; then
      warn "Port $API_PORT déjà occupé : l'API locale n'est pas relancée."
    else
      start_background "mainapi" "$BACKEND_DIR" node server.js \
        || warn "Démarrez l'API à la main : cd $BACKEND_DIR && npm start"
    fi
  fi

  if [ "$WITH_PROXIES" -eq 1 ] && [ -x API/proxiesembed/.venv/bin/python ]; then
    start_background "proxiesembed" "API/proxiesembed" .venv/bin/python server.py \
      || warn "proxiesembed n'a pas démarré (voir .orvix/logs/proxiesembed.log)"
  fi

  if [ "$MODE" = "prod" ]; then
    start_background "site" "." node server/index.js \
      || die "Le serveur de production n'a pas démarré (voir .orvix/logs/site.log)"
    SITE_PORT="${PORT:-3001}"
  else
    SITE_PORT="$FRONT_PORT"
    info "Démarrage du site sur le port $SITE_PORT (Ctrl+C pour arrêter)…"
    printf '\n%s  →  %shttp://localhost:%s%s\n\n' "$C_BOLD" "$C_GREEN" "$SITE_PORT" "$C_RESET"
    PORT="$SITE_PORT" npm run dev
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
#  Récapitulatif
# ────────────────────────────────────────────────────────────────────────────

if [ "$DO_START" -eq 1 ] && [ "$MODE" = "prod" ]; then
  step "Site lancé"
  printf '  Site        : %shttp://localhost:%s%s\n' "$C_GREEN" "$SITE_PORT" "$C_RESET"
  printf '  API         : http://localhost:%s\n' "$API_PORT"
  printf '  Arrêt       : bash scripts/install.sh --stop\n'
  printf '  Journaux    : .orvix/logs/\n'
fi

step "Ce dont le site a besoin pour fonctionner"
cat <<EOF
  ${C_BOLD}Indispensable${C_RESET}
   1. L'API principale Orvix (ce dépôt, API/Mainapi)   → c'est elle qui fournit les sources.
   2. Une clé TMDB gratuite (themoviedb.org/settings/api)
        VITE_TMDB_API_KEY (frontend) + TMDB_API_KEY (API) → catalogue, affiches, fiches.
   3. MySQL (optionnel au démarrage, requis pour)       → comptes, favoris, VIP, commentaires.

     Attention au domaine : l'API n'accepte que les miroirs orvix.* et localhost.
     Si vous déployez ailleurs, mettez ORVIX_ALLOWED_ORIGINS=votre-domaine.fr
     dans API/Mainapi/.env, sinon la page se charge mais toutes les requêtes
     API sont refusées (erreurs CORS dans la console).

  ${C_BOLD}Recommandé${C_RESET}
   4. proxiesembed (API/proxiesembed, Python)           → extraction avancée, Live TV, DRM.
   5. Redis                                             → cache uniquement, jamais bloquant.

  ${C_BOLD}Selon les sources que vous activez${C_RESET}
   6. Cloudflare Turnstile      VITE_TURNSTILE_* + TURNSTILE_SECRET_KEY   (anti-bot)
   7. FStream                   FSTREAM_LOGIN_NAME / FSTREAM_LOGIN_PASSWORD
   8. Uqload                    UQLOAD_API_KEY
   9. SwiftFlow / NorthLive     SWIFTFLOW_API_KEY (partenaire payant)
  10. Paiements VIP             VIP_PAYGATE_*, VIP_PAYBLIS_*, xpub BTC/LTC
  11. Notifications push        VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
  12. OpenRouter (fonctions IA) OPENROUTER_API_KEY

  Détail complet : INSTALLATION.md (à la racine du dépôt)
EOF
