#!/usr/bin/env sh
# Protected smoke tests, run inside the target container (never through public traffic).
# Usage: smoke.sh <color> <expected-version>
. "$(dirname "$0")/lib.sh"
color="$1"; version="$2"; svc="app-$color"
fail=0
check() { # path expected-status [must-contain]
  out="$(http_in "$svc" "$1" || true)"; code="${out%% *}"
  if [ "$code" != "$2" ]; then log "smoke FAIL $1 -> $code (want $2)"; fail=1; return 0; fi
  if [ -n "${3:-}" ] && ! printf '%s' "$out" | grep -q "$3"; then log "smoke FAIL $1 missing '$3'"; fail=1; return 0; fi
  log "smoke ok  $1 -> $code"
}
check /healthz/live 200 '"ok"'
check /healthz/ready 200 "\"version\":\"$version\""
check / 200 "Shape the future"
check /vacancies 200 "Open vacancies"
check /login 200 "Sign in"
check /staff 302
check /this-page-does-not-exist 404
# A static asset referenced by the home page must be served.
asset="$(http_in "$svc" / | grep -o '/assets/[A-Za-z0-9._-]*\.js' | head -1 || true)"
if [ -n "$asset" ]; then check "$asset" 200; else log "smoke FAIL no asset reference found"; fail=1; fi
[ "$fail" -eq 0 ] || die "smoke tests failed for $svc"
log "smoke tests passed for $svc ($version)"
