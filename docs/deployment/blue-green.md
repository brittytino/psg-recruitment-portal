# Blue-green deployment

Scripts: `infrastructure/blue-green/` · Stack: `compose.production.yaml` (project `srportal-prod`).

## Sequence (`deploy.sh <image:tag> [version]`)

1. Image must exist (or be pullable) and its `org.opencontainers.image.revision` label must equal the version (immutable, SHA-tagged).
2. `docker compose config -q` validates configuration.
3. Determine active color (`state/active`); target is the other one.
4. Pending migrations are listed; any containing `DROP TABLE/COLUMN`, `RENAME`, `ALTER COLUMN … TYPE` or `SET NOT NULL` aborts unless `ALLOW_CONTRACT_MIGRATIONS=1` (planned contract release only). Migrations + template registration run with the new image.
5. Start `app-<target>`; wait for Docker health (readiness: DB, Redis, storage).
6. Protected smoke tests run inside the container: live, ready (+version), home, vacancies, login, auth redirect, 404, a static asset.
7. `switch.sh`: write upstream, `nginx -t`, graceful reload, verify the version served through Nginx; on failure restore the previous config and reload.
8. Update the worker (SIGTERM → in-flight jobs finish, 120 s grace). Old and new workers can coexist (SKIP LOCKED outbox, versioned jobs).
9. Record `state/active`, `state/previous`, `state/history.log`. The previous color keeps running for rollback; `retire.sh --yes` stops it later.

Any failure before step 7 leaves the active color untouched.

## Migrations: expand and contract

1. **Expand** (release N): add nullable columns/tables/indexes; code N writes both old and new shapes.
2. **Backfill** in a job or one-off script.
3. **Contract** (release N+2, after N-1 can no longer be rolled back to): drop old columns with `ALLOW_CONTRACT_MIGRATIONS=1`, during a planned window, after a backup.
   Application rollback does **not** roll back the database (see runbooks/rollback.md).

## Local verification (2026-10-16, Windows 11 + Docker Desktop 29.8)

- Deploy `psg-srp-app:d2a193bcec22` → blue; deploy `…-r2` → green; `rollback.sh` → blue; deploy a deliberately broken image → aborted at health check, blue kept serving.
- A probe requesting `/vacancies` every 0.2 s throughout recorded **156 successes, 0 failures**.
- Public `/healthz/ready` returns 403 via Nginx; only `/healthz/live` is public.
  Not yet tested: an actual VPS, TLS termination, the destructive-migration guard firing, the `switch.sh` restore path with an invalid config.
