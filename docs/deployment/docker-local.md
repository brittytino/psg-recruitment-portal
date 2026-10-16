# Local Docker environment

Prerequisites: Docker Engine / Docker Desktop with Compose v2.17+, Node 22 (only for running tests/scripts on the host), Git.

```sh
./scripts/init-env.sh                     # creates .env with random secrets (first time only)
docker compose up -d --build              # db, redis, converter, clamav, mailpit, migrate, app, worker
open http://localhost:6969                # app;  /healthz/ready shows dependency status
```

ClamAV downloads signatures on first start (several minutes); the worker retries scans until it is healthy.

## Development mode (host ports, demo data, host dev server)

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d db redis converter clamav mailpit
. scripts/host-env.sh
npx prisma migrate deploy && SEED_DEMO=true npm run db:seed     # uses MIGRATION_DATABASE_URL? see below
npm run dev                                                     # http://localhost:3000
npm run worker                                                  # in a second terminal
```

For migrate/seed from the host use the owner URL: `DATABASE_URL=$MIGRATION_DATABASE_URL`.
Mailpit (captured e-mails): http://localhost:6980.

## Ports

| Service                       |    Host port | Container port | Published                                              |
| ----------------------------- | -----------: | -------------: | ------------------------------------------------------ |
| Application                   |         6969 |           3000 | always (local stack)                                   |
| PostgreSQL                    |        65432 |           5432 | dev override only, 127.0.0.1                           |
| Redis                         |        63879 |           6379 | dev override only, 127.0.0.1                           |
| Converter                     |        63100 |           3100 | dev override only, 127.0.0.1                           |
| ClamAV                        |        63310 |           3310 | dev override only, 127.0.0.1                           |
| Mailpit UI / SMTP             | 6980 / 61025 |    8025 / 1025 | dev override only                                      |
| Blue-green simulation (Nginx) |         6970 |             80 | `compose.production.yaml` with local `.env.production` |

All host ports are variables in `.env`. Check conflicts first: `netstat -ano | findstr :6969` (Windows) or `ss -ltnp | grep 6969` (Linux).

## Common commands

| Task                 | Command                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Logs                 | `docker compose logs -f app worker`                                                                     |
| Migrations           | `docker compose run --rm migrate`                                                                       |
| Tests                | `npm test` · `npm run test:integration` · `npm run test:e2e`                                            |
| Backup               | `infrastructure/scripts/backup.sh`                                                                      |
| Restore              | `infrastructure/scripts/restore.sh backups/<ts> --yes`                                                  |
| Graceful stop        | `docker compose stop` (volumes kept)                                                                    |
| Safe cleanup         | `docker compose down` (volumes kept)                                                                    |
| **Destroy all data** | `docker compose down -v` — deletes database, documents and queues; never use on shared/production hosts |
