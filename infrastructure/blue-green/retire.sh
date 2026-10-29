#!/usr/bin/env sh
# Stops the inactive color once the rollback window has passed. Volumes are never touched.
. "$(dirname "$0")/lib.sh"
inactive="$(other_color "$(active_color)")"
[ "${1:-}" = "--yes" ] || die "this stops app-$inactive (instant rollback will no longer be possible). Re-run with --yes to confirm."
dc stop "app-$inactive"
record "retired color=$inactive"
log "stopped app-$inactive"
