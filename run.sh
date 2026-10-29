#!/usr/bin/env bash
# ==============================================================================
# PSG TECH STAFF RECRUITMENT PORTAL - DOCKER RUNNER FOR LINUX / MACOS
# ==============================================================================
# Usage:
#   ./run.sh                  Start portal, check health, and enter interactive menu
#   ./run.sh up | start       Start portal in background (non-interactive)
#   ./run.sh stop             Stop portal containers (keep data)
#   ./run.sh down             Stop and remove portal containers
#   ./run.sh restart          Restart portal containers
#   ./run.sh logs [service]   Follow container logs (default: app worker db db-viewer)
#   ./run.sh status | ps      Show status of portal containers
#   ./run.sh health           Check /healthz/ready health endpoint
#   ./run.sh seed             Seed form templates & approved institutional accounts
#   ./run.sh env              Copy .env.example to .env directly
#   ./run.sh rebuild          Clean rebuild images with --no-cache and start
#   ./run.sh studio           Launch Prisma Studio database GUI
#   ./run.sh shell [service]  Open shell inside a container (default: app)
#   ./run.sh help             Show this help message
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ANSI color codes (disabled if not attached to a TTY)
if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[0;32m"
    CYAN="\033[0;36m"
    YELLOW="\033[1;33m"
    RED="\033[0;31m"
    BLUE="\033[0;34m"
    MAGENTA="\033[0;35m"
    NC="\033[0m"
else
    BOLD=""
    GREEN=""
    CYAN=""
    YELLOW=""
    RED=""
    BLUE=""
    MAGENTA=""
    NC=""
fi

# Detect Docker Compose command (docker compose plugin vs docker-compose standalone)
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    COMPOSE=""
fi

# Docker Compose files (standard development/standalone stack)
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

copy_env_file() {
    if [ ! -f .env.example ]; then
        echo -e "${RED}[ERROR] .env.example not found in $(pwd)!${NC}"
        return 1
    fi
    echo -e "${CYAN}[INFO] Copying .env.example to .env...${NC}"
    cp -f .env.example .env
    chmod 644 .env 2>/dev/null || true
    echo -e "${GREEN}[OK] Successfully copied .env.example -> .env${NC}"
}

ensure_env_file() {
    if [ ! -f .env ] || [ ! -s .env ]; then
        echo -e "${CYAN}[INFO] .env not found or empty. Initializing configuration from .env.example...${NC}"
        copy_env_file
    else
        echo -e "${GREEN}[OK] Found existing .env file.${NC}"
    fi

    # Fix placeholder secrets so production env() checks never crash
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
        echo -e "${GREEN}[OK] Replaced default placeholder secrets with cryptographically secure random values.${NC}"
    fi
}

ensure_storage_permissions() {
    echo -e "${CYAN}[INFO] Ensuring storage volume permissions for Linux / Debian...${NC}"
    # In Linux/Debian, Docker named volumes or storage folders may be initialized with root:root ownership.
    # The application and worker containers run as non-root user 'node' (UID 1000).
    # Fix ownership and permissions inside the shared volume before launching services:
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
    local origin=""
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then port="$env_port"; fi
        origin="$(grep -E '^APP_ORIGIN=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
    fi

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   PSG TECH STAFF RECRUITMENT PORTAL — READY${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
    if [ -n "$origin" ] && [ "$origin" != "http://localhost:6969" ]; then
        echo -e "   ${BOLD}[PRODUCTION URL]${NC}  ${GREEN}${origin}${NC}"
    fi
    if [ "$host_ip" != "localhost" ] && [ "$host_ip" != "127.0.0.1" ]; then
        echo -e "   ${BOLD}[WEB PORTAL]${NC}      http://${host_ip}:${port}  (local: http://localhost:${port})"
        echo -e "   ${BOLD}[SIGN IN PAGE]${NC}    http://${host_ip}:${port}/login"
        echo -e "   ${BOLD}[DATABASE VIEWER]${NC} http://${host_ip}:6981  (Modern pgweb web interface)"
        echo -e "   ${BOLD}[EMAIL INBOX]${NC}     http://${host_ip}:8025  (Mailpit web UI, SMTP on 2525)"
    else
        echo -e "   ${BOLD}[WEB PORTAL]${NC}      http://localhost:${port}"
        echo -e "   ${BOLD}[SIGN IN PAGE]${NC}    http://localhost:${port}/login"
        echo -e "   ${BOLD}[DATABASE VIEWER]${NC} http://localhost:6981  (Modern pgweb web interface)"
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
    echo -e "   * Production starts cleanly with NO dummy applicants or fake recruitment data."
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
}

wait_for_health() {
    echo -e "${CYAN}[3/3] Waiting for portal health...${NC}"
    local attempts=0
    local max_attempts=35
    local healthy=false
    local port="${APP_HOST_PORT:-6969}"
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then
            port="$env_port"
        fi
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
        echo -e "${GREEN}[OK] Recruitment Portal is healthy!${NC}"
    else
        echo -e "${YELLOW}[NOTE] Healthcheck timed out or services still initializing (e.g. ClamAV signature update).${NC}"
        if command -v curl >/dev/null 2>&1; then
            local health_resp
            health_resp="$(curl -s "http://127.0.0.1:${port}/healthz/ready" 2>/dev/null || true)"
            if [ -n "$health_resp" ]; then
                echo -e "       Readiness status: ${CYAN}${health_resp}${NC}"
            fi
        fi
        echo -e "       Containers are running in the background. Use '${BOLD}$0 logs${NC}' to monitor progress."
    fi
}

do_start() {
    check_prerequisites
    ensure_env_file

    # If first deployment has not been executed yet, trigger start.sh
    if [ ! -f .deployed ]; then
        echo -e "${CYAN}[INFO] First-time deployment detected. Initializing stack via ./start.sh...${NC}"
        exec ./start.sh "$@"
    fi

    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   PSG TECH STAFF RECRUITMENT PORTAL — STARTING SYSTEM${NC}"
    echo -e "${BOLD}${CYAN}================================================================================${NC}"
    echo ""

    echo -e "${CYAN}[1/2] Bringing up containers...${NC}"
    ensure_storage_permissions
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d

    echo ""
    echo -e "${CYAN}[2/2] Checking health...${NC}"
    wait_for_health
    show_summary

    # Open browser on desktop Linux if display server and xdg-open exist
    if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
        if command -v xdg-open >/dev/null 2>&1; then
            local port="${APP_HOST_PORT:-6969}"
            xdg-open "http://localhost:${port}" >/dev/null 2>&1 &
        fi
    fi
}

do_restart() {
    check_prerequisites
    ensure_env_file
    ensure_storage_permissions
    $COMPOSE "${COMPOSE_ARGS[@]}" restart
    wait_for_health
}

do_seed() {
    check_prerequisites
    ensure_env_file

    echo ""
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "${BOLD}${CYAN}   REGISTERING FORM TEMPLATES AND STAFF ACCOUNTS${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo -e "Seeding form templates and the approved institutional accounts..."
    echo ""

    local seed_status=1

    # First attempt: run via Docker migrate container (requires no node/dependencies on host)
    echo -e "${CYAN}[INFO] Running seed inside Docker migrate container...${NC}"
    if $COMPOSE "${COMPOSE_ARGS[@]}" run --rm migrate node build-worker/seed.js; then
        seed_status=0
    fi

    # Second attempt: fallback to host tsx if docker runner didn't succeed and node/npx exists
    if [ $seed_status -ne 0 ] && command -v npx >/dev/null 2>&1; then
        echo -e "${CYAN}[INFO] Retrying via host runner (npx tsx prisma/seed.ts)...${NC}"
        local host_db_url="${DATABASE_URL:-postgresql://srp_owner:PsgTech_DbOwner_2026%21@localhost:6543/srportal?schema=public}"
        DATABASE_URL="$host_db_url" npx tsx prisma/seed.ts && seed_status=0 || seed_status=$?
    fi

    echo ""
    if [ $seed_status -eq 0 ]; then
        echo -e "${GREEN}[OK] Seed command completed successfully.${NC}"
    else
        echo -e "${RED}[ERROR] Seeding failed with exit code ${seed_status}.${NC}"
    fi

    return $seed_status
}

do_clean_rebuild() {
    check_prerequisites
    ensure_env_file

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

do_studio() {
    check_prerequisites
    ensure_env_file

    echo -e "${CYAN}Starting Prisma Studio on host...${NC}"
    local host_db_url="${DATABASE_URL:-postgresql://srp_owner:PsgTech_DbOwner_2026%21@localhost:6543/srportal?schema=public}"
    if command -v npx >/dev/null 2>&1; then
        DATABASE_URL="$host_db_url" npx prisma studio --port 5555
    else
        echo -e "${YELLOW}[NOTE] npx not found on host. Executing Prisma Studio via Docker app container...${NC}"
        $COMPOSE "${COMPOSE_ARGS[@]}" exec app npx prisma studio --port 5555 --hostname 0.0.0.0
    fi
}

do_health() {
    check_prerequisites
    echo -e "${CYAN}Checking portal readiness (http://127.0.0.1:6969/healthz/ready)...${NC}"
    if command -v curl >/dev/null 2>&1; then
        curl -i http://127.0.0.1:6969/healthz/ready
    elif command -v wget >/dev/null 2>&1; then
        wget -S -O - http://127.0.0.1:6969/healthz/ready
    else
        echo -e "${RED}[ERROR] Neither curl nor wget found on host.${NC}"
        exit 1
    fi
}

do_shell() {
    check_prerequisites
    local svc="${1:-app}"
    echo -e "${CYAN}Opening shell inside container '${svc}'...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" exec -it "$svc" /bin/sh || $COMPOSE "${COMPOSE_ARGS[@]}" exec "$svc" /bin/sh
}

do_help() {
    echo -e "${BOLD}PSG Tech Staff Recruitment Portal - Docker Runner (Linux/macOS)${NC}"
    echo ""
    echo "Usage: ./run.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  (none)            Start portal, wait for health, and launch interactive menu"
    echo "  up, start         Start portal stack in background (non-interactive)"
    echo "  stop              Gracefully stop containers (preserves data volumes)"
    echo "  down              Stop and remove containers (preserves data volumes)"
    echo "  restart           Restart portal containers"
    echo "  logs [svc...]     Stream container logs (e.g. ./run.sh logs app)"
    echo "  status, ps        Show container status and published ports"
    echo "  health            Query the /healthz/ready status endpoint"
    echo "  seed              Seed form templates & approved institutional accounts"
    echo "  env, copy-env     Copy .env.example to .env directly"
    echo "  rebuild, --clean  Rebuild Docker images without cache (--no-cache) and start"
    echo "  studio            Launch Prisma Studio GUI on port 5555"
    echo "  shell [svc]       Open interactive shell inside service (default: app)"
    echo "  db, pgweb, viewer Display Modern Database Viewer (pgweb) URL"
    echo "  help, -h, --help  Display this help reference"
    echo ""
}

interactive_loop() {
    # If stdin is not a terminal (e.g. running non-interactively or in CI), exit cleanly
    if [ ! -t 0 ]; then
        exit 0
    fi

    local host_ip
    host_ip="$(get_server_ip)"

    while true; do
        echo ""
        echo -e "${BOLD}Select an option:${NC}"
        echo -e "  [${CYAN}B${NC}] Open / Show Portal in Browser"
        echo -e "  [${CYAN}D${NC}] Open / Show Database Viewer (pgweb)"
        echo -e "  [${CYAN}M${NC}] Open / Show Mailbox Inbox (Mailpit)"
        echo -e "  [${CYAN}A${NC}] Seed / Register Form Templates & Staff Accounts"
        echo -e "  [${CYAN}E${NC}] Copy / Reset .env from .env.example"
        echo -e "  [${CYAN}S${NC}] Launch Prisma Studio GUI"
        echo -e "  [${CYAN}L${NC}] View Container Logs"
        echo -e "  [${CYAN}R${NC}] Clean Rebuild (--no-cache)"
        echo -e "  [${CYAN}X${NC}] Stop Stack and Exit"
        echo -e "  [${CYAN}Q${NC}] Quit menu (keep stack running)"
        echo ""
        read -r -p "Enter choice [B/D/M/A/E/S/L/R/X/Q]: " choice || exit 0
        case "$choice" in
            [bB])
                echo -e "${GREEN}Portal URL: http://${host_ip}:6969${NC}"
                if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "http://localhost:6969" >/dev/null 2>&1 &
                fi
                ;;
            [dD])
                echo -e "${GREEN}Database Viewer URL: http://${host_ip}:6981${NC}"
                if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "http://localhost:6981" >/dev/null 2>&1 &
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
            [eE])
                copy_env_file
                ;;
            [sS])
                do_studio || true
                ;;
            [lL])
                $COMPOSE "${COMPOSE_ARGS[@]}" logs -f app worker db db-viewer
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
    prod|production)
        shift
        exec ./prod.sh "$@"
        ;;
    dev|development|demo)
        shift
        exec ./dev.sh "$@"
        ;;
    env|copy-env|init-env)
        copy_env_file
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
    db|pgweb|adminer|viewer)
        local_ip="$(get_server_ip)"
        echo -e "${GREEN}Database Viewer URL: http://${local_ip}:6981${NC}"
        if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost:6981" >/dev/null 2>&1 &
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
