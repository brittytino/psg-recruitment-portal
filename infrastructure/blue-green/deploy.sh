#!/usr/bin/env sh
# Blue-green deployment of an immutable image tagged with a Git commit SHA.
# Usage: deploy.sh <image:tag> [version]      (version defaults to the tag)
# Env:   ENV_FILE (default .env.production); ALLOW_CONTRACT_MIGRATIONS=1 permits destructive SQL
#        (only in a planned contract-phase release, never in an ordinary switch).
. "$(dirname "$0")/lib.sh"
image="${1:?usage: deploy.sh <image:tag> [version]}"
version="${2:-${image##*:}}"

log "1. verifying image $image and configuration"
docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >/dev/null || die "image $image not available"
label="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
[ "$label" = "$version" ] || die "image revision label '$label' does not match version '$version'"
[ -f "$ENV_FILE" ] || die "environment file $ENV_FILE not found"
dc config -q || die "compose configuration invalid"

active="$(active_color)"
if [ "$active" = none ]; then target=blue; else target="$(other_color "$active")"; fi
log "2. active=$active target=$target"

log "3. checking that pending migrations are expand-only"
dc up -d db redis converter clamav
wait_healthy db 120 || die "database not healthy"
applied="$(dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select migration_name from _prisma_migrations" 2>/dev/null' || true)"
pending=""
for d in $(docker run --rm --entrypoint sh "$image" -c 'ls prisma/migrations | grep -v migration_lock'); do
  printf '%s\n' "$applied" | grep -qx "$d" || pending="$pending $d"
done
for m in $pending; do
  if docker run --rm --entrypoint cat "$image" "prisma/migrations/$m/migration.sql" | grep -Eiq 'DROP (TABLE|COLUMN)|RENAME (TO|COLUMN)|ALTER COLUMN [^;]* TYPE|SET NOT NULL'; then
    [ "${ALLOW_CONTRACT_MIGRATIONS:-0}" = 1 ] || die "migration $m is destructive (contract phase) and must not run during an ordinary switch. See docs/deployment/blue-green.md"
  fi
done
log "   pending:${pending:- none}"
set_var MIGRATE_IMAGE "$image"
dc --profile ops run --rm migrate || die "migrations / template registration failed; active color $active untouched"

log "4. starting app-$target with $image"
T="$(upper "$target")"
set_var "${T}_IMAGE" "$image"
set_var "${T}_VERSION" "$version"
dc up -d --no-deps --force-recreate "app-$target"

log "5. waiting for health"
wait_healthy "app-$target" 180 || die "app-$target failed health checks; active color $active untouched"

log "6. protected smoke tests"
"$BG_DIR/smoke.sh" "$target" "$version" || die "smoke tests failed; active color $active untouched"

log "7. switching traffic"
"$BG_DIR/switch.sh" "$target" "$version"

log "8. updating the worker (graceful drain of in-flight jobs)"
set_var WORKER_IMAGE "$image"
set_var WORKER_VERSION "$version"
dc up -d --no-deps worker
wait_healthy worker 120 || log "WARNING: worker not healthy yet; inspect: docker compose -p srportal-prod logs worker"

if [ "$active" != none ]; then echo "$active" > "$STATE/previous"; fi
echo "$target" > "$STATE/active"
record "deploy ok color=$target version=$version image=$image previous=$active"
log "deployment complete: $target serving $version; $active retained for rollback"
