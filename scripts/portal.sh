#!/usr/bin/env bash
# ==============================================================================
# PSG Tech Recruitment Portal — shared launcher (Linux / macOS / WSL / Git Bash)
#
# Called by ./dev.sh and ./prod.sh:
#   scripts/portal.sh <dev|prod> [command] [args...]
#
# Commands:
#   up (default)   Build images, run migrations + seed, start everything, wait for health
#   stop           Stop containers (data is kept)
#   down           Stop and remove containers (data volumes are kept)
#   restart        Restart app and worker
#   logs [svc...]  Follow logs (default: app worker migrate)
#   status         Container status
#   health         Check /healthz/ready
#   seed           Re-run the idempotent seed (form templates, staff accounts)
#   migrate        Apply database migrations only
#   rebuild        Rebuild images without cache, then start
#   backup         Database + file backup (infrastructure/scripts/backup.sh)
#   shell [svc]    Shell inside a container (default: app)
#   env            Create .env (dev: copy .env.development; prod: generate secrets)
# ==============================================================================
set -Eeuo pipefail

ORIG_ARGS=("$@")
MODE="${1:-}"
shift || true
CMD="${1:-up}"
shift || true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -t 1 ]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; N=$'\033[0m'
else
  B=""; G=""; Y=""; R=""; C=""; N=""
fi
info() { printf '%s==>%s %s\n' "$C" "$N" "$*"; }
ok() { printf '%s ok%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%swarn%s %s\n' "$Y" "$N" "$*" >&2; }
die() { printf '%serror%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

case "$MODE" in
  dev) FILES=(-f compose.yaml -f compose.dev.yaml) ;;
  prod) FILES=(-f compose.yaml) ;;
  *) die "usage: scripts/portal.sh <dev|prod> [command]" ;;
esac

# ---- Root / Docker -------------------------------------------------------------
is_root() { [ "$(id -u)" -eq 0 ]; }

# Production on Linux: re-run with sudo so Docker, Nginx and certificates can be set up unattended.
if [ "$MODE" = prod ] && ! is_root && [ "$(uname -s)" = Linux ] && command -v sudo >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
    info "Administrator rights are needed; re-running with sudo…"
    exec sudo -E bash "$ROOT/scripts/portal.sh" "${ORIG_ARGS[@]}"
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  if [ "$MODE" = prod ] && is_root && [ "$(uname -s)" = Linux ]; then
    info "Installing Docker Engine (official script)…"
    command -v curl >/dev/null 2>&1 || { apt-get update && apt-get install -y curl; }
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
  else
    die "Docker is not installed. See https://docs.docker.com/engine/install/"
  fi
fi
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose v2 is required (the 'docker compose' plugin)."
fi
docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. Is it running? (Linux: add your user to the 'docker' group or use sudo.)"

dc() {
  local profiles=()
  # Production DB viewer (https://$DB_VIEWER_DOMAIN) runs only when explicitly enabled in .env.
  if [ "$MODE" = prod ] && [ "$(env_get DB_VIEWER_ENABLED)" = true ]; then profiles=(--profile dbviewer); fi
  "${COMPOSE[@]}" --env-file .env "${FILES[@]}" ${profiles[@]+"${profiles[@]}"} "$@"
}

# ---- .env handling ------------------------------------------------------------
env_get() { # env_get KEY -> value from .env (quotes stripped, CR removed)
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//'
}

rand() { # URL-safe random string
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'
  else
    head -c "$1" /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'
  fi
}

env_set() { # env_set KEY VALUE -> replace (or append) in .env; VALUE is written literally
  local tmp
  tmp="$(mktemp)"
  KEY="$1" VAL="$2" awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
    END { if (!done) print k "=" v }' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

TEMPLATE=.env.production

create_env() {
  if [ "$MODE" = dev ]; then
    cp .env.development .env
    ok "Created .env from .env.development"
    return
  fi
  [ -f "$TEMPLATE" ] || die "$TEMPLATE is missing (it is part of the repository)"
  local owner app
  owner="$(rand 24)"; app="$(rand 24)"
  sed -e "s|__POSTGRES_PASSWORD__|$owner|g" -e "s|__APP_DB_PASSWORD__|$app|g" "$TEMPLATE" > .env
  chmod 600 .env
  env_set POSTGRES_PASSWORD "$owner"
  env_set APP_DB_PASSWORD "$app"
  env_set SESSION_SECRET "$(rand 48)"
  env_set CONVERTER_TOKEN "$(rand 24)"
  env_set DB_VIEWER_PASSWORD "$(rand 18)"
  ok "Created .env with freshly generated passwords and secrets (kept only on this server)"
}

# Secrets that live only on the server: generated once (or entered once) and never overwritten.
SERVER_SECRETS=" POSTGRES_PASSWORD APP_DB_PASSWORD DATABASE_URL MIGRATION_DATABASE_URL SESSION_SECRET CONVERTER_TOKEN SMTP_PASSWORD DB_VIEWER_PASSWORD "

# The committed template is the source of truth for every non-secret setting: after `git pull`,
# ./prod.sh applies changed values (e.g. a new domain) to .env. Secrets are kept. Server-only
# overrides can be placed in secrets/override.env (KEY=value lines, never committed).
sync_env() {
  [ "$MODE" = prod ] && [ -f "$TEMPLATE" ] || return 0
  local key line current changed=()
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*|*=*) ;; *) continue ;; esac
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    if ! grep -q "^$key=" .env; then
      case "$line" in *__GENERATED__*) line="$key=$(rand 24)" ;; esac
      printf '%s\n' "$line" >> .env
      changed+=("$key")
      continue
    fi
    case "$SERVER_SECRETS" in *" $key "*) continue ;; esac
    current="$(grep "^$key=" .env | tail -n1)"
    if [ "$current" != "$line" ]; then
      env_set "$key" "${line#*=}"
      changed+=("$key")
    fi
  done < "$TEMPLATE"
  if [ -f secrets/override.env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in ''|'#'*) continue ;; esac
      env_set "${line%%=*}" "${line#*=}"
    done < secrets/override.env
  fi
  [ ${#changed[@]} -eq 0 ] || ok "Updated .env from $TEMPLATE: ${changed[*]}"
}

# The Gmail app password is the only secret that cannot be generated. Sources, in order:
# SMTP_PASSWORD environment variable, secrets/smtp_password file, then a one-time hidden prompt.
ensure_smtp_password() {
  [ "$MODE" = prod ] || return 0
  [ "$(env_get EMAIL_PROVIDER)" = smtp ] || return 0
  [ -n "$(env_get SMTP_PASSWORD)" ] && return 0
  local pw="${SMTP_PASSWORD:-}"
  if [ -z "$pw" ] && [ -f secrets/smtp_password ]; then pw="$(tr -d '\r\n' < secrets/smtp_password)"; fi
  if [ -z "$pw" ] && [ -t 0 ]; then
    echo
    info "One-time setup: Gmail app password for $(env_get SMTP_USER)"
    echo "    (Google Account → Security → 2-Step Verification → App passwords; 16 letters)"
    read -rsp "    App password: " pw
    echo
  fi
  pw="$(printf '%s' "$pw" | tr -d ' ')"
  [ -n "$pw" ] || die "No Gmail app password. Run again interactively, or: SMTP_PASSWORD='xxxx xxxx xxxx xxxx' ./prod.sh"
  env_set SMTP_PASSWORD "$pw"
  ok "Saved the mail password in .env (this server only)"
}

# HTTPS for the portal and the DB viewer (Nginx + Let's Encrypt), when running as root on Linux.
setup_https() {
  [ "$MODE" = prod ] || return 0
  [ "$(env_get SETUP_NGINX)" != false ] || return 0
  if ! is_root || [ "$(uname -s)" != Linux ]; then
    warn "Skipping Nginx/HTTPS set-up (needs root on Linux). Run: sudo infrastructure/nginx/host/setup-nginx.sh"
    return 0
  fi
  local app_domain db_domain
  app_domain="$(env_get APP_ORIGIN)"; app_domain="${app_domain#https://}"; app_domain="${app_domain#http://}"; app_domain="${app_domain%%/*}"
  db_domain="$(env_get DB_VIEWER_DOMAIN)"
  DB_VIEWER_ALLOW_IPS="$(env_get DB_VIEWER_ALLOW_IPS)" \
    bash infrastructure/nginx/host/setup-nginx.sh "$app_domain" "${db_domain:-db.$app_domain}" "$(env_get LETSENCRYPT_EMAIL)" ||
    warn "HTTPS set-up did not finish (usually DNS not pointing here yet). Re-run ./prod.sh once DNS is ready."
}

# Sign-in codes are e-mailed, so an unreachable mail server means nobody can sign in.
smtp_check() {
  local host port
  host="$(env_get SMTP_HOST)"; port="$(env_get SMTP_PORT)"; port="${port:-587}"
  if timeout 6 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
    ok "Mail server reachable: $host:$port"
  else
    warn "Cannot reach the mail server $host:$port from this server."
    warn "Sign-in codes will NOT be delivered. Ask the network/firewall team to allow outbound TCP $port,"
    warn "or use the institution's own SMTP relay (set SMTP_HOST/SMTP_PORT in .env)."
  fi
}

check_env() {
  [ -f .env ] || { info ".env not found — creating it"; create_env; }
  # Windows editors may save CRLF line endings, which break values. Normalise silently.
  if grep -q $'\r' .env; then sed -i.bak 's/\r$//' .env && rm -f .env.bak; warn "Converted .env to LF line endings"; fi
  sync_env
  ensure_smtp_password
  grep -v "^#" .env | grep -q "__GENERATED__\|__APP_DB_PASSWORD__\|__POSTGRES_PASSWORD__" && die ".env still contains placeholders; delete it and run again."

  local missing=()
  for k in POSTGRES_PASSWORD APP_DB_PASSWORD DATABASE_URL MIGRATION_DATABASE_URL SESSION_SECRET CONVERTER_TOKEN APP_ORIGIN; do
    [ -n "$(env_get "$k")" ] || missing+=("$k")
  done
  [ ${#missing[@]} -eq 0 ] || die "Missing values in .env: ${missing[*]}"

  if [ "$MODE" = prod ]; then
    [ "$(env_get NODE_ENV)" = production ] || die "NODE_ENV must be 'production' in .env for ./prod.sh"
    case "$(env_get APP_ORIGIN)" in https://*) ;; *) warn "APP_ORIGIN is not https:// — secure cookies need HTTPS in production." ;; esac
    [ "$(env_get EMAIL_PROVIDER)" != mailpit ] || die "EMAIL_PROVIDER=mailpit is for development. Set EMAIL_PROVIDER=smtp and the SMTP_* values."
    [ -n "$(env_get SMTP_HOST)" ] || die "SMTP_HOST is empty in .env"
    [ "$(env_get MALWARE_SCAN)" != disabled ] || die "MALWARE_SCAN=disabled is not allowed in production"
    smtp_check
    if [ "$(env_get DB_VIEWER_ENABLED)" = true ]; then
      local vp
      vp="$(env_get DB_VIEWER_PASSWORD)"
      [ ${#vp} -ge 16 ] || die "DB_VIEWER_PASSWORD must be at least 16 characters when DB_VIEWER_ENABLED=true"
    fi
    local secret
    secret="$(env_get SESSION_SECRET)"
    [ ${#secret} -ge 32 ] || die "SESSION_SECRET must be at least 32 characters"
  else
    if [ "$(env_get NODE_ENV)" = production ]; then
      warn ".env is a production file. Run './dev.sh env' to switch to development settings."
    fi
  fi
}

# ---- Health -------------------------------------------------------------------
port() { local p; p="$(env_get APP_HOST_PORT)"; echo "${p:-6969}"; }

health() {
  local url="http://127.0.0.1:$(port)/healthz/ready"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 "$url"
  else
    dc exec -T app node -e "fetch('http://127.0.0.1:3000/healthz/ready').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
  fi
}

migrate_failed() {
  local id state
  id="$(dc ps -aq migrate 2>/dev/null | head -n1)"
  [ -n "$id" ] || return 1
  state="$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$id" 2>/dev/null || true)"
  [ "${state%% *}" = exited ] && [ "${state##* }" != 0 ]
}

wait_healthy() {
  info "Waiting for the portal to become healthy (first start can take a few minutes)…"
  local i
  for i in $(seq 1 90); do
    if health >/dev/null 2>&1; then
      echo
      if [ "$MODE" = dev ]; then ok "Portal is up: http://localhost:$(port)"; else ok "Portal is up: $(env_get APP_ORIGIN)  (local: http://127.0.0.1:$(port))"; fi
      if [ "$MODE" = dev ]; then
        local mp
        mp="$(env_get MAILPIT_UI_HOST_PORT)"
        ok "Mailpit (e-mails and sign-in codes): http://127.0.0.1:${mp:-8025}"
      fi
      return 0
    fi
    if migrate_failed; then
      dc logs --no-color --tail 60 migrate || true
      die "Database migration failed (see the log above)."
    fi
    printf '.'
    sleep 5
  done
  echo
  dc ps || true
  dc logs --no-color --tail 80 app worker || true
  die "The portal did not become healthy in time. Check the logs above or run: ${0##*/} logs"
}

fix_volume_permissions() {
  # The app runs as the unprivileged 'node' user (uid 1000); make sure the storage volume is writable.
  dc run --rm --no-deps --user 0:0 --entrypoint sh app -c \
    "mkdir -p /var/lib/srportal/storage && chown -R 1000:1000 /var/lib/srportal/storage" >/dev/null 2>&1 || true
}

# PostgreSQL applies POSTGRES_PASSWORD only when the data volume is first created. If .env was
# regenerated (or the volume comes from an earlier deployment) the stored passwords differ and
# migrations fail with P1000. Reconcile on every start through the container's local socket
# (trusted, no password); existing data is never touched.
sync_db_passwords() {
  info "Starting the database…"
  dc up -d --wait db
  local su owner_pw app_user app_pw db
  su="$(env_get POSTGRES_USER)"; su="${su:-srp_owner}"
  db="$(env_get POSTGRES_DB)"; db="${db:-srportal}"
  owner_pw="$(env_get POSTGRES_PASSWORD)"
  app_user="$(env_get APP_DB_USER)"; app_user="${app_user:-srp_app}"
  app_pw="$(env_get APP_DB_PASSWORD)"
  local login="$su"
  dc exec -T db psql -U "$login" -d postgres -Atc "select 1" >/dev/null 2>&1 || login=postgres
  dc exec -T db psql -v ON_ERROR_STOP=1 -U "$login" -d postgres -q \
    -v owner="$su" -v owner_pw="$owner_pw" -v app="$app_user" -v app_pw="$app_pw" -v db="$db" <<'SQL' ||
SELECT format('CREATE ROLE %I LOGIN SUPERUSER', :'owner') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'owner') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'owner', :'owner_pw') \gexec
SELECT format('CREATE ROLE %I LOGIN', :'app') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app', :'app_pw') \gexec
-- The DB viewer connects as the owner: show its timestamps in IST (storage stays UTC; the app role is unaffected).
SELECT format('ALTER ROLE %I SET timezone = %L', :'owner', 'Asia/Kolkata') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
    die "Could not align the database passwords with .env (see the error above)."
  # Least-privilege grants for the app role (idempotent; same as the first-start init script).
  dc exec -T db psql -v ON_ERROR_STOP=1 -U "$login" -d "$db" -q -v owner="$su" -v app="$app_user" -v db="$db" <<'SQL' >/dev/null ||
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'app') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'owner', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'owner', :'app') \gexec
SQL
    die "Could not grant database privileges to $app_user."
  ok "Database credentials match .env"
}

up() {
  check_env
  info "Building images ($MODE)…"
  dc build --pull app converter
  fix_volume_permissions
  sync_db_passwords
  info "Starting services…"
  dc up -d --remove-orphans
  wait_healthy
  setup_https
  if [ "$MODE" = prod ]; then
    echo
    ok "Portal:    $(env_get APP_ORIGIN)"
    if [ "$(env_get DB_VIEWER_ENABLED)" = true ]; then
      ok "DB viewer: https://$(env_get DB_VIEWER_DOMAIN)"
      ok "           user:     $(env_get DB_VIEWER_USER)"
      ok "           password: $(env_get DB_VIEWER_PASSWORD)"
      ok "           allowed from: $(env_get DB_VIEWER_ALLOW_IPS)"
    fi
  fi
}

# ---- Commands -----------------------------------------------------------------
case "$CMD" in
  up | start) up ;;
  stop) dc stop ;;
  down) dc down --remove-orphans ;;
  restart) check_env; dc restart app worker; wait_healthy ;;
  logs) if [ $# -gt 0 ]; then dc logs -f --tail 200 "$@"; else dc logs -f --tail 200 app worker migrate; fi ;;
  status | ps) dc ps ;;
  health) health && echo || die "Not healthy" ;;
  seed) check_env; sync_db_passwords; dc run --rm migrate node build-worker/seed.js ;;
  migrate) check_env; sync_db_passwords; dc run --rm migrate npx prisma migrate deploy ;;
  rebuild) check_env; dc build --no-cache --pull app converter; fix_volume_permissions; dc up -d --force-recreate --remove-orphans; wait_healthy ;;
  backup)
    check_env
    ENV_FILE=.env sh infrastructure/scripts/backup.sh psg-srportal compose.yaml
    ;;
  shell) dc exec "${1:-app}" sh ;;
  env)
    if [ -f .env ]; then
      cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"
      warn "Existing .env backed up"
      rm -f .env
    fi
    create_env
    ;;
  help | -h | --help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "Unknown command '$CMD'. Run: ${0##*/} help" ;;
esac
