# Contributing

Thank you for helping improve the PSG College of Technology faculty and research recruitment system.
It is open source under the [MIT License](./LICENSE) and is **in production**: real candidates apply
through it. Please read this page before opening a pull request.

## Ground rules

1. **Never commit personal data or secrets.** No real e-mail addresses, names of applicants, passwords,
   app passwords, tokens or `.env` files. Use `you@example.org` / `@your-college.edu` in examples and
   tests. Server values live in `.env` and `secrets/override.env`, which are git-ignored.
2. **Database changes are additive only.** Add new tables or nullable / defaulted columns in a new
   migration under `prisma/migrations/`. Never drop, rename or rewrite columns that hold live data, and
   never edit a migration that has already been released. Make migrations idempotent
   (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`).
3. **Every rule is enforced on the server.** Hiding a button is not access control: check the
   permission in the loader / action / service (`app/modules/auth/permissions.ts`,
   `policy.server.ts`).
4. **Keep it accessible.** Labels on every field, keyboard access, visible focus, confirmation before
   anything serious, and clear messages.

## Getting started

```sh
git clone https://github.com/brittytino/psg-recruitment-portal.git
cd psg-recruitment-portal
./dev.sh          # Windows: dev.bat — starts Postgres, Redis, the converter, ClamAV and Mailpit
```

The site runs at http://localhost:6969 and every e-mail (including sign-in codes) lands in Mailpit at
http://127.0.0.1:8025 — nothing reaches real inboxes.

## Before you open a pull request

```sh
npm run typecheck
npm run lint
npm test                    # unit tests
npm run test:integration    # needs the dev stack running
npm run build
```

All of them must pass. Add or update tests for the behaviour you change.

## Pull requests

- Branch from **`dev`** and open the pull request **against `dev`**. `qa` is for testing and `main` is
  production; see the [branch flow in the README](./README.md#13a-branches-and-release-flow).

- One topic per pull request, with a short description of **what** changed and **why**.
- Screenshots for visible changes (desktop and phone width).
- Link the issue it closes (`Closes #12`).
- Commits: clear, imperative subject lines (`fix(uploads): accept PDFs with leading bytes`).

## Project layout

| Path | What |
| --- | --- |
| `app/routes/` | Pages and resource routes (React Router) |
| `app/modules/` | Business logic, one folder per domain (applications, auth, documents, helpdesk …) |
| `app/components/` | Shared UI; `components/ui/` holds the shadcn-style primitives |
| `prisma/` | Schema, migrations and the seed |
| `worker/` | Background jobs (PDF generation, virus scans, e-mail) |
| `scripts/`, `infrastructure/` | Launchers, Nginx and deployment |
| `docs/` | Architecture, deployment and runbooks |

## Reporting security problems

Please do **not** open a public issue. See [SECURITY.md](./SECURITY.md).
