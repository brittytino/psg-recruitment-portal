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

# ---- Docker / Compose detection ----------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/engine/install/"
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose v2 is required (the 'docker compose' plugin)."
fi
docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. Is it running? (Linux: add your user to the 'docker' group or use sudo.)"

dc() { "${COMPOSE[@]}" --env-file .env "${FILES[@]}" "$@"; }

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

create_env() {
  if [ "$MODE" = dev ]; then
    cp .env.development .env
    ok "Created .env from .env.development"
    return
  fi
  [ -f .env.example ] || die ".env.example is missing"
  local owner app
  owner="$(rand 24)"; app="$(rand 24)"
  sed -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$owner|" \
      -e "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$app|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://srp_app:$app@db:5432/srportal?schema=public|" \
      -e "s|^MIGRATION_DATABASE_URL=.*|MIGRATION_DATABASE_URL=postgresql://srp_owner:$owner@db:5432/srportal?schema=public|" \
      -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(rand 48)|" \
      -e "s|^CONVERTER_TOKEN=.*|CONVERTER_TOKEN=$(rand 24)|" \
      .env.example > .env
  chmod 600 .env
  ok "Created .env with freshly generated database passwords and secrets"
  warn "Edit .env now: set APP_ORIGIN (your https:// address) and the SMTP_* mail settings, then run ./prod.sh again."
  exit 0
}

check_env() {
  [ -f .env ] || { info ".env not found — creating it"; create_env; }
  # Windows editors may save CRLF line endings, which break values. Normalise silently.
  if grep -q $'\r' .env; then sed -i.bak 's/\r$//' .env && rm -f .env.bak; warn "Converted .env to LF line endings"; fi

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
      ok "Portal is up: $(env_get APP_ORIGIN)  (local: http://127.0.0.1:$(port))"
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

up() {
  check_env
  info "Building images ($MODE)…"
  dc build --pull app converter
  fix_volume_permissions
  info "Starting services…"
  dc up -d --remove-orphans
  wait_healthy
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
  seed) check_env; dc run --rm migrate node build-worker/seed.js ;;
  migrate) check_env; dc run --rm migrate npx prisma migrate deploy ;;
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
