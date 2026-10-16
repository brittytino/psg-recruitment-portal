# PSG College of Technology — Staff Recruitment Portal

Institutional faculty-recruitment platform: public vacancies, candidate onboarding, the **official Assistant Professor and Professor / Associate Professor application forms** completed online, secure document uploads, a consolidated official PDF per application, HR and department review, audit history, Dockerised deployment with blue-green releases.

> Status (2026-10-16): functional and locally verified. Not yet deployed to a VPS. See [§28](#28-current-completion-status-and-next-actions) and [docs/release-readiness.md](docs/release-readiness.md).

## 1. Project overview

Candidates register, choose a vacancy, fill every section of the official form (save/resume, validation, repeatable tables), upload their photograph and attested copies, review and submit. Submission freezes an immutable revision with a reference number (`PSGTECH-2026-000123`). A background worker scans files with ClamAV, populates the **original DOCX template in place**, converts it with LibreOffice and merges the attachments into one PDF. HR screens, assigns department reviewers, records decisions; every action is audited.

## 2. Scope and non-goals

In scope: everything above, administration of departments/disciplines/cycles/vacancies/required documents/users, CSV export, backups, blue-green deployment.
Non-goals (now): payments, interview scheduling, offer letters, SSO/MFA, multilingual UI, analytics, mobile apps. Official policies (eligibility, deadlines, retention) are **not invented**; placeholders are marked.

## 3. Technology stack

TypeScript (strict) · React 19 · React Router 7.18 Framework Mode (SSR, loaders/actions, middleware) · Tailwind CSS 4 · Zod 4 · PostgreSQL 17 + Prisma 6.19 · Redis 7 + BullMQ 5 worker · JSZip + xmldom (OOXML population) · LibreOffice headless (separate container) · pdf-lib · ClamAV 1.4 · Nginx 1.28 · Docker Compose · Vitest 3 · Playwright 1.64 · GitHub Actions. Versions pinned, lockfile committed ([ADR 0007](docs/adr/0007-pinned-versions.md)).

## 4. Architecture diagram

```text
 Nginx ──► app-blue | app-green (SSR web, same image, different SHA tags)
              │  data (internal)          backend
              ├──► PostgreSQL, Redis       ├──► converter (LibreOffice)
              │                            ├──► ClamAV
 worker ──────┴── outbox relay → BullMQ ───┴──► SMTP
 private storage volume (uploads/, generated/) shared by app + worker
```

Details: [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md), [ERD](docs/architecture/erd.md), [workflow](docs/architecture/application-workflow.md), [document pipeline](docs/architecture/document-pipeline.md), [ADRs](docs/adr/).

## 5. Repository structure

```text
app/            routes/ (thin), components/, modules/<domain>/ (services, *.server.ts), root.tsx, entry.server.tsx
worker/         background worker (outbox relay, scan, PDF, e-mail)
converter/      internal LibreOffice HTTP service
prisma/         schema.prisma, migrations/, seed.ts
templates/      immutable template versions (byte-identical copies of the originals)
source-documents/  the two official DOCX files as supplied
tests/          unit/, integration/, e2e/, fixtures/ (pdf-regression output is generated)
infrastructure/ nginx/, docker/, blue-green/, scripts/ (backup/restore)
docs/           requirements/, architecture/, adr/, security/, deployment/, runbooks/, testing/
scripts/        init-env, host-env, inventory generator, PDF sample rendering
compose.yaml · compose.dev.yaml · compose.production.yaml · Dockerfile · .env.example
```

Deviation from the suggested layout: domain modules are flat under `app/modules/*` (one folder per domain, including `forms` and `users`) and security tests live in `tests/integration` with the authorization suite.

## 6. Prerequisites

Docker Engine/Desktop with Compose ≥ 2.17. For tests and scripts on the host: Node.js 22 and Git Bash/sh. Nothing else (PostgreSQL, Redis, LibreOffice, ClamAV run in containers).

## 7. Local environment setup

```sh
git clone <repo> && cd PSG-SRPortal
./scripts/init-env.sh            # .env with generated secrets (never committed)
docker compose up -d --build     # first ClamAV start downloads signatures (minutes)
# http://localhost:6969
```

Demo data (development only):

```sh
docker compose run --rm -e SEED_DEMO=true -e NODE_ENV=development migrate node build-worker/seed.js
```

Demo accounts (`@example.test`, password = `SEED_DEMO_PASSWORD` in `.env`): `candidate@`, `candidate2@`, `hr@`, `reviewer.cse@`, `reviewer.ece@`, `admin@`, `superadmin@`, `auditor@`.

## 8. Docker Compose commands & Windows one-click runner

| Task                           | Command                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| **One-click All-in-One (.bat)**| `.\run.bat` (or double-click `run.bat` in root)               |
| Clean rebuild & run            | `.\run.bat rebuild` (or `docker compose build --no-cache && docker compose up -d`) |
| Start / rebuild (manual)       | `docker compose up -d --build`                                |
| Dev (host ports + DB viewer)   | `docker compose -f compose.yaml -f compose.dev.yaml up -d`    |
| Logs                           | `docker compose logs -f app worker`                           |
| Status                         | `docker compose ps`                                           |
| Graceful stop                  | `docker compose stop`                                         |
| Remove containers (keeps data) | `docker compose down`                                         |
| **Delete all data**            | `docker compose down -v` (destructive; never on shared hosts) |

More: [docs/deployment/docker-local.md](docs/deployment/docker-local.md).

## 9. Port mapping

| Service                                                                                                                                                          |          Host |   Container | Exposure                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | ----------: | ----------------------- |
| Application                                                                                                                                                      |          6969 |        3000 | local stack             |
| Database Viewer (Adminer Web GUI)                                                                                                                                |          6981 |        8080 | local stack / dev       |
| Mailpit UI / SMTP                                                                                                                                                |  6980 / 61025 | 8025 / 1025 | dev override            |
| PostgreSQL                                                                                                                                                       |         65432 |        5432 | dev override, loopback  |
| Redis                                                                                                                                                            |         63879 |        6379 | dev override, loopback  |
| Converter / ClamAV                                                                                                                                               | 63100 / 63310 | 3100 / 3310 | dev override, loopback  |
| Blue-green simulation Nginx                                                                                                                                      |          6970 |          80 | local `.env.production` |
| Production                                                                                                                                                       |       80, 443 |  Nginx only | public                  |
| Blue/green have no published ports (diagnostics 6971/6972 deliberately not exposed; smoke tests run inside the containers). All host ports are `.env` variables. |

## 10. Environment variables

See [.env.example](.env.example) (commented). Validated at startup by `app/modules/core/env.server.ts`; production refuses example secrets and disabled malware scanning.

## 11. Database migration and seed

`docker compose run --rm migrate` (migrations + template registration, owner role) · host: `DATABASE_URL=<owner url> npx prisma migrate deploy` · seed: `npm run db:seed` (templates), `SEED_DEMO=true …` (demo), `BOOTSTRAP_ADMIN_EMAIL=…` (first Super Admin, prints one-time link).

## 12. Test and lint commands

`npm run lint` · `npm run typecheck` · `npm run format:check` · `npm test` (unit) · `npm run test:integration` (needs dev services) · `npm run test:e2e` (needs running app + demo seed) · `npm run forms:inventory`. See [docs/testing/testing.md](docs/testing/testing.md).

## 13. Authentication and role setup

Candidates self-register (e-mail verification required to apply). Staff accounts are created by a Super Admin (invitation e-mail with password-setup link) and given roles: HR officer (optionally per cycle), Department reviewer (per department), Recruitment admin, Super admin, Auditor. Matrix: [docs/architecture/authorization-matrix.md](docs/architecture/authorization-matrix.md).

## 14. Official form inventory and fidelity rules

Inventory (generated, 44 + 121 entries with page, label, type, validation, storage, PDF mapping): [docs/requirements/form-field-inventory.md](docs/requirements/form-field-inventory.md). Rules: originals are immutable (checksums registered); labels, order, tables, letterhead, logo, photo box, signature and employer-endorsement areas are preserved; values are inserted, never replacing labels; overflow continues, never truncates; deviations are reported per PDF. The Associate heading “PROFESSOR / ASSOCIATE PROFESSOR” is unchanged. Notes: Word reports 10 pages for the Associate form, LibreOffice renders 11.

## 15. PDF generation workflow

Submit → outbox → scan jobs → generate job: verify template checksum → populate DOCX + photo → LibreOffice → validate → append attachments in defined order → verify page count → store with checksum (write-once) → READY. Failures are visible to HR with actionable messages; regeneration creates a new version. [docs/architecture/document-pipeline.md](docs/architecture/document-pipeline.md), [runbook](docs/runbooks/pdf-failures.md).

## 16. Security architecture

Server sessions (hashed tokens, HttpOnly/SameSite/Secure), Argon2id, lockout + rate limits, Origin check + CSRF tokens, nonce CSP and security headers, record-level authorization in every query, append-only DB tables, least-privilege DB role, private storage with checksums, magic-byte validation + ClamAV, audit log, no PII in URLs/logs/notifications. [Threat model](docs/security/threat-model.md), [upload policy](docs/security/file-upload-policy.md).

## 17. Git workflow

`main` protected (PR + review by the other developer + green CI); `feature/<name>`, `fix/<name>`, optional `release/<version>`. Conventional commits. PR template: problem, scope, implementation, DB/API changes, security implications, screenshots, test evidence, docs, deployment implications. Critical areas (auth, authorization, immutability, migrations, uploads, PDF, routing, secrets) always need the other developer's approval.

## 18. CI/CD design

[.github/workflows/ci.yml](.github/workflows/ci.yml): install from lockfile, format, lint, typecheck, unit, inventory freshness, build, dependency audit; integration (real services), migration drift, e2e, PDF render; image build tagged with SHA, Trivy scan, Compose validation. [deploy.yml](.github/workflows/deploy.yml): manual, `main` only, protected `production` environment, pushes the SHA image and runs `deploy.sh` over SSH. Neither workflow has run on GitHub yet.

## 19. Blue-green deployment procedure

`ENV_FILE=.env.production ./infrastructure/blue-green/deploy.sh <image:sha> [version]` — verify image/config → expand-only migration check → start inactive color → health → protected smoke tests → validated Nginx switch with automatic restore → worker drain → record state. [docs/deployment/blue-green.md](docs/deployment/blue-green.md).

## 20. Rollback procedure

`./infrastructure/blue-green/rollback.sh` (application only; database migrations are not reverted). [docs/runbooks/rollback.md](docs/runbooks/rollback.md).

## 21. Backup and restoration

`infrastructure/scripts/backup.sh` · `infrastructure/scripts/restore.sh <dir> --yes [--database scratch --volume scratch]`. [docs/runbooks/backup-restore.md](docs/runbooks/backup-restore.md).

## 22. VPS deployment preparation

Linux assumptions, firewall, DNS/TLS, secrets, first deploy, admin bootstrap, monitoring, certificate renewal: [docs/deployment/vps-deployment.md](docs/deployment/vps-deployment.md).

## 23. Troubleshooting

| Symptom                                                            | Fix                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `worker`/`app` exits: “SESSION_SECRET still has the example value” | run `scripts/init-env.sh` or set a real secret                          |
| `/healthz/ready` → storage false                                   | config invalid or volume not writable — check `docker compose logs app` |
| Uploads stay “Scan pending”                                        | ClamAV still downloading signatures: `docker compose logs clamav`       |
| PDF failed                                                         | see [pdf-failures runbook](docs/runbooks/pdf-failures.md)               |
| Port in use                                                        | change `APP_HOST_PORT` etc. in `.env`                                   |
| Git Bash path errors in scripts                                    | scripts set `MSYS_NO_PATHCONV=1`; run them from Git Bash/WSL/Linux      |
| “Your session has expired” on a form                               | reload the page (CSRF token is per session)                             |

## 24. Known limitations

See [docs/release-readiness.md](docs/release-readiness.md#outstanding-defects--limitations): typed page marker spill on long Associate page 1, “State :” wrap, no staff MFA, no automated accessibility audit, Prisma CLI advisory, LibreOffice vs Word pagination, policies pending.

## 25. Tino — ownership and task matrix

Workstream A: architecture & integration, identity & access, recruitment management, candidate-facing platform, CI & code quality. Full matrix with scope, dependencies, acceptance criteria, tests, effort, status and reviewer: [docs/TEAM_WORKPLAN.md](docs/TEAM_WORKPLAN.md#tino--workstream-a).

| Area                                            | Status                              |
| ----------------------------------------------- | ----------------------------------- |
| A1–A2 Architecture, shared contracts            | Implemented                         |
| A3–A4 Authentication, account flows             | Implemented                         |
| A5–A6 RBAC/record scope, CSRF/CSP               | Verified                            |
| A7–A8 Recruitment & user administration         | Implemented                         |
| A9–A11 Public site, candidate lifecycle, editor | Verified                            |
| A12 CI gates                                    | Implemented (not yet run on GitHub) |
| A13 Blue-green (with Hari)                      | Verified locally                    |
| A14 Accessibility audit                         | Not started                         |

## 26. Hari — ownership and task matrix

Workstream B: database & forms, document subsystem, HR & review workflows, operational reliability. Full matrix: [docs/TEAM_WORKPLAN.md](docs/TEAM_WORKPLAN.md#hari--workstream-b).

| Area                                                            | Status                 |
| --------------------------------------------------------------- | ---------------------- |
| B1 Schema & migrations                                          | Verified               |
| B2–B3 Form definitions, inventory                               | Verified / Implemented |
| B4–B8 DOCX population, converter, uploads, ClamAV, PDF pipeline | Verified               |
| B9 Worker & outbox                                              | Implemented            |
| B10–B11 HR list, detail, reviews                                | Verified               |
| B12–B13 Compose, backup/restore                                 | Verified               |
| B14 Runbooks                                                    | Implemented            |

## 27. Shared responsibilities

Database design reviews, e2e/security/accessibility testing, code review (never self-approval), Compose, blue-green validation, README, VPS readiness, release acceptance.

## 28. Current completion status and next actions

**Verified locally:** both forms complete and rendered into the original templates; submission/immutability; uploads + ClamAV; consolidated PDFs; authorization scopes; Docker stack; blue-green with zero failed requests; backup/restore. Unit 12/12, integration 12/12, e2e 6/6.

**Next actions**

1. College decisions listed in [release-readiness](docs/release-readiness.md#decisions-required-from-the-college).
2. Push to GitHub, enable branch protection, run CI (A12).
3. Automated accessibility audit with axe + manual screen-reader pass (A14).
4. Integration tests for admin, account e-mail flows, CSV export; e2e for a full browser submission.
5. Provision the VPS, TLS and SMTP; first real deployment with the `production` environment.
6. Human review and sign-off of each workstream by its owner and the reviewer.
