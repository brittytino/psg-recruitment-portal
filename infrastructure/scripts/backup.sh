#!/usr/bin/env sh
# Consistent backup of the database (pg_dump custom format) and private document storage.
# Usage: backup.sh [compose-project] [compose-file...]
#   infrastructure/scripts/backup.sh                     # local dev stack (psg-srportal)
#   infrastructure/scripts/backup.sh srportal-prod compose.production.yaml
# Output: backups/<UTC timestamp>/{db.dump,storage.tar.gz,SHA256SUMS,manifest.txt}
# Backups contain personal data: store them encrypted, off-host, with restricted access.
set -eu
# Git Bash on Windows: do not rewrite container paths such as /data.
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="${1:-psg-srportal}"
FILE="${2:-compose.yaml}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ROOT/backups/$TS"
mkdir -p "$OUT"
chmod 700 "$ROOT/backups" "$OUT"
dc() { docker compose -p "$PROJECT" -f "$ROOT/$FILE" ${ENV_FILE:+--env-file "$ENV_FILE"} "$@"; }

echo "[backup] database"
dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$OUT/db.dump"

echo "[backup] private storage"
VOL="${PROJECT}_storage"
docker run --rm -v "$VOL":/data:ro alpine:3.22 tar -C /data -czf - . > "$OUT/storage.tar.gz"

( cd "$OUT" && sha256sum db.dump storage.tar.gz > SHA256SUMS )
{
  echo "created=$TS"
  echo "project=$PROJECT"
  echo "db_bytes=$(wc -c < "$OUT/db.dump")"
  echo "storage_files=$(tar -tzf "$OUT/storage.tar.gz" | grep -vc '/$')"
} > "$OUT/manifest.txt"
chmod 600 "$OUT"/*
echo "[backup] complete: $OUT"
cat "$OUT/manifest.txt"
