#!/usr/bin/env bash
# ==============================================================================
# PSG TECH STAFF RECRUITMENT PORTAL - DEVELOPMENT RUNNER (LINUX / MACOS)
# ==============================================================================
# Usage:
#   ./dev.sh                  Start portal, check health, and enter interactive menu
#   ./dev.sh up | start       Start portal in background (non-interactive)
#   ./dev.sh stop             Stop portal containers (keep data)
#   ./dev.sh down             Stop and remove portal containers
#   ./dev.sh restart          Restart portal containers
#   ./dev.sh logs [svc...]    Follow container logs (default: app worker db adminer)
#   ./dev.sh status | ps      Show status of portal containers
#   ./dev.sh health           Check /healthz/ready health endpoint
#   ./dev.sh seed             Seed form templates & approved institutional accounts
#   ./dev.sh env              Reset .env to development defaults (.env.development)
#   ./dev.sh rebuild          Clean rebuild images with --no-cache and start
#   ./dev.sh studio           Launch Prisma Studio database GUI
#   ./dev.sh shell [svc]      Open shell inside a container (default: app)
#   ./dev.sh help             Show this help message
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

# Docker Compose files (standard development stack with exposed dev ports)
COMPOSE_ARGS=(-f compose.yaml -f compose.dev.yaml)

check_prerequisites() {
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}[ERROR] Docker command not found!${NC}"
        echo -e "Please install Docker Engine: https://docs.docker.com/engine/install/"
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

ensure_dev_env() {
    if [ ! -f .env ] || grep -q "recruitments.psgtech.ac.in" .env 2>/dev/null; then
        echo -e "${CYAN}[INFO] Configuring development environment (.env.development -> .env)...${NC}"
        if [ ! -f .env.development ]; then
            cat << 'EOF' > .env.development
APP_ORIGIN=http://localhost:6969
APP_HOST_PORT=6969
POSTGRES_HOST_PORT=6543
REDIS_HOST_PORT=63879
MAILPIT_UI_HOST_PORT=8025
MAILPIT_SMTP_HOST_PORT=2525
CONVERTER_HOST_PORT=63100
ADMINER_HOST_PORT=6981
POSTGRES_DB=srportal
POSTGRES_USER=srp_owner
POSTGRES_PASSWORD=change-me-owner
APP_DB_USER=srp_app
APP_DB_PASSWORD=change-me-app
DATABASE_URL=postgresql://srp_app:change-me-app@db:5432/srportal?schema=public
MIGRATION_DATABASE_URL=postgresql://srp_owner:change-me-owner@db:5432/srportal?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=e7b8a1c93f0d4529b68a4e1f7c2d8b5a9034ecbf186241a7d903e15b497c28fa
COOKIE_SECURE=false
SESSION_TTL_HOURS=12
STORAGE_DIR=/var/lib/srportal/storage
MAX_UPLOAD_MB=10
CONVERTER_URL=http://converter:3100
CONVERTER_TOKEN=c3f1b8a9d04e762b9a15cd82ef04b971
MALWARE_SCAN=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="PSG Tech Recruitment <recruitment@localhost>"
LOG_LEVEL=info
DEV_LOG_OTP=false
EOF
        fi
        cp -f .env.development .env
        chmod 644 .env 2>/dev/null || true
    fi

    # Fix placeholder secrets if any exist
    if grep -q "replace-with" .env 2>/dev/null; then
        local new_session_secret=""
        if command -v openssl >/dev/null 2>&1; then
            new_session_secret="$(openssl rand -hex 32)"
        else
            new_session_secret="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
        sed -i "s|SESSION_SECRET=replace-with.*|SESSION_SECRET=${new_session_secret}|g" .env

        local new_converter_token=""
        if command -v openssl >/dev/null 2>&1; then
            new_converter_token="$(openssl rand -hex 16)"
        else
            new_converter_token="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
        sed -i "s|CONVERTER_TOKEN=replace-with.*|CONVERTER_TOKEN=${new_converter_token}|g" .env
    fi

    echo -e "${GREEN}[OK] Development environment active (APP_ORIGIN=http://localhost:6969, COOKIE_SECURE=false)${NC}"
}

ensure_storage_permissions() {
    echo -e "${CYAN}[INFO] Ensuring storage volume permissions for Linux...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm --user 0:0 --no-deps app sh -c \
        "mkdir -p /var/lib/srportal/storage && chown -R 1000:1000 /var/lib/srportal/storage && chmod -R 775 /var/lib/srportal/storage" >/dev/null 2>&1 || true
}

get_server_ip() {
    local ip=""
    if command -v hostname >/dev/null 2>&1; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')
    fi
    if [ -z "$ip" ]; then
        ip="localhost"
    fi
    echo "$ip"
}

show_summary() {
    local host_ip
    host_ip="$(get_server_ip)"
    local port="${APP_HOST_PORT:-6969}"

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   PSG TECH STAFF RECRUITMENT PORTAL — DEVELOPMENT READY${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
    if [ "$host_ip" != "localhost" ] && [ "$host_ip" != "127.0.0.1" ]; then
        echo -e "   ${BOLD}[WEB PORTAL]${NC}      http://${host_ip}:${port}  (local: http://localhost:${port})"
        echo -e "   ${BOLD}[SIGN IN PAGE]${NC}    http://${host_ip}:${port}/login"
        echo -e "   ${BOLD}[DATABASE VIEWER]${NC} http://${host_ip}:6981  (Adminer: db / srportal / srp_owner)"
        echo -e "   ${BOLD}[EMAIL INBOX]${NC}     http://${host_ip}:8025  (Mailpit web UI, SMTP on 2525)"
    else
        echo -e "   ${BOLD}[WEB PORTAL]${NC}      http://localhost:${port}"
        echo -e "   ${BOLD}[SIGN IN PAGE]${NC}    http://localhost:${port}/login"
        echo -e "   ${BOLD}[DATABASE VIEWER]${NC} http://localhost:6981  (Adminer: db / srportal / srp_owner)"
        echo -e "   ${BOLD}[EMAIL INBOX]${NC}     http://localhost:8025  (Mailpit web UI, SMTP on 2525)"
    fi
    echo -e "   ${BOLD}[DATABASE HOST]${NC}   localhost:6543  (PostgreSQL 17, internal 5432)"
    echo ""
    echo -e "   ${BOLD}AUTHENTICATION:${NC}"
    echo -e "   100% Passwordless Email OTP (6-digit codes delivered via Mailpit / SMTP)"
    echo ""
    echo -e "   ${BOLD}APPROVED INITIAL PRIVILEGED ACCOUNTS:${NC}"
    echo -e "   • Super Admin (Tino):             brittytino08@gmail.com  (Full System Admin)"
    echo -e "   • Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles & Screening)"
    echo -e "   • HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review & Summary Sheet)"
    echo ""
    echo -e "   * Development starts with NO dummy applicants or fake recruitment data."
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
}

wait_for_health() {
    echo -e "${CYAN}[3/3] Waiting for portal health...${NC}"
    local attempts=0
    local max_attempts=35
    local healthy=false
    local port="${APP_HOST_PORT:-6969}"

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
        echo -e "${GREEN}[OK] Recruitment Portal is healthy!${NC}"
    else
        echo -e "${YELLOW}[NOTE] Healthcheck timed out or services still initializing.${NC}"
        if command -v curl >/dev/null 2>&1; then
            local resp
            resp="$(curl -s "http://127.0.0.1:${port}/healthz/ready" 2>/dev/null || true)"
            if [ -n "$resp" ]; then
                echo -e "       Current /healthz/ready response: ${CYAN}${resp}${NC}"
            fi
        fi
        echo -e "       Containers are running in the background. Use '${BOLD}$0 logs${NC}' to monitor progress."
    fi
}

do_start() {
    check_prerequisites
    ensure_dev_env

    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   PSG TECH STAFF RECRUITMENT PORTAL - DEVELOPMENT RUNNER${NC}"
    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo ""

    echo -e "${CYAN}[1/3] Building Docker images...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" build app worker migrate converter

    echo ""
    echo -e "${CYAN}[2/3] Starting Docker stack...${NC}"
    ensure_storage_permissions
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d --remove-orphans --force-recreate

    echo ""
    wait_for_health
    show_summary

    if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost:${APP_HOST_PORT:-6969}" >/dev/null 2>&1 &
        fi
    fi
}

do_restart() {
    check_prerequisites
    ensure_dev_env
    ensure_storage_permissions
    echo -e "${CYAN}[INFO] Restarting development containers...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" restart
    wait_for_health
    show_summary
}

do_clean_rebuild() {
    check_prerequisites
    ensure_dev_env

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   CLEAN REBUILD IN DOCKER${NC}"
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
    ensure_dev_env

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   REGISTERING FORM TEMPLATES AND STAFF ACCOUNTS${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm migrate node build-worker/seed.js
}

do_studio() {
    check_prerequisites
    ensure_dev_env

    echo -e "${CYAN}Starting Prisma Studio on host...${NC}"
    local host_db_url="${DATABASE_URL:-postgresql://srp_owner:change-me-owner@localhost:6543/srportal?schema=public}"
    if command -v npx >/dev/null 2>&1; then
        DATABASE_URL="$host_db_url" npx prisma studio --port 5555
    else
        $COMPOSE "${COMPOSE_ARGS[@]}" exec app npx prisma studio --port 5555 --hostname 0.0.0.0
    fi
}

do_health() {
    check_prerequisites
    local port="${APP_HOST_PORT:-6969}"
    echo -e "${CYAN}Checking portal readiness (http://127.0.0.1:${port}/healthz/ready)...${NC}"
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
    echo -e "${BOLD}PSG Tech Staff Recruitment Portal - Development Runner${NC}"
    echo ""
    echo "Usage: ./dev.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  (none)            Start portal, wait for health, and launch interactive menu"
    echo "  up, start         Start portal stack in background (non-interactive)"
    echo "  stop              Gracefully stop containers (preserves data volumes)"
    echo "  down              Stop and remove containers (preserves data volumes)"
    echo "  restart           Restart portal containers"
    echo "  logs [svc...]     Stream container logs (e.g. ./dev.sh logs app)"
    echo "  status, ps        Show container status and published ports"
    echo "  health            Query the /healthz/ready status endpoint"
    echo "  seed              Seed form templates & approved institutional accounts"
    echo "  env               Reset .env to development defaults (.env.development)"
    echo "  rebuild, --clean  Rebuild Docker images without cache (--no-cache) and start"
    echo "  studio            Launch Prisma Studio GUI on port 5555"
    echo "  shell [svc]       Open interactive shell inside service (default: app)"
    echo "  db, adminer       Display Database Adminer viewer URL"
    echo "  help, -h, --help  Display this help reference"
    echo ""
}

interactive_loop() {
    if [ ! -t 0 ]; then
        exit 0
    fi

    local host_ip
    host_ip="$(get_server_ip)"
    local port="${APP_HOST_PORT:-6969}"

    while true; do
        echo ""
        echo -e "${BOLD}Select an option:${NC}"
        echo -e "  [${CYAN}B${NC}] Open / Show Portal in Browser"
        echo -e "  [${CYAN}D${NC}] Open / Show Database Viewer (Adminer)"
        echo -e "  [${CYAN}M${NC}] Open / Show Mailbox Inbox (Mailpit)"
        echo -e "  [${CYAN}A${NC}] Seed / Register Form Templates & Staff Accounts"
        echo -e "  [${CYAN}S${NC}] Launch Prisma Studio GUI"
        echo -e "  [${CYAN}L${NC}] View Container Logs"
        echo -e "  [${CYAN}R${NC}] Clean Rebuild (--no-cache)"
        echo -e "  [${CYAN}X${NC}] Stop Stack and Exit"
        echo -e "  [${CYAN}Q${NC}] Quit menu (keep stack running)"
        echo ""
        read -r -p "Enter choice [B/D/M/A/S/L/R/X/Q]: " choice || exit 0
        case "$choice" in
            [bB])
                echo -e "${GREEN}Portal URL: http://${host_ip}:${port}${NC}"
                if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "http://localhost:${port}" >/dev/null 2>&1 &
                fi
                ;;
            [dD])
                echo -e "${GREEN}Adminer URL: http://${host_ip}:6981/?pgsql=db&username=srp_owner&db=srportal&ns=public${NC}"
                if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "http://localhost:6981/?pgsql=db&username=srp_owner&db=srportal&ns=public" >/dev/null 2>&1 &
                fi
                ;;
            [mM])
                echo -e "${GREEN}Mailpit Inbox URL: http://${host_ip}:8025${NC}"
                if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "http://localhost:8025" >/dev/null 2>&1 &
                fi
                ;;
            [aA])
                do_seed || true
                ;;
            [sS])
                do_studio || true
                ;;
            [lL])
                $COMPOSE "${COMPOSE_ARGS[@]}" logs -f app worker db adminer
                ;;
            [rR])
                do_clean_rebuild
                ;;
            [xX])
                echo "Stopping and removing containers..."
                $COMPOSE "${COMPOSE_ARGS[@]}" down
                exit 0
                ;;
            [qQ])
                echo -e "${GREEN}Stack is running in the background. Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${YELLOW}Invalid choice. Please try again.${NC}"
                ;;
        esac
    done
}

# ------------------------------------------------------------------------------
# Argument Routing
# ------------------------------------------------------------------------------
CMD="${1:-}"

case "$CMD" in
    env|copy-env|init-env)
        ensure_dev_env
        ;;
    stop)
        check_prerequisites
        $COMPOSE "${COMPOSE_ARGS[@]}" stop
        ;;
    down)
        check_prerequisites
        echo "Stopping and removing containers..."
        $COMPOSE "${COMPOSE_ARGS[@]}" down
        ;;
    restart)
        do_restart
        ;;
    logs)
        check_prerequisites
        shift
        if [ $# -gt 0 ]; then
            $COMPOSE "${COMPOSE_ARGS[@]}" logs -f "$@"
        else
            $COMPOSE "${COMPOSE_ARGS[@]}" logs -f app worker db adminer
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
    studio)
        do_studio
        ;;
    rebuild|--clean)
        do_clean_rebuild
        ;;
    shell|bash|sh)
        shift
        do_shell "${1:-app}"
        ;;
    db|adminer)
        local_ip="$(get_server_ip)"
        echo -e "${GREEN}Adminer URL: http://${local_ip}:6981/?pgsql=db&username=srp_owner&db=srportal&ns=public${NC}"
        if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost:6981/?pgsql=db&username=srp_owner&db=srportal&ns=public" >/dev/null 2>&1 &
        fi
        ;;
    up|start)
        do_start
        ;;
    help|--help|-h|/\?)
        do_help
        ;;
    "")
        do_start
        interactive_loop
        ;;
    *)
        echo -e "${RED}[ERROR] Unknown command: '$CMD'${NC}"
        echo ""
        do_help
        exit 1
        ;;
esac
