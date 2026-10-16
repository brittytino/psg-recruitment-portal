# Team work allocation — Tino and Hari

Status: `Not started` · `In progress` · `Blocked` · `Implemented` · `Verified` (only with test evidence).
Reviewer is always the other developer. Effort in ideal days (d). Totals: **Tino 41 d · Hari 42 d**.

The initial implementation (2026-10-16) was produced with an AI coding agent working on behalf of both workstreams. Each owner must now review, take ownership of and sign off their areas; "Verified" below refers to automated test evidence only, not to human review.

## Tino — Workstream A

| ID  | Task                            | Scope                                                                    | Depends on | Acceptance criteria                         | Tests                               | Effort | Status                    | Reviewer |
| --- | ------------------------------- | ------------------------------------------------------------------------ | ---------- | ------------------------------------------- | ----------------------------------- | ------ | ------------------------- | -------- |
| A1  | Architecture & ADRs             | module boundaries, ADRs 0001/0004/0005/0006                              | –          | ADRs reflect code                           | doc review                          | 2      | Implemented               | Hari     |
| A2  | Shared contracts                | `forms/types.ts`, `workflow.ts`, `permissions.ts` with Hari              | –          | both streams compile against them           | typecheck                           | 2      | Implemented               | Hari     |
| A3  | Authentication & sessions       | Argon2id, sessions, rotation, logout, lockout, rate limits               | A2         | no plaintext tokens; lockout after 8        | e2e login; unit TBD                 | 4      | Implemented (e2e partial) | Hari     |
| A4  | Account flows                   | register, verify, reset, privacy acceptance, no enumeration              | A3         | identical responses for existing/new e-mail | e2e TBD                             | 3      | Implemented               | Hari     |
| A5  | RBAC + record scope             | permission matrix, `policy.server.ts`, route guards                      | A2         | matrix doc matches code                     | integration authorization           | 4      | Verified                  | Hari     |
| A6  | CSRF, CSP, headers              | middleware Origin check, HMAC token, nonce CSP                           | A3         | cross-origin POST blocked                   | e2e                                 | 2      | Verified                  | Hari     |
| A7  | Recruitment admin               | departments, disciplines, cycles, vacancies, required docs, form version | A5         | publish rules enforced                      | integration TBD                     | 4      | Implemented               | Hari     |
| A8  | User & role administration      | staff invites, grants, disable, reviewer grants by admin                 | A5         | no self-lockout                             | integration TBD                     | 3      | Implemented               | Hari     |
| A9  | Public site                     | home, vacancies, vacancy detail, help, privacy (placeholders marked)     | A7         | no invented policy content                  | e2e                                 | 3      | Verified                  | Hari     |
| A10 | Candidate dashboard & lifecycle | drafts, submission, receipt, withdrawal, clarification resubmission      | A2, B1     | immutable revision, reference no.           | integration                         | 4      | Verified                  | Hari     |
| A11 | Application editor UX           | sections, progress, autosave, concurrency, unsaved guard                 | B2         | no data loss on conflict                    | e2e + integration                   | 4      | Verified                  | Hari     |
| A12 | CI quality gates                | lint, types, unit, integration, e2e, build, audit, image scan            | –          | CI green on PR                              | CI run (not yet executed on GitHub) | 2      | Implemented               | Hari     |
| A13 | Blue-green scripts (with Hari)  | deploy/switch/rollback/smoke                                             | B12        | zero failed requests                        | local simulation                    | 3      | Verified (local)          | Hari     |
| A14 | Accessibility audit             | axe + keyboard + screen reader pass                                      | all UI     | WCAG 2.2 AA issues fixed                    | axe report                          | 1      | Not started               | Hari     |

## Hari — Workstream B

| ID  | Task                                    | Scope                                                                  | Depends on | Acceptance criteria                    | Tests                    | Effort | Status      | Reviewer |
| --- | --------------------------------------- | ---------------------------------------------------------------------- | ---------- | -------------------------------------- | ------------------------ | ------ | ----------- | -------- |
| B1  | Schema & migrations                     | Prisma schema, constraints, append-only triggers, least-privilege role | A2         | migrations match schema                | drift check, integration | 4      | Verified    | Tino     |
| B2  | Form definitions (both forms)           | every field with source page/label, validation                         | –          | inventory generated, complete          | unit                     | 5      | Verified    | Tino     |
| B3  | Field traceability inventory            | generator + doc                                                        | B2         | CI fails if stale                      | CI step                  | 1      | Implemented | Tino     |
| B4  | DOCX population                         | in-place OOXML filling, block letters, overflow, photo, tab layout     | B2         | every field bound; originals preserved | unit (12) + visual       | 6      | Verified    | Tino     |
| B5  | Converter service                       | LibreOffice container, limits, token                                   | –          | internal only                          | integration              | 2      | Verified    | Tino     |
| B6  | Upload validation & storage             | magic bytes, PDF parse, private storage, checksums                     | B1         | spoofed files rejected                 | integration              | 3      | Verified    | Tino     |
| B7  | Malware scanning                        | ClamAV INSTREAM, retry, blocking                                       | B6         | EICAR detected                         | integration              | 2      | Verified    | Tino     |
| B8  | PDF pipeline & merge                    | bundle order, image pages, validation, versions                        | B4,B5,B7   | page counts exact; failures visible    | integration              | 4      | Verified    | Tino     |
| B9  | Worker & outbox                         | relay, BullMQ, retries, drain, heartbeat                               | B1         | exactly-once enqueue                   | local run                | 3      | Implemented | Tino     |
| B10 | HR list & dashboard                     | filters, search, sort, pagination, counts, CSV                         | A5         | counts from DB only                    | e2e + integration        | 4      | Verified    | Tino     |
| B11 | Application detail, reviews, assignment | transitions UI, reviewer assignment, review records, PDF versions      | A10        | guards enforced                        | integration              | 4      | Verified    | Tino     |
| B12 | Docker Compose & health                 | multi-stage images, health checks, networks, volumes                   | –          | clean start works                      | local                    | 2      | Verified    | Tino     |
| B13 | Backup & restore (with Tino)            | scripts + restore test                                                 | B12        | identical data after restore           | local restore test       | 1      | Verified    | Tino     |
| B14 | Operational docs & runbooks             | pdf-failures, backup, rollback                                         | B8         | match implementation                   | doc review               | 1      | Implemented | Tino     |

## Shared

Database design reviews, e2e tests, security/authorization tests, accessibility verification, Compose, blue-green validation, README, VPS readiness, release acceptance. Every PR touching auth, authorization, revision immutability, migrations, uploads, PDF generation, routing or secrets needs the other developer's approval; nobody approves their own PR.
