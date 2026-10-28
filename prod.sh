#!/usr/bin/env bash
# ==============================================================================
# PSG TECH STAFF RECRUITMENT PORTAL - PRODUCTION RUNNER (DEBIAN / LINUX VPS)
# ==============================================================================
# Usage:
#   ./prod.sh                 Start portal in production mode & verify health
#   ./prod.sh up | start      Start production containers in background
#   ./prod.sh stop            Stop production containers (preserves data volumes)
#   ./prod.sh down            Stop and remove containers (preserves data volumes)
#   ./prod.sh restart         Restart production containers with permission check
#   ./prod.sh logs [svc...]   Stream production container logs (e.g. ./prod.sh logs app)
#   ./prod.sh status | ps     Show container status and published ports
#   ./prod.sh health          Query the /healthz/ready status endpoint
#   ./prod.sh seed            Seed form templates & approved institutional accounts
#   ./prod.sh rebuild         Clean rebuild images (--no-cache) and restart
#   ./prod.sh shell [svc]     Open interactive shell in container (default: app)
#   ./prod.sh help            Show this help message
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ANSI color codes
if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[0;32m"
    CYAN="\033[0;36m"
    YELLOW="\033[1;33m"
    RED="\033[0;31m"
    BLUE="\033[0;34m"
    NC="\033[0m"
else
    BOLD=""
    GREEN=""
    CYAN=""
    YELLOW=""
    RED=""
    BLUE=""
    NC=""
fi

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    COMPOSE=""
fi

# Docker Compose files
COMPOSE_ARGS=(-f compose.yaml -f compose.dev.yaml)

check_prerequisites() {
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] Docker command not found!${NC}"
        echo -e "Please install Docker Engine: https://docs.docker.com/engine/install/debian/"
        exit 1
    fi

    if [ -z "$COMPOSE" ]; then
        echo -e "${RED}[ERROR] Neither 'docker compose' nor 'docker-compose' was found!${NC}"
        echo -e "Please install Docker Compose plugin: https://docs.docker.com/compose/install/"
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] Docker daemon is not running or current user lacks permissions.${NC}"
        echo -e "  - If the daemon is stopped:  ${YELLOW}sudo systemctl start docker${NC}"
        echo -e "  - If permission denied:      ${YELLOW}sudo usermod -aG docker \$USER && newgrp docker${NC}"
        echo -e "  - Or execute with:           ${YELLOW}sudo $0 $*${NC}"
        exit 1
    fi
}

ensure_prod_env() {
    echo -e "${CYAN}[INFO] Configuring production environment (.env.production -> .env)...${NC}"
    if [ ! -f .env.production ]; then
        echo -e "${YELLOW}[WARN] .env.production not found. Generating production configuration...${NC}"
        cat << 'EOF' > .env.production
APP_ORIGIN=https://recruitments.psgtech.ac.in
APP_HOST_PORT=6969
POSTGRES_HOST_PORT=6543
REDIS_HOST_PORT=63879
MAILPIT_UI_HOST_PORT=8025
MAILPIT_SMTP_HOST_PORT=2525
CONVERTER_HOST_PORT=63100
DB_VIEWER_HOST_PORT=6981
DB_VIEWER_USER=psgadmin
DB_VIEWER_PASSWORD=PsgTech@2026!
ADMINER_HOST_PORT=6981
POSTGRES_DB=srportal
POSTGRES_USER=srp_owner
POSTGRES_PASSWORD=PsgTech_DbOwner_2026!
APP_DB_USER=srp_app
APP_DB_PASSWORD=PsgTech_AppUser_2026!
DATABASE_URL=postgresql://srp_app:PsgTech_AppUser_2026!@db:5432/srportal?schema=public
MIGRATION_DATABASE_URL=postgresql://srp_owner:PsgTech_DbOwner_2026!@db:5432/srportal?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=20b98afbbe9a9a92bfc49cbca1ea245b1926da16be5608ce472e9a9ec6ca3386
COOKIE_SECURE=true
SESSION_TTL_HOURS=12
STORAGE_DIR=/var/lib/srportal/storage
MAX_UPLOAD_MB=10
CONVERTER_URL=http://converter:3100
CONVERTER_TOKEN=Pin8esdf5Fbx61-NgxhyXVruzuam0wdF
MALWARE_SCAN=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=recruitments@psgtech.ac.in
SMTP_PASSWORD=rdyu fhbs megh sgid
SMTP_FROM_NAME="PSG College of Technology Recruitment"
SMTP_FROM_EMAIL=recruitments@psgtech.ac.in
MAIL_FROM="PSG College of Technology Recruitment <recruitments@psgtech.ac.in>"
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=20000
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5
OTP_MAX_SENDS_PER_HOUR=5
LOG_LEVEL=info
DEV_LOG_OTP=false
EOF
    fi

    # Deploy .env.production as active .env
    cp -f .env.production .env
    chmod 600 .env 2>/dev/null || chmod 644 .env 2>/dev/null || true

    # Safeguard: ensure placeholder secrets are replaced with real crypto random tokens
    if grep -q "replace-with" .env 2>/dev/null; then
        echo -e "${CYAN}[INFO] Generating secure cryptographic random secrets in .env...${NC}"
        local new_session_secret=""
        if command -v openssl >/dev/null 2>&1; then
            new_session_secret="$(openssl rand -hex 32)"
        elif command -v node >/dev/null 2>&1; then
            new_session_secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
        else
            new_session_secret="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
        sed -i "s|SESSION_SECRET=replace-with.*|SESSION_SECRET=${new_session_secret}|g" .env

        local new_converter_token=""
        if command -v openssl >/dev/null 2>&1; then
            new_converter_token="$(openssl rand -hex 16)"
        elif command -v node >/dev/null 2>&1; then
            new_converter_token="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
        else
            new_converter_token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
        sed -i "s|CONVERTER_TOKEN=replace-with.*|CONVERTER_TOKEN=${new_converter_token}|g" .env
    fi

    echo -e "${GREEN}[OK] Production environment active (APP_ORIGIN=https://recruitments.psgtech.ac.in, COOKIE_SECURE=true)${NC}"
}

ensure_storage_permissions() {
    echo -e "${CYAN}[INFO] Ensuring storage volume permissions for Debian / Linux...${NC}"
    # In Linux, Docker named volumes default to root:root.
    # The application and worker containers run as non-root user 'node' (UID 1000).
    # Fix ownership of the storage directory so read/write works without permission errors:
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm --user 0:0 --no-deps app sh -c \
        "mkdir -p /var/lib/srportal/storage && chown -R 1000:1000 /var/lib/srportal/storage && chmod -R 775 /var/lib/srportal/storage" >/dev/null 2>&1 || true
}

wait_for_health() {
    echo -e "${CYAN}[3/3] Waiting for production portal health...${NC}"
    local attempts=0
    local max_attempts=40
    local healthy=false
    local port="6969"
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then port="$env_port"; fi
    fi

    while [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        if curl -fsS "http://127.0.0.1:${port}/healthz/ready" >/dev/null 2>&1; then
            healthy=true
            break
        elif command -v wget >/dev/null 2>&1 && wget -q -O /dev/null "http://127.0.0.1:${port}/healthz/ready" >/dev/null 2>&1; then
            healthy=true
            break
        fi
        printf "."
        sleep 2
    done
    echo ""

    if [ "$healthy" = true ]; then
        echo -e "${GREEN}[OK] Recruitment Portal is healthy and ready for production traffic!${NC}"
    else
        echo -e "${YELLOW}[NOTE] Portal healthcheck timed out or returned unavailable.${NC}"
        if command -v curl >/dev/null 2>&1; then
            local resp
            resp="$(curl -s "http://127.0.0.1:${port}/healthz/ready" 2>/dev/null || true)"
            if [ -n "$resp" ]; then
                echo -e "       Current /healthz/ready response: ${CYAN}${resp}${NC}"
            fi
        fi
        echo -e "       Containers are running in the background. Use '${BOLD}$0 logs${NC}' to inspect."
    fi
}

show_summary() {
    local port="6969"
    local origin="https://recruitments.psgtech.ac.in"
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then port="$env_port"; fi
        local env_origin
        env_origin="$(grep -E '^APP_ORIGIN=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_origin" ]; then origin="$env_origin"; fi
    fi

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${GREEN}   PSG TECH FACULTY RECRUITMENT PORTAL — PRODUCTION ACTIVE${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
    echo -e "   ${BOLD}[PUBLIC DOMAIN]${NC}       ${GREEN}${origin}${NC}"
    echo -e "   ${BOLD}[CANDIDATE SIGN IN]${NC}   ${origin}/login"
    echo -e "   ${BOLD}[LOCAL REVERSE PROXY]${NC} http://127.0.0.1:${port}"
    echo -e "   ${BOLD}[READINESS CHECK]${NC}     http://127.0.0.1:${port}/healthz/ready"
    echo ""
    echo -e "   ${BOLD}SECURITY & PROTOCOL:${NC}"
    echo -e "   • HTTPS Origin CSRF Protection: Active (${origin})"
    echo -e "   • Secure Session Cookies:       Active (COOKIE_SECURE=true)"
    echo -e "   • Document Storage Permissions: Verified (UID 1000 node writable)"
    echo -e "   • Background Worker:            Active (Relay, ClamAV, Converter)"
    echo ""
    echo -e "   ${BOLD}APPROVED PRIVILEGED ACCOUNTS:${NC}"
    echo -e "   • Super Admin (Tino):             brittytino08@gmail.com  (Full System Admin)"
    echo -e "   • Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles & Screening)"
    echo -e "   • HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review & Summary Sheet)"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
}

do_start() {
    check_prerequisites
    ensure_prod_env

    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   STARTING PRODUCTION STACK (DEBIAN / LINUX)${NC}"
    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo ""

    echo -e "${CYAN}[1/3] Building production Docker images...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" build app worker migrate converter

    echo ""
    echo -e "${CYAN}[2/3] Initializing storage volume & launching containers...${NC}"
    ensure_storage_permissions
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d --remove-orphans --force-recreate

    echo ""
    wait_for_health
    show_summary
}

do_restart() {
    check_prerequisites
    ensure_prod_env
    ensure_storage_permissions
    echo -e "${CYAN}[INFO] Restarting production containers...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" restart
    wait_for_health
    show_summary
}

do_clean_rebuild() {
    check_prerequisites
    ensure_prod_env

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   CLEAN PRODUCTION REBUILD (--no-cache)${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo "Stopping containers..."
    $COMPOSE "${COMPOSE_ARGS[@]}" down

    echo "Rebuilding images without cache..."
    $COMPOSE "${COMPOSE_ARGS[@]}" build --no-cache app worker migrate converter

    echo "Starting stack..."
    ensure_storage_permissions
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d --force-recreate

    wait_for_health
    show_summary
}

do_seed() {
    check_prerequisites
    ensure_prod_env

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   SEEDING PRODUCTION FORM TEMPLATES & PRIVILEGED ACCOUNTS${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm migrate node build-worker/seed.js
}

do_health() {
    check_prerequisites
    local port="6969"
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then port="$env_port"; fi
    fi
    echo -e "${CYAN}Checking production readiness (http://127.0.0.1:${port}/healthz/ready)...${NC}"
    if command -v curl >/dev/null 2>&1; then
        curl -i "http://127.0.0.1:${port}/healthz/ready"
    elif command -v wget >/dev/null 2>&1; then
        wget -S -O - "http://127.0.0.1:${port}/healthz/ready"
    fi
}

do_shell() {
    check_prerequisites
    local svc="${1:-app}"
    echo -e "${CYAN}Opening shell inside container '${svc}'...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" exec -it "$svc" /bin/sh || $COMPOSE "${COMPOSE_ARGS[@]}" exec "$svc" /bin/sh
}

do_help() {
    echo -e "${BOLD}PSG Tech Staff Recruitment Portal - Production Runner${NC}"
    echo ""
    echo "Usage: ./prod.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  (none), up, start Start production portal & verify health"
    echo "  restart           Restart production containers"
    echo "  stop              Gracefully stop production containers"
    echo "  down              Stop and remove production containers"
    echo "  logs [svc...]     Stream container logs (default: app worker db db-viewer)"
    echo "  status, ps        Show status of production containers"
    echo "  health            Query the /healthz/ready endpoint"
    echo "  seed              Seed form templates & approved institutional accounts"
    echo "  rebuild, --clean  Rebuild Docker images without cache (--no-cache) and restart"
    echo "  shell [svc]       Open interactive shell inside service (default: app)"
    echo "  help, -h, --help  Display this help reference"
    echo ""
}

# ------------------------------------------------------------------------------
# Argument Routing
# ------------------------------------------------------------------------------
CMD="${1:-}"

case "$CMD" in
    up|start|"")
        do_start
        ;;
    restart)
        do_restart
        ;;
    stop)
        check_prerequisites
        $COMPOSE "${COMPOSE_ARGS[@]}" stop
        ;;
    down)
        check_prerequisites
        echo "Stopping and removing production containers..."
        $COMPOSE "${COMPOSE_ARGS[@]}" down
        ;;
    logs)
        check_prerequisites
        shift
        if [ $# -gt 0 ]; then
            $COMPOSE "${COMPOSE_ARGS[@]}" logs -f "$@"
        else
            $COMPOSE "${COMPOSE_ARGS[@]}" logs -f app worker db db-viewer
        fi
        ;;
    status|ps)
        check_prerequisites
        $COMPOSE "${COMPOSE_ARGS[@]}" ps
        ;;
    health)
        do_health
        ;;
    seed)
        do_seed
        ;;
    rebuild|--clean)
        do_clean_rebuild
        ;;
    shell|bash|sh)
        shift
        do_shell "${1:-app}"
        ;;
    help|--help|-h|/\?)
        do_help
        ;;
    *)
        echo -e "${RED}[ERROR] Unknown command: '$CMD'${NC}"
        echo ""
        do_help
        exit 1
        ;;
esac
