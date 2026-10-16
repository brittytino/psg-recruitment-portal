# System architecture

```text
             Internet (HTTPS 443 / HTTP 80 → redirect)
                          │
                    ┌─────▼─────┐   edge network
                    │   Nginx   │── rate limits, security headers, blue/green upstream
                    └──┬─────┬──┘
            active ┌───▼──┐ ┌▼─────┐ standby
                   │ blue │ │green │  React Router v7 SSR app (same image, different tags)
                   └──┬───┘ └──┬───┘
        data network  │        │      backend network
     (internal only)  │        │
   ┌──────────┐ ┌─────▼──┐  ┌──▼────────┐ ┌───────────┐ ┌──────────┐
   │PostgreSQL│ │ Redis  │  │ converter │ │  ClamAV   │ │  SMTP    │
   └────▲─────┘ └───▲────┘  │LibreOffice│ │  clamd    │ │(Mailpit  │
        │           │       └─────▲─────┘ └────▲──────┘ │ in dev)  │
        │    ┌──────┴─────┐       │            │        └────▲─────┘
        └────│   worker   │───────┴────────────┴─────────────┘
             │ outbox relay, BullMQ: scan, generate PDF, e-mail
             └──────┬─────┘
                    │
            private storage volume (uploads/, generated/) — shared by app and worker
```

## Modules (`app/modules`)

| Module          | Responsibility                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `core`          | env validation, Prisma client, Redis, logger, domain errors                                        |
| `auth`          | passwords (Argon2id), sessions, CSRF, rate limits, permissions, record-level policy, account flows |
| `forms`         | canonical form definitions (single source of truth), validation, derived values                    |
| `applications`  | state machine, drafts, submission, withdrawal, staff transitions                                   |
| `documents`     | upload policy, private storage, ClamAV, DOCX population (`docx/`), PDF pipeline                    |
| `reviews`       | reviewer assignment, review records                                                                |
| `recruitment`   | departments, disciplines, cycles, vacancies                                                        |
| `reporting`     | HR list/filter/sort/pagination, counts, CSV export, audit log query                                |
| `notifications` | transactional outbox, notifications, SMTP mailer                                                   |
| `audit`         | append-only audit events                                                                           |
| `users`         | staff accounts and role grants                                                                     |

Route modules in `app/routes` are thin: parse input, call a service, render. Business rules and authorization live in services. The worker (`worker/index.ts`) imports the same modules.

## Request lifecycle

1. Root middleware: CSP nonce, Origin check for non-GET requests, session resolution.
2. Loader/action calls `requireUser`/`requireStaff`, then a service that applies record-level scope.
3. Mutations verify the session-bound CSRF token (`readForm`) and run in explicit transactions.
4. Side effects (e-mail, scan, PDF) are written to `outbox_events` in the same transaction and relayed by the worker after commit.

See ADRs in `docs/adr/` for the reasoning behind each choice.
