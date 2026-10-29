#!/usr/bin/env sh
# Routes traffic back to the previous color. This is an application rollback only; database
# migrations are not reverted (see docs/runbooks/rollback.md).
. "$(dirname "$0")/lib.sh"
prev="$(cat "$STATE/previous" 2>/dev/null || true)"
[ -n "$prev" ] || die "no previous color recorded"
cur="$(active_color)"
P="$(upper "$prev")"
version="$(get_var "${P}_VERSION")"; image="$(get_var "${P}_IMAGE")"
log "rolling back from $cur to $prev ($version)"
dc up -d --no-deps "app-$prev"
wait_healthy "app-$prev" 120 || die "previous color $prev is not healthy; cannot roll back"
"$BG_DIR/smoke.sh" "$prev" "$version"
"$BG_DIR/switch.sh" "$prev" "$version"
set_var WORKER_IMAGE "$image"; set_var WORKER_VERSION "$version"
dc up -d --no-deps worker
echo "$prev" > "$STATE/active"; echo "$cur" > "$STATE/previous"
record "rollback ok color=$prev version=$version from=$cur"
log "rollback complete: $prev serving $version"
