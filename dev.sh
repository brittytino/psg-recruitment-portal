#!/usr/bin/env bash
# Development stack (Docker): app, worker, PostgreSQL, Redis, converter, ClamAV, Mailpit, DB viewer.
#   ./dev.sh            start (build, migrate, seed, wait for health)
#   ./dev.sh help       all commands
exec "$(dirname "$0")/scripts/portal.sh" dev "$@"
