#!/usr/bin/env sh
# Shared helpers for blue-green deployment. Sourced by deploy.sh / switch.sh / rollback.sh / smoke.sh.
set -eu
# Git Bash on Windows: do not rewrite container paths such as /data.
export MSYS_NO_PATHCONV=1
BG_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BG_DIR/../.." && pwd)"
STATE="$BG_DIR/state"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
mkdir -p "$STATE/upstream"
[ -f "$STATE/images.env" ] || : > "$STATE/images.env"

log() { printf '%s [bg] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

dc() { docker compose -p srportal-prod -f "$ROOT/compose.production.yaml" --env-file "$ENV_FILE" --env-file "$STATE/images.env" "$@"; }

active_color() { cat "$STATE/active" 2>/dev/null || echo none; }
other_color() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

# set_var KEY VALUE: update images.env atomically.
set_var() {
  tmp="$STATE/images.env.tmp"
  grep -v "^$1=" "$STATE/images.env" > "$tmp" || true
  echo "$1=$2" >> "$tmp"
  mv "$tmp" "$STATE/images.env"
}
get_var() { grep "^$1=" "$STATE/images.env" | tail -1 | cut -d= -f2-; }

record() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$STATE/history.log"; }

# wait_healthy SERVICE TIMEOUT_SECONDS
wait_healthy() {
  svc="$1"; timeout="${2:-120}"; waited=0
  while [ "$waited" -lt "$timeout" ]; do
    cid="$(dc ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      st="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
      if [ "$st" = healthy ]; then return 0; fi
      if [ "$st" = unhealthy ]; then log "$svc is unhealthy"; return 1; fi
    fi
    sleep 3; waited=$((waited + 3))
  done
  log "$svc not healthy after ${timeout}s"; return 1
}

# http_in SERVICE PATH: HTTP GET from inside the container; prints "<status> <body>".
http_in() {
  dc exec -T "$1" node -e "fetch('http://127.0.0.1:3000$2',{redirect:'manual'}).then(async r=>{process.stdout.write(r.status+' '+(await r.text()).slice(0,6000))}).catch(e=>{process.stdout.write('000 '+e.message);process.exit(1)})"
}
