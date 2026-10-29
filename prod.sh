#!/usr/bin/env bash
# Production stack on a Linux server (Docker). Put Nginx with TLS in front (infrastructure/nginx).
#   ./prod.sh           first run creates .env with generated secrets; edit it, then run again
#   ./prod.sh help      all commands
exec "$(dirname "$0")/scripts/portal.sh" prod "$@"
