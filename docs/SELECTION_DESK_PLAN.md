# Selection Desk — Product and Engineering Plan

> Faculty and staff recruitment platform for colleges and universities.
> Product: **Selection Desk** · Domain: **selectiondesk.in** · Repository: `brittytino/selectiondesk` (private)
> Status as of 4 November 2026: code copied from the PSG Tech portal with full history; this document is the plan of record.

---

## Contents

1. [Summary](#1-summary)
2. [Domains and URLs](#2-domains-and-urls)
3. [What we have today](#3-what-we-have-today)
4. [What is missing for a multi-college product](#4-what-is-missing-for-a-multi-college-product)
5. [Target architecture](#5-target-architecture)
6. [Multi-college (tenant) design](#6-multi-college-tenant-design)
7. [Domains, SSL and Cloudflare](#7-domains-ssl-and-cloudflare)
8. [Infrastructure on our VPS](#8-infrastructure-on-our-vps)
9. [Security and compliance](#9-security-and-compliance)
10. [Scaling path](#10-scaling-path)
11. [Repositories, branches and releases](#11-repositories-branches-and-releases)
12. [Roadmap by phase](#12-roadmap-by-phase)
13. [Product features after launch](#13-product-features-after-launch)
14. [Plans and pricing (₹)](#14-plans-and-pricing-)
15. [Running costs (₹)](#15-running-costs-)
16. [Go-to-market](#16-go-to-market)
17. [Risks](#17-risks)
18. [Immediate checklist](#18-immediate-checklist)

---

## 1. Summary

Selection Desk is the recruitment portal built for and running live at PSG College of Technology
(500+ users, real recruitment), turned into a product that many colleges can use.

- **One codebase, one installation, many colleges.** Each college gets `name.selectiondesk.in`
  or its own domain (for example `careers.college.ac.in`).
- **Hosted on our VPS**, behind Cloudflare. No college has to run servers.
- **Data isolation is enforced twice:** in the application and in PostgreSQL row-level security,
  with automated tests proving one college can never see another's data.
- **PSG Tech is unchanged.** It keeps its own server and its own repository, and receives
  security fixes only. Later it can move onto Selection Desk as an "on-campus" customer.
- **Single-college mode remains.** The same code can still be installed on a college's own server
  for the Enterprise On-Campus plan.

---

## 2. Domains and URLs

| Purpose | Address | Notes |
| --- | --- | --- |
| Main website (marketing) | `selectiondesk.in` | Product pages, pricing, contact, legal pages |
| Main application / owner console | `app.selectiondesk.in` | Our console: create colleges, plans, usage, support |
| Each college | `<college>.selectiondesk.in` | e.g. `kct.selectiondesk.in`; created automatically |
| College's own domain | `careers.<college>.ac.in` | College adds one CNAME; SSL issued by Cloudflare |
| API (only if needed) | `api.selectiondesk.in` | Reserved for integrations (ERP, HRMS, webhooks) later |
| Documentation | `docs.selectiondesk.in` | User guides for HR, HOD, Principal, candidates |
| System status | `status.selectiondesk.in` | Uptime page (hosted status service or self-hosted) |
| Demo college | `demo.selectiondesk.in` | Clearly marked sample data, reset nightly |

**Reserved names** that can never be used as a college subdomain:
`www, app, api, docs, status, demo, admin, mail, smtp, help, support, billing, static, assets, cdn, staging, qa, dev`.

**Environments**

| Environment | Address | Branch |
| --- | --- | --- |
| Production | `*.selectiondesk.in` | `main` |
| QA / staging | `*.qa.selectiondesk.in` (or `qa-<college>.selectiondesk.in`) | `qa` |
| Development | local machine | `dev` |

---

## 3. What we have today

### 3.1 Product features (already working at PSG)

**Candidates**
- E-mail one-time-code sign-in (no passwords), registration with Indian mobile validation, privacy consent.
- Multi-step application form with autosave, qualifications, employment history, research details.
- Document upload with virus scanning, file-type checks and an in-page viewer.
- Automatically generated application PDF with a reference number.
- Application status tracking, notifications and help desk tickets.

**Staff**

| Role (label shown) | What they do |
| --- | --- |
| Admin | Runs the portal: vacancies, departments, notices, users (HR / HOD / Viewer), help desk |
| Dean / Principal | Oversight, assigns to HODs, final accept / reject with 1–5 star rating, even after a HOD rejection |
| HR | Screening (N4 section), deadlines (including extension), summary reports |
| HOD | Department review with decision and 1–5 star rating |
| Viewer | Read-only access |
| Owner | Hidden platform account (us) |

- Vacancies with eligibility criteria, required documents and deadlines (deadlines can be extended; closed vacancies can be reopened).
- Review assignments, review history and full status history per application.
- Summary report with charts and export; recruitment-year archive ("Recruitment 2026–27"; older years archived automatically).
- Public notices with PDF viewer, departments, disciplines and research specialisations.
- Help desk with tickets, messages, attachments and help articles.
- Formal no-reply e-mails over plain SMTP, with a sending budget and an outbox.
- Complete audit trail of every important action.
- Custom 404 page (noughts-and-crosses game).

### 3.2 Technology

| Layer | What we use |
| --- | --- |
| Web framework | React Router 7 (server-side rendering, framework mode, middleware) on Node.js |
| UI | Tailwind CSS v4, Radix UI components, SVG charts (no inline styles; strict CSP) |
| Database | PostgreSQL with Prisma 6 — 38 tables, 19 migrations (all additive and idempotent) |
| Background work | Redis + BullMQ worker (PDF generation, e-mail outbox) |
| Documents | ClamAV virus scanning, LibreOffice converter service for PDFs |
| E-mail | nodemailer over plain SMTP |
| Files | Local disk (`STORAGE_DIR`, areas `uploads/` and `generated/`) |
| Deployment | Docker Compose, nginx, blue-green app containers (`app-blue` / `app-green`), migration job |
| Quality | TypeScript, ESLint, Vitest (160 unit tests), integration tests, Playwright, GitHub Actions CI |

**Codebase size:** 12 server modules (`applications, audit, auth, core, documents, forms, helpdesk,
notices, notifications, recruitment, reporting, reviews, settings, users`), 58 route files.

### 3.3 Security already in place

- Content Security Policy with a per-request nonce, no inline styles or scripts.
- Rate limiting on sign-in, codes, registration and resets; account lockout.
- Short staff sessions; "remember device" only for candidates.
- Safe redirects, role-based permissions (`review:final`, `recruitment:manage`, …).
- Database constraints (for example ratings must be 1–5).
- Virus scanning and content-type detection on every upload; storage keys never come from user input.
- Separate Docker networks (`data` is internal only).

---

## 4. What is missing for a multi-college product

| Area | Today | Needed |
| --- | --- | --- |
| Colleges | One college, built in | Many colleges in one installation |
| Branding | "PSG" appears in about 156 places across 63 files | Name, logo, colours, address, reference prefix, e-mail text, privacy text per college |
| Data separation | Not needed | Every record belongs to a college; enforced in app + database |
| Domains | One fixed domain (`APP_ORIGIN`) | Subdomain per college + custom domains with automatic SSL |
| Settings | One global `SystemSetting` table | Settings per college (with platform defaults) |
| Files | Local disk | Object storage (Cloudflare R2), separated by college |
| E-mail | One SMTP sender | Per-college sender name and reply-to; platform SMTP with good deliverability (SPF, DKIM, DMARC) |
| Users | E-mail unique across the whole system | Same person may apply to two colleges → accounts scoped per college |
| Our operations | Command line | Owner console: create / suspend colleges, plans, limits, usage, support access |
| Onboarding | Manual setup | New college live the same day from the console |
| Billing | None | Plans and limits; invoices first, Razorpay later |
| Monitoring | Logs | Error tracking, uptime alerts, status page, per-college metrics |
| Backups | Server level | Nightly encrypted off-site backups, tested restores, per-college export |
| Legal | PSG licence | Subscription agreement, data processing agreement (DPDP Act 2023), privacy policy, terms |

---

## 5. Target architecture

```
Candidates / college staff
        │
        ▼
kct.selectiondesk.in · careers.kct.ac.in · app.selectiondesk.in
        │
        ▼
Cloudflare (DNS, SSL, WAF, DDoS protection, custom hostnames, caching of static files)
        │   only Cloudflare IPs allowed through the VPS firewall
        ▼
VPS — Docker Compose
 ├─ nginx            (origin certificate, routes all hosts to the app)
 ├─ app-blue / app-green  (React Router SSR; zero-downtime switch)
 ├─ worker           (PDFs, e-mail, scheduled jobs)
 ├─ PostgreSQL       (row-level security per college)
 ├─ Redis            (sessions cache, rate limits, queues — keys prefixed by college)
 ├─ ClamAV           (virus scanning)
 └─ converter        (LibreOffice → PDF)
        │
        ├─► Cloudflare R2: documents and generated PDFs (per-college prefix)
        └─► Cloudflare R2: nightly encrypted database backups
```

**How a request is handled**

1. Cloudflare receives `kct.selectiondesk.in` and forwards it to the VPS.
2. A middleware reads the `Host` header and looks up the college (cached in Redis for 60 s).
3. Unknown host → marketing redirect. Suspended college → "temporarily unavailable" page.
4. The college is placed in the request context; every database call runs inside a transaction
   that sets `app.institution_id`, so PostgreSQL only returns that college's rows.
5. Pages are rendered with the college's branding (`/theme.css` served per college, CSP-safe).

---

## 6. Multi-college (tenant) design

### 6.1 New tables (additive migrations only)

```prisma
model Institution {
  id            String   @id @default(uuid()) @db.Uuid
  code          String   @unique          // "kct" → kct.selectiondesk.in, also reference prefix
  name          String                    // "Kumaraguru College of Technology"
  shortName     String
  status        InstitutionStatus @default(TRIAL)   // TRIAL, ACTIVE, SUSPENDED, ARCHIVED
  plan          Plan     @default(CAMPUS)            // CAMPUS, CAMPUS_PRO, ENTERPRISE
  branding      Json                      // logo key, colours, address, footer text
  limits        Json                      // vacancies, staff users, storage GB
  createdAt     DateTime @default(now())
  domains       InstitutionDomain[]
}

model InstitutionDomain {
  id             String  @id @default(uuid()) @db.Uuid
  institutionId  String  @db.Uuid
  hostname       String  @unique         // "kct.selectiondesk.in" or "careers.kct.ac.in"
  isPrimary      Boolean @default(false)
  status         DomainStatus            // PENDING, ACTIVE, FAILED
  cfHostnameId   String?                 // Cloudflare for SaaS reference
}
```

### 6.2 Changes to existing tables

- Add `institutionId` (nullable first) to the top-level tables: `User`, `Department`, `Discipline`,
  `ResearchSpecialisation`, `FormTemplate`, `Vacancy`, `Application`, `PublicNotice`,
  `SupportTicket`, `HelpArticle`, `SystemSetting`, `AuditEvent`, `Notification`, `OutboxEvent`,
  the reference counters and `SummarySheet`.
- Child tables (qualifications, documents, reviews, messages…) follow their parent; they also get
  the column so row-level security does not need joins.
- Migration steps for each table: add column → backfill with the first college → set `NOT NULL`
  → add index `(institutionId, …)` → enable row-level security.
- Unique keys become per college: `User.email` → `(institutionId, email)`,
  `Vacancy.code` → `(institutionId, code)`, setting keys → `(institutionId, key)`.

### 6.3 Enforcement (three layers)

1. **Application:** a Prisma client extension adds `institutionId` to every query and create.
   Code cannot reach the database without a college context (the owner console uses a separate,
   explicit "platform" client).
2. **Database:** PostgreSQL row-level security on every table:
   `USING (institution_id = current_setting('app.institution_id')::uuid)`.
   The app connects as a role that cannot bypass these rules.
3. **Tests:** an isolation test suite creates two colleges and tries every route and service
   with the wrong college — it must always get "not found". Runs in CI on every pull request.

### 6.4 Everything else that must be separated

| Item | How |
| --- | --- |
| Files | R2 key `inst/<institutionId>/uploads/…`; download checks the college |
| Redis | Keys prefixed `inst:<id>:` (rate limits, caches, budgets) |
| Queue jobs | Every job carries `institutionId`; the worker sets the context before running |
| Sessions | Cookie bound to the host; session row stores `institutionId`; mismatch = signed out |
| E-mail | Sender name "<College> Recruitment via Selection Desk"; reply-to = college help desk |
| Reference numbers | Prefix from college code (`KCT/2026/…`), counters per college |
| Audit log | Per college; plus a platform audit log for owner actions |
| Exports | Per-college full export (database rows as CSV/JSON + files) |

### 6.5 Branding and configuration per college

- Name, short name, logo, favicon, primary / accent colours, address, footer, website link.
- Application form template, required documents, eligibility rules, departments, HODs.
- E-mail templates (with platform defaults), privacy notice text and version.
- Recruitment year rules (default June–May).
- Served through `/theme.css` (CSS variables) so the strict CSP stays intact.

### 6.6 Owner console (`app.selectiondesk.in`)

- Create college (code, name, plan) → subdomain live instantly → invite its first Admin.
- Add custom domain → shows the CNAME to set → status updates automatically.
- Suspend / reactivate, change plan and limits, view usage (applications, storage, e-mails, users).
- "Support access" into a college, time-limited and recorded in both audit logs.
- Platform health: queue sizes, failed jobs, e-mail failures, backup status.

---

## 7. Domains, SSL and Cloudflare

| Item | Setup |
| --- | --- |
| DNS | `selectiondesk.in` on Cloudflare (free plan to start) |
| Records | `@`, `app`, `docs`, `status`, `*` → VPS (proxied, orange cloud) |
| SSL to visitors | Cloudflare Universal SSL covers `selectiondesk.in` and `*.selectiondesk.in` |
| SSL to VPS | Cloudflare Origin Certificate (15 years) in nginx; mode "Full (strict)" |
| Custom domains | **Cloudflare for SaaS**: college sets `careers.kct.ac.in CNAME customers.selectiondesk.in`; we register the hostname through the Cloudflare API; certificate issued automatically. First 100 hostnames free, then about US$0.10 each per month |
| Firewall | VPS accepts ports 80/443 only from Cloudflare IP ranges; SSH by key only |
| Protection | WAF managed rules, rate limiting on `/login` and `/register`, bot fight mode |
| Static files | Cached at Cloudflare (`/assets/*` are fingerprinted) |
| E-mail DNS | SPF, DKIM and DMARC for the sending domain (e.g. `mail.selectiondesk.in`) |

Custom domain flow in the product:

1. College Admin (or we) enters `careers.kct.ac.in` in settings.
2. The app calls the Cloudflare API and shows the CNAME record to add.
3. A background job checks every few minutes; when it is active, the domain becomes primary and
   the old subdomain redirects to it.

---

## 8. Infrastructure on our VPS

### 8.1 Server preparation

- Ubuntu 24.04 LTS, non-root deploy user, SSH keys only, root login off.
- `ufw`: 22 from our IPs, 80/443 from Cloudflare only. `fail2ban`, unattended security upgrades.
- Docker Engine + Compose plugin; log rotation for containers.
- Time zone UTC on the server; the app shows IST.

### 8.2 Services

The existing `compose.production.yaml` already runs nginx, blue-green app, worker, PostgreSQL,
Redis, ClamAV, converter and a migration job. Changes:

- Add R2 settings (`S3_ENDPOINT`, `S3_BUCKET`, keys) and switch storage to the S3 driver.
- Add a `backup` service (nightly `pg_dump`, encrypted, uploaded to R2; keep 14 daily + 8 weekly).
- Add an uptime/metrics exporter and error tracking (self-hosted or a hosted free tier).
- Remove `db-viewer` from production (or bind it to localhost only).

### 8.3 Deployment

- GitHub Actions builds the Docker image on every push to `main` / `qa`, tags it with the version,
  and pushes it to GitHub Container Registry.
- The VPS pulls the image, runs migrations, starts the idle colour (blue/green), checks health,
  then switches nginx. Rollback = switch back.
- Releases are tagged `v1.0.0`, `v1.1.0` … with release notes.

### 8.4 Backups and recovery

| What | How often | Where | Kept |
| --- | --- | --- | --- |
| Database | Nightly + before each migration | R2 (encrypted) | 14 daily, 8 weekly, 12 monthly |
| Files | Already in R2 (versioning on) | R2 | 30 days of old versions |
| Config / secrets | On change | Password manager / encrypted file | — |

- Test restore every month into a scratch environment. Targets: lose at most 24 hours of data
  (later 15 minutes with WAL archiving), back online within 4 hours.

---

## 9. Security and compliance

- **DPDP Act 2023:** we are the data processor; each college is the data fiduciary. Data
  processing agreement with every college; data stored in India (VPS in India; R2 location hint
  APAC / Indian jurisdiction where possible); deletion and export on request.
- **Access:** staff two-step sign-in already by e-mail code; add optional authenticator app (TOTP)
  for Admin and Principal; SSO (Google Workspace / Microsoft 365) on Enterprise plans.
- **Secrets:** never in the repository; `.env` on the server with restricted permissions; rotated
  on staff changes.
- **Dependencies:** Dependabot / `npm audit` in CI; monthly update window.
- **Testing:** isolation tests (section 6.3), OWASP checks, yearly external penetration test once
  revenue allows (often asked by large universities).
- **Audit:** every owner action in the platform audit log; colleges can download their own log.
- **Uptime commitment:** 99.5% for Campus plans, 99.9% for Enterprise (after the second server).

---

## 10. Scaling path

| Stage | Colleges | Setup |
| --- | --- | --- |
| 1. Launch | 1–20 | One VPS (8 vCPU / 16–32 GB), everything in Docker, R2 for files and backups |
| 2. Growth | 20–60 | Move PostgreSQL to a managed service (or a second VPS with a replica); 2 app servers behind Cloudflare load balancing; Redis on its own server |
| 3. Scale | 60–300 | Separate worker servers (PDF / e-mail / scanning); read replica for reports; connection pooler (PgBouncer); queue per job type |
| 4. Large / government | 300+ | Kubernetes or a managed container platform; dedicated databases for very large universities; data residency options |

**Recruitment season peaks** (application deadlines) are the main load. The hard parts are PDF
generation and virus scanning, which run in the worker — add worker replicas for the season.

Design rules that keep these moves easy:

- The app keeps no state on disk (files in R2, sessions in the database / Redis).
- Every job and query carries the college id.
- Configuration only through environment variables.
- Large colleges can be moved to a dedicated database without code changes (connection chosen
  per college).

---

## 11. Repositories, branches and releases

| Repository | Visibility | Purpose |
| --- | --- | --- |
| `brittytino/selectiondesk` | Private | **The product.** All new work happens here |
| `brittytino/PSG-SRPortal` | PSG's repository | PSG's live system; security and bug fixes only |

- Branches: `dev` (daily work) → `qa` (testing) → `main` (production). Pull requests go to `dev`.
  Hotfixes branch from `main` and are merged back into `qa` and `dev`.
- Protect `main` and `qa`: pull request + passing CI required, no force pushes.
- Fixes for PSG: the remote `psg` is configured in the product clone; cherry-pick the fix commit
  onto a branch from `psg/main` and open a pull request there. Product features are never sent to PSG.
- Later: move to a company GitHub organisation (e.g. `selectiondesk`) when there is a team.

---

## 12. Roadmap by phase

### Phase 0 — Foundation (week 1)
- [x] Domain `selectiondesk.in`, product name, private repository with full history
- [x] IP assignment from contributors
- [ ] Cloudflare: add domain, nameservers, origin certificate, wildcard DNS
- [ ] VPS hardening and Docker (section 8.1)
- [ ] Branch protection, CI on `dev`/`qa`/`main`, container registry
- [ ] Rename package, README, LICENSE header and docs to Selection Desk

### Phase 1 — Remove PSG from the code (weeks 1–2)
- [ ] Replace all hard-coded "PSG" text (≈156 places / 63 files) with college settings
- [ ] Logo, colours, address, reference prefix, e-mail texts, privacy text from settings
- [ ] Storage driver: local disk **and** S3-compatible (R2), chosen by configuration
- [ ] Selection Desk marketing site at `selectiondesk.in`

### Phase 2 — Multi-college core (weeks 2–5)
- [ ] `Institution` and `InstitutionDomain` tables; `institutionId` on all tables (additive)
- [ ] Host-based college lookup middleware; suspended / unknown host pages
- [ ] Prisma extension + PostgreSQL row-level security
- [ ] Per-college settings, Redis keys, queue jobs, files, sessions, counters
- [ ] Isolation test suite in CI
- [ ] Single-college mode flag (`TENANCY=single|multi`) for on-campus installs

### Phase 3 — Owner console, domains, onboarding (weeks 5–7)
- [ ] Owner console at `app.selectiondesk.in`
- [ ] Create college → subdomain live → first Admin invited
- [ ] Custom domains through Cloudflare for SaaS
- [ ] Per-college branding editor, form template, departments import (CSV)
- [ ] Plan limits and usage counters; per-college data export

### Phase 4 — Launch readiness (week 8)
- [ ] `demo.selectiondesk.in` with labelled sample data, reset nightly
- [ ] `docs.selectiondesk.in` (guides per role) and `status.selectiondesk.in`
- [ ] Error tracking, uptime alerts, backup verification
- [ ] Load test for a deadline-day peak (e.g. 20 colleges × 300 submissions/hour)
- [ ] Legal: subscription agreement, DPA, privacy policy, terms, SLA
- [ ] Version `v1.0.0`

### Phase 5 — First colleges (weeks 8–12)
- [ ] Pilot with 1–3 Coimbatore colleges
- [ ] Weekly feedback, fixes, case study from PSG and the pilots

---

## 13. Product features after launch

In the order colleges are likely to ask for them:

1. **Eligibility screening** against AICTE / UGC norms (qualification, NET/SET/PhD, experience),
   with automatic short-listing and reasons.
2. **Interview scheduling** — slots, panels, calendar invites, e-mail and WhatsApp reminders.
3. **Panel scoring** — score sheets per panel member, combined ranking.
4. **Offer and appointment letters** generated from templates, with e-sign later.
5. **Job board publishing** — shareable vacancy pages, Google for Jobs markup, LinkedIn sharing.
6. **SSO** (Google Workspace, Microsoft 365) and optional TOTP for staff.
7. **Analytics** — time to hire, applications per post, sources, diversity summaries.
8. **Integrations / API** at `api.selectiondesk.in` — HRMS / ERP export, webhooks.
9. **Billing** — Razorpay subscriptions, GST invoices.
10. **Regional languages** for candidate pages (Tamil first).

---

## 14. Plans and pricing (₹)

Prices per college per year, excluding GST (18%).

| Plan | Price / year | For | Includes |
| --- | --- | --- | --- |
| Campus | ₹2,50,000 | Single college, up to ~1,000 applications/year | Subdomain, branding, all core features, e-mail support |
| Campus Pro | ₹4,50,000 | Large colleges | Custom domain, higher limits, eligibility screening, interview scheduling, priority support |
| Enterprise | ₹8,00,000 – ₹12,00,000 | Universities / groups | Multiple campuses, SSO, API, dedicated database option, 99.9% SLA, account manager |
| Enterprise On-Campus | ₹10,00,000 – ₹15,00,000 | Must stay on own servers | Single-college install on their servers, updates, support |
| One-time setup | ₹1,00,000 – ₹2,00,000 | All plans | Form set-up, data import, training |

**Pilot offer:** one recruitment cycle for the setup fee, converting to the annual plan.

---

## 15. Running costs (₹)

| Item | Start (0–5 colleges) | ~20 colleges | ~100 colleges |
| --- | --- | --- | --- |
| VPS (existing) | already paid | upgrade / second VPS ≈ ₹6,000–12,000/mo | ≈ ₹40,000/mo (several servers) |
| Managed PostgreSQL | — (on VPS) | ≈ ₹5,000/mo | ≈ ₹20,000/mo |
| Cloudflare | Free | Pro ≈ ₹2,000/mo | Business / SaaS hostnames ≈ ₹10,000/mo |
| R2 storage | Free up to 10 GB | ≈ ₹1,000/mo | ≈ ₹5,000/mo |
| E-mail sending | SMTP / free tier | ≈ ₹1,500/mo | ≈ ₹6,000/mo |
| Monitoring, domain, misc. | ≈ ₹500/mo | ≈ ₹1,500/mo | ≈ ₹5,000/mo |
| **Total** | **≈ ₹500/mo** | **≈ ₹17,000–26,000/mo** | **≈ ₹86,000/mo** |

At 20 colleges on Campus (₹50 lakh/year revenue) running costs are about ₹3 lakh/year.

---

## 16. Go-to-market

1. **Coimbatore first** (about 110–140 engineering colleges): PSG as the live reference, contacts
   through Sir's network and PSG group institutions; demo at each college's HR / Principal office.
2. **Tamil Nadu** (about 2,800 colleges): engineering, arts & science, then universities.
3. **South India**, then **India** (AISHE: 1,168 universities): partners and education events.

**Why colleges switch:** most use Google Forms, résumé-only forms or old in-house portals.
Selection Desk gives a complete form built for faculty hiring, document checks, HOD and Principal
reviews with ratings, reports and an audit trail — live in a day, no servers needed.

**Competitors to watch:** Creatrix Campus (closest), MasterSoft ERP recruitment module, Zoho Recruit
(generic, priced per user), US tools (Interfolio, Hirezon) not tuned to Indian norms.

---

## 17. Risks

| Risk | Mitigation |
| --- | --- |
| Data leak between colleges | Three-layer isolation + CI tests + external test before large customers |
| Single VPS failure | Off-site backups, tested restores, documented rebuild; second server at ~20 colleges |
| Season peak overload | Worker replicas, queue limits, load test before each season |
| E-mail landing in spam | SPF / DKIM / DMARC, dedicated sending domain, sending budget |
| Long sales cycles in colleges | Pilot offer, PSG reference, start before the recruitment season |
| Code drift between PSG and product | Product is the source of truth; PSG receives fixes only; move PSG later |
| Legal questions | Lawyer review of licence, agreements and DPA before first contract |

---

## 18. Immediate checklist

**Owner (business)**
- [ ] Add `selectiondesk.in` to Cloudflare and change nameservers
- [ ] Share VPS details (OS, CPU, RAM, disk, location) and SSH access for the deploy user
- [ ] Create an R2 bucket and API token (files + backups)
- [ ] Decide the sending e-mail domain and SMTP provider
- [ ] Contact a lawyer for the subscription agreement and DPA

**Engineering (next 2 weeks)**
- [ ] Branch protection + CI + container image build
- [ ] Rename to Selection Desk across package, README and docs
- [ ] Phase 1: branding settings and R2 storage driver
- [ ] VPS setup with the production compose file and backups
- [ ] Start Phase 2 data model on `dev`
