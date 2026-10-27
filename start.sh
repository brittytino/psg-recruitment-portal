#!/usr/bin/env bash
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
if [ "${1:-}" = "prod" ] || [ "${1:-}" = "production" ]; then
    shift
    exec ./prod.sh "$@"
elif [ "${1:-}" = "dev" ] || [ "${1:-}" = "development" ]; then
    shift
    exec ./dev.sh "$@"
else
    exec ./run.sh "$@"
fi
