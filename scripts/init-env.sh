#!/usr/bin/env sh
# Creates .env from .env.example with freshly generated secrets.
# Run BEFORE the first `docker compose up` (database passwords are applied when the
# PostgreSQL volume is first initialised). Refuses to overwrite an existing .env.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && { echo ".env already exists — not overwriting." >&2; exit 1; }
rand() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('base64url'))"; }
OWNER=$(rand 24); APP=$(rand 24)
sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$OWNER|" \
    -e "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$APP|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://srp_app:$APP@db:5432/srportal?schema=public|" \
    -e "s|^MIGRATION_DATABASE_URL=.*|MIGRATION_DATABASE_URL=postgresql://srp_owner:$OWNER@db:5432/srportal?schema=public|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(rand 48)|" \
    -e "s|^CONVERTER_TOKEN=.*|CONVERTER_TOKEN=$(rand 24)|" \
    -e "s|^SEED_DEMO_PASSWORD=.*|SEED_DEMO_PASSWORD=Demo-$(rand 9)|" \
    .env.example > .env
chmod 600 .env
echo "Created .env with generated secrets."
