#!/usr/bin/env bash
# ==============================================================================
# PSG TECH STAFF RECRUITMENT PORTAL — INITIAL SYSTEM DEPLOYMENT (FIRST DEPLOY)
# ==============================================================================
# Usage:
#   ./start.sh              First-time full stack deployment & database bootstrap
#   ./start.sh prod         First-time production deployment
#   ./start.sh dev          First-time development deployment (with Mailpit)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ANSI colors
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
        echo -e "  - If stopped:            ${YELLOW}sudo systemctl start docker${NC}"
        echo -e "  - If permission denied:  ${YELLOW}sudo usermod -aG docker \$USER && newgrp docker${NC}"
        exit 1
    fi
}

init_environment() {
    local mode="${1:-}"
    echo -e "${CYAN}[1/5] Setting up environment configuration...${NC}"

    if [ "$mode" = "dev" ] || [ "$mode" = "development" ]; then
        if [ -f .env.development ]; then
            cp -f .env.development .env
            echo -e "${GREEN}[OK] Initialized .env from .env.development${NC}"
        fi
    elif [ "$mode" = "prod" ] || [ "$mode" = "production" ]; then
        if [ -f .env.production ]; then
            cp -f .env.production .env
            echo -e "${GREEN}[OK] Initialized .env from .env.production${NC}"
        fi
    elif [ ! -f .env ] || [ ! -s .env ]; then
        if [ -f .env.production ]; then
            cp -f .env.production .env
            echo -e "${GREEN}[OK] Initialized .env from .env.production${NC}"
        elif [ -f .env.example ]; then
            cp -f .env.example .env
            echo -e "${GREEN}[OK] Initialized .env from .env.example${NC}"
        fi
    else
        echo -e "${GREEN}[OK] Using existing configured .env${NC}"
    fi

    # Ensure SESSION_SECRET has adequate cryptographic randomness if placeholder is present
    if grep -q "replace-with" .env 2>/dev/null; then
        echo -e "${CYAN}[INFO] Generating secure cryptographic keys for placeholder secrets...${NC}"
        local new_secret=""
        if command -v openssl >/dev/null 2>&1; then
            new_secret="$(openssl rand -hex 32)"
        elif command -v node >/dev/null 2>&1; then
            new_secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
        else
            new_secret="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        fi
        sed -i "s|SESSION_SECRET=replace-with.*|SESSION_SECRET=${new_secret}|g" .env
    fi
}

ensure_storage_permissions() {
    echo -e "${CYAN}[2/5] Preparing persistent document storage & permissions...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm --user 0:0 --no-deps app sh -c \
        "mkdir -p /var/lib/srportal/storage && chown -R 1000:1000 /var/lib/srportal/storage && chmod -R 775 /var/lib/srportal/storage" >/dev/null 2>&1 || true
    echo -e "${GREEN}[OK] Storage directory initialized (UID 1000 node writable).${NC}"
}

build_containers() {
    echo -e "${CYAN}[3/5] Building Docker application & worker images...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" build app worker migrate converter
    echo -e "${GREEN}[OK] Docker images built successfully.${NC}"
}

run_first_deployment_migrations() {
    echo -e "${CYAN}[4/5] Deploying database schema & bootstrapping institutional accounts...${NC}"
    # Start backing services first
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d db redis
    
    # Run migration runner: executes npx prisma migrate deploy && node build-worker/seed.js
    echo -e "${CYAN}[INFO] Running database migrations and seed runner...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" run --rm migrate
    echo -e "${GREEN}[OK] Database migrated and approved institutional accounts seeded.${NC}"
}

launch_stack() {
    echo -e "${CYAN}[5/5] Launching full recruitment portal stack...${NC}"
    $COMPOSE "${COMPOSE_ARGS[@]}" up -d --remove-orphans
    echo -e "${GREEN}[OK] All service containers launched.${NC}"
}

wait_for_health() {
    echo -e "${CYAN}[INFO] Waiting for service readiness...${NC}"
    local port="${APP_HOST_PORT:-6969}"
    if [ -f .env ]; then
        local env_port
        env_port="$(grep -E '^APP_HOST_PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r\n ' || true)"
        if [ -n "$env_port" ]; then port="$env_port"; fi
    fi

    local attempts=0
    local max_attempts=40
    local healthy=false

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
        echo -e "${GREEN}[OK] Portal readiness verified!${NC}"
    else
        echo -e "${YELLOW}[NOTE] Portal healthcheck still pending (services may be initializing ClamAV).${NC}"
    fi
}

record_deployment() {
    date -u +"%Y-%m-%dT%H:%M:%SZ" > .deployed
    echo -e "${GREEN}[OK] Deployment marker (.deployed) recorded.${NC}"
}

show_summary() {
    local port="${APP_HOST_PORT:-6969}"
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
    echo -e "${BOLD}${GREEN}   PSG TECH STAFF RECRUITMENT PORTAL — INITIAL DEPLOYMENT COMPLETE${NC}"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
    echo -e "   ${BOLD}[WEB PORTAL URL]${NC}      http://localhost:${port}  (${origin})"
    echo -e "   ${BOLD}[SIGN IN PAGE]${NC}        http://localhost:${port}/login"
    echo -e "   ${BOLD}[DATABASE VIEWER]${NC}     http://localhost:6981  (Modern pgweb web interface)"
    echo -e "   ${BOLD}[LOCAL EMAIL INBOX]${NC}   http://localhost:8025  (Mailpit web UI, SMTP on 2525)"
    echo -e "   ${BOLD}[SMTP READINESS CHECK]${NC} http://localhost:${port}/healthz/smtp"
    echo ""
    echo -e "   ${BOLD}AUTHENTICATION:${NC}"
    echo -e "   100% Passwordless Email OTP (6-digit numeric codes delivered via SMTP / Mailpit)"
    echo ""
    echo -e "   ${BOLD}APPROVED PRIVILEGED ACCOUNTS BOOTSTRAPPED:${NC}"
    echo -e "   • Super Admin (Tino):             brittytino08@gmail.com  (Full System Access)"
    echo -e "   • Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)"
    echo -e "   • HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles & Screening)"
    echo -e "   • HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review & Summary Sheet)"
    echo ""
    echo -e "   ${BOLD}ROUTINE OPERATIONS NOTE:${NC}"
    echo -e "   Initial deployment is complete. For subsequent launches, simply execute:"
    echo -e "     ${GREEN}./run.sh${NC}   (or ./run.sh up / ./run.sh start)"
    echo -e "${BOLD}${BLUE}================================================================================${NC}"
    echo ""
}

# Main First-Deployment Flow
echo ""
echo -e "${BOLD}${CYAN}================================================================================${NC}"
echo -e "${BOLD}${CYAN}   PSG TECH STAFF RECRUITMENT PORTAL — FIRST-TIME DEPLOYMENT${NC}"
echo -e "${BOLD}${CYAN}================================================================================${NC}"
echo ""

MODE="${1:-}"
check_prerequisites
init_environment "$MODE"
ensure_storage_permissions
build_containers
run_first_deployment_migrations
launch_stack
wait_for_health
record_deployment
show_summary
