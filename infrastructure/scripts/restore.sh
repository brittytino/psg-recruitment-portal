#!/usr/bin/env sh
# Restores a backup created by backup.sh. DESTRUCTIVE for the target database and storage volume.
# Usage: restore.sh <backup-dir> --yes [--project NAME] [--file compose.yaml] [--database NAME] [--volume NAME]
#   --database / --volume let you restore into a scratch database/volume to verify a backup.
# Stop app and worker first when restoring into the live database:
#   docker compose stop app worker   (or app-blue app-green worker in production)
set -eu
# Git Bash on Windows: do not rewrite container paths such as /data.
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${1:?usage: restore.sh <backup-dir> --yes [options]}"; shift
CONFIRM=no; PROJECT=psg-srportal; FILE=compose.yaml; DB=""; VOL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) CONFIRM=yes ;;
    --project) PROJECT="$2"; shift ;;
    --file) FILE="$2"; shift ;;
    --database) DB="$2"; shift ;;
    --volume) VOL="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
[ "$CONFIRM" = yes ] || { echo "Refusing to restore without --yes (this overwrites data)." >&2; exit 1; }
[ -f "$DIR/SHA256SUMS" ] || { echo "not a backup directory: $DIR" >&2; exit 1; }
( cd "$DIR" && sha256sum -c SHA256SUMS ) || { echo "checksum verification failed" >&2; exit 1; }
VOL="${VOL:-${PROJECT}_storage}"
dc() { docker compose -p "$PROJECT" -f "$ROOT/$FILE" ${ENV_FILE:+--env-file "$ENV_FILE"} "$@"; }

echo "[restore] database ${DB:-(configured)}"
if [ -n "$DB" ]; then
  dc exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS \"$DB\"' -c 'CREATE DATABASE \"$DB\"'"
  dc exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"$DB\" --no-owner --exit-on-error" < "$DIR/db.dump"
else
  dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < "$DIR/db.dump"
fi

echo "[restore] storage volume $VOL"
docker volume create "$VOL" >/dev/null
docker run --rm -i -v "$VOL":/data alpine:3.22 sh -c 'find /data -mindepth 1 -delete && tar -C /data -xzf - && chown -R 1000:1000 /data' < "$DIR/storage.tar.gz"
echo "[restore] complete"
