#!/usr/bin/env sh
# Environment for running the web app / worker / tests on the host against the dev Compose
# services (docker compose -f compose.yaml -f compose.dev.yaml up -d db redis converter clamav mailpit).
# Usage:  . scripts/host-env.sh && npm run dev
export NODE_ENV="${NODE_ENV:-development}"
export APP_ORIGIN="${APP_ORIGIN:-http://localhost:6969}"
export DATABASE_URL="${HOST_DATABASE_URL:-postgresql://srp_app:PsgTech_DbApp_2026!@localhost:6543/srportal?schema=public}"
export MIGRATION_DATABASE_URL="${HOST_MIGRATION_DATABASE_URL:-postgresql://srp_owner:PsgTech_DbOwner_2026!@localhost:6543/srportal?schema=public}"
export REDIS_URL="${HOST_REDIS_URL:-redis://localhost:63879}"
export SESSION_SECRET="${SESSION_SECRET:-host-development-secret-at-least-32-characters}"
export COOKIE_SECURE=false
export STORAGE_DIR="${STORAGE_DIR:-./storage}"
export CONVERTER_URL="${HOST_CONVERTER_URL:-http://localhost:63100}"
export CONVERTER_TOKEN="${CONVERTER_TOKEN:-psg_conv_sec_token_98234710293847}"
export MALWARE_SCAN="${MALWARE_SCAN:-clamav}"
export CLAMAV_HOST=localhost
export CLAMAV_PORT=63310
export SMTP_HOST=localhost
export SMTP_PORT=2525
export MAIL_FROM="PSG Tech Recruitment <recruitment@localhost>"
export LOG_LEVEL="${LOG_LEVEL:-info}"
