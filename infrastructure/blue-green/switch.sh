#!/usr/bin/env sh
# Points Nginx at <color>: write config, validate (nginx -t), graceful reload, verify the served
# version through Nginx. On any failure the previous configuration is restored and reloaded.
# Usage: switch.sh <color> <expected-version>
. "$(dirname "$0")/lib.sh"
color="$1"; version="$2"
conf="$STATE/upstream/active.conf"
backup="$STATE/upstream/active.conf.prev"
if [ -f "$conf" ]; then cp "$conf" "$backup"; fi
printf 'upstream app_active {\n    server app-%s:3000;\n    keepalive 16;\n}\n' "$color" > "$conf.new"
mv "$conf.new" "$conf"

restore() {
  log "restoring previous routing configuration"
  if [ -f "$backup" ]; then
    cp "$backup" "$conf"
    dc exec -T nginx nginx -t && dc exec -T nginx nginx -s reload
  fi
}

if ! dc ps --status running -q nginx | grep -q .; then
  dc up -d --no-deps nginx
  sleep 3
fi
if ! dc exec -T nginx nginx -t; then restore; die "nginx configuration test failed"; fi
dc exec -T nginx nginx -s reload
sleep 2
served="$(dc exec -T nginx wget -qO- http://127.0.0.1/healthz/ready 2>/dev/null || true)"
if ! printf '%s' "$served" | grep -q "\"version\":\"$version\""; then
  log "post-switch verification failed: $served"
  restore
  die "traffic switch to $color failed; previous routing restored"
fi
log "nginx now serving $color ($version)"
