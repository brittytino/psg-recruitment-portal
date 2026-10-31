# PSG College of Technology — Staff Recruitment Portal

Institutional recruitment management system for **PSG College of Technology**, serving candidates, the Principal, the Dean, the HR / N4 Section, and department Heads of Department (HODs). Built with React Router v7 Framework Mode (Remix architecture), TypeScript, PostgreSQL 17 with Prisma ORM, Tailwind CSS, BullMQ background processing, and Docker containerisation with blue-green deployment readiness.

> **Zero Python Policy**: TypeScript and Node.js are used exclusively across the entire application stack, background workers, PDF rendering pipeline, operational tooling, and automation scripts.

---

## 1. System Architecture

```text
                                  ┌──────────────────────────┐
                                  │      Reverse Proxy       │
                                  │   (Nginx / Caddy 80/443) │
                                  └────────────┬─────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
  ┌─────────────────────────┐                                     ┌─────────────────────────┐
  │  Active Slot: app-blue   │                                     │ Inactive: app-green     │
  │  (React Router v7 Node) │                                     │ (Health check / verify) │
  └────────────┬────────────┘                                     └─────────────────────────┘
               │
    ┌──────────┴───────────────────────────────────────────────────────┐
    │                                                                  │
    ▼ (Internal Network)                                               ▼ (Internal Network)
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│    PostgreSQL 17     │    │       Redis 7        │    │ Background Worker    │
│ (srportal / srp_app) │    │  (BullMQ queue/AOF)  │    │ (PDF/ClamAV/Mail)    │
└──────────────────────┘    └──────────────────────┘    └──────────┬───────────┘
                                                                   │
                                                ┌──────────────────┴──────────────────┐
                                                ▼                                     ▼
                                     ┌──────────────────────┐              ┌──────────────────────┐
                                     │  ClamAV Daemon 1.4   │              │ Headless Converter   │
                                     │   (Malware Scan)     │              │    (LibreOffice)     │
                                     └──────────────────────┘              └──────────────────────┘
```

The system is architected as a modular monolith:

- **Web Application**: React Router v7 framework mode providing server-side rendering (SSR), typed loaders and actions, session middleware, CSRF nonce protection, and accessible UI components.
- **Data Tier**: PostgreSQL 17 with normalized entities, transactional reference number allocation, immutable submission revisions, and versioned Prisma migrations.
- **Worker & Outbox**: Redis 7 with BullMQ and an outbox relay table ensuring reliable, idempotent background tasks for PDF rendering, attachment merging, and transactional OTP email delivery.
- **Document Subsystem**: Private persistent volume storage (`/var/lib/srportal/storage`) with checksum verification, ClamAV antivirus scanning, PDF rendering using `pdf-lib`, and attachment consolidation.

---

## 2. Technology Stack

- **Framework**: React Router v7.18 (Framework Mode / Remix SSR model)
- **Language**: TypeScript 5.8 (Strict mode throughout)
- **Styling**: Tailwind CSS v4 with accessible form primitives
- **Database**: PostgreSQL 17.6 + Prisma ORM 6.19.3 (strict versioned migrations; no `db push`)
- **Queue & Cache**: Redis 7.4 + BullMQ 5.81
- **Authentication**: 100% Passwordless Email OTP (cryptographic 6-digit codes, Argon2id hash storage, constant-time verification)
- **PDF Generation**: `pdf-lib` v1.17 for official 2026-27 application PDF rendering and attachment merging
- **Document Security**: ClamAV 1.4 antivirus daemon + file-type magic byte verification
- **CSV Engine**: RFC 4180 compliant CSV serializer with automated spreadsheet formula-injection neutralization (`=`, `+`, `-`, `@`, `\t`, `\r`)
- **Containerisation**: Docker multi-stage builds, non-root runtime user, Docker Compose with non-default host ports

---

## 3. Domain-Oriented Architecture & Directory Structure

The repository is organized cleanly around the recruitment domain rather than arbitrary technical groupings:

```text
app/
├── components/           # Accessible, reusable UI components (forms, dialogs, badges, shells)
│   ├── auth-shell.tsx    # Branded authentication layout shell
│   ├── forms.tsx         # Standardized input fields, select controls, date pickers, alert banners
│   ├── vacancy-card.tsx  # Institutional vacancy cards with department badges
│   └── workflow.tsx      # Multi-step progress indicators
├── lib/                  # Shared web utilities (HTTP helpers, CSRF nonces, security headers)
├── modules/              # Domain-bounded business logic and database access
│   ├── applications/     # Candidate applications, draft saving, submission, reference numbering
│   ├── auth/             # Passwordless 6-digit email OTP auth, Argon2id, session rotation, RBAC
│   ├── core/             # Centralized Prisma client, pino structured logger with redaction, errors, audit
│   ├── documents/        # File storage, ClamAV antivirus scanning, PDF rendering, consolidated bundle
│   ├── forms/            # Centralized master options source of truth & official faculty form definitions
│   │   ├── definitions/  # Official v2 form definitions with structured selectors and other fields
│   │   └── options.ts    # Centralized degrees, boards, modes, classes, disciplines, designations
│   ├── recruitment/      # Vacancy management, job profiles, departments, quota tracking
│   ├── reporting/        # CSV export engine, RFC 4180 escaping, formula injection neutralization
│   ├── reviews/          # HOD reviews, cadre change recommendations, department summary sheets
│   └── users/            # User account provisioning, staff creation, department mapping, audit
└── routes/               # Framework route modules focused on loaders, actions, and page rendering
    ├── admin/            # Admin management routes (users, audit, vacancies)
    ├── auth/             # Passwordless authentication routes (login, verify OTP, register)
    ├── candidate/        # Candidate recruitment portal, multi-step application wizard, receipt, PDFs
    └── staff/            # HR & HOD screening, multi-criteria review queues, approved summary sheets
```

---

## 4. Host Ports & Docker Network Configuration

The application and supporting containers run on documented non-default external ports to prevent conflicts on development and shared hosting machines:

| Service                     | Host Port  | Container Port | Protocol / Path                | Purpose                                     |
| :-------------------------- | :--------: | :------------: | :----------------------------- | :------------------------------------------ |
| **Web Portal (App)**        | **`6969`** |     `3000`     | HTTP / `http://localhost:6969` | Main Candidate & Staff Web Application      |
| **PostgreSQL Database**     | **`6543`** |     `5432`     | TCP (Loopback `127.0.0.1`)     | PostgreSQL 17 host access for tools/tests   |
| **Mailpit Web UI**          | **`8025`** |     `8025`     | HTTP / `http://localhost:8025` | Local transactional email & OTP inbox       |
| **Mailpit SMTP Server**     | **`2525`** |     `1025`     | SMTP (Loopback `127.0.0.1`)    | SMTP transport for sending test emails      |
| **Database Viewer (pgweb)** | **`6981`** |     `8081`     | HTTP / `http://localhost:6981` | Modern web database explorer & query editor |
| **Redis Cache / Queue**     |  `63879`   |     `6379`     | TCP (Loopback `127.0.0.1`)     | Redis BullMQ queue (devhost network)        |
| **LibreOffice Converter**   |  `63100`   |     `3100`     | HTTP (Loopback `127.0.0.1`)    | Internal document conversion service        |
| **ClamAV Antivirus**        |  `63310`   |     `3310`     | TCP (Loopback `127.0.0.1`)     | Antivirus daemon service                    |

---

## 5. Roles and the first account

No real account or e-mail address is stored in this repository. A new installation creates only the
**first owner account**, from `BOOTSTRAP_OWNER_EMAIL` in the server-only file
`secrets/override.env`; everyone else is added in the application (**Users & roles**). There are no
demo candidates, vacancies or applications.

| Role | Who | Can do |
| :--- | :--- | :--- |
| `MANAGER` — **Admin** | Recruitment and support lead | Everything HR and Dean / Principal can do, the help desk (including settings), and adding HR, HOD and Viewer accounts. No system settings, logs or audit log. |
| `ADMIN` — **Dean / Principal** | Recruitment oversight | All applications, HOD assignment, position-change approval, summaries. |
| `HR` — **HR – N4 Section** | Recruitment office | Job profiles, screening, departments and HOD invitations, exports, help desk, viewers. |
| `HOD` | Head of a department | Reviews the applications assigned to them; approves the department summary sheet. |
| `VIEWER` | Read-only | Lists and opens applications and their documents; nothing else. |
| `CANDIDATE` | Applicants | Their own applications and help desk tickets. |

## 6. Strict 100% Passwordless Authentication & Email Infrastructure

The portal employs a zero-password, zero-magic-link authentication architecture. Every user—including Candidates, HODs, HR, Dean, Principal, and the owner account—must authenticate using a cryptographically generated 6-digit OTP delivered to their verified or official email address.

### Email Infrastructure Architecture

- **Dual-Provider Architecture**:
  - **Local Development & Automated Tests**: Uses **Mailpit** (`axllent/mailpit:v1.27.10`) on SMTP port `1025` (published on host at `2525`) and Web UI on port `8025`. Emails sent locally are captured in the Mailpit inbox without hitting real external mailboxes. The test adapter (`EMAIL_PROVIDER=test`) is used for isolated unit and integration test mock transport.
  - **Production Delivery**: Uses real institutional SMTP (`EMAIL_PROVIDER=smtp`) with the official PSG Tech mailbox `recruitment@your-college.edu`. Requires valid institutional SMTP host, port (587 STARTTLS / 465 SSL), and dedicated mailbox application password stored exclusively in private server environment configuration.
- **Fail-Fast Production Validation**:
  - Startup strictly forbids `EMAIL_PROVIDER=mailpit` or `EMAIL_PROVIDER=test` when `NODE_ENV=production`.
  - Requires non-empty `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD` in production.
  - TLS certificate validation (`rejectUnauthorized: true`) is strictly enforced in production.
- **Dedicated Health Checks**:
  - `/healthz/live`: Process liveness check, completely independent of external SMTP connectivity.
  - `/healthz/ready`: Service readiness check (verifying database, Redis, and storage volume).
  - `/healthz/smtp`: Dedicated SMTP transport connectivity diagnostic (`verifySmtpConnection`). Never exposes passwords, internal IP addresses, or secrets.

### 6-Digit OTP Lifecycle & Security Controls

- **Cryptographic CSPRNG**: Generated using Node.js `node:crypto.randomInt(0, 1_000_000)` with `.padStart(6, '0')` ensuring leading zeros are preserved.
- **HMAC Token Storage**: Raw OTP values are never stored in plaintext. Stored in `OtpChallenge.codeHash` as an HMAC-SHA256 keyed to `SESSION_SECRET` and bound to the challenge ID (`otp:<challengeId>:<code>`).
- **5-Minute Expiry**: Challenges expire after `OTP_EXPIRY_MINUTES` (5 minutes by default).
- **Single-Use Atomic Consumption**: Challenges are consumed atomically with `consumedAt = now()`. Simultaneous verification requests cannot both succeed.
- **Max Attempt Invalidation**: Limited to `OTP_MAX_ATTEMPTS` (5 attempts). If attempts are exhausted, the challenge is immediately invalidated.
- **Abuse & Rate Limiting**:
  - Resend cooldown: Enforced via Redis TTL (`OTP_RESEND_COOLDOWN_SECONDS`, 60 seconds).
  - Hourly limits: `OTP_MAX_SENDS_PER_HOUR` (5 sends per hour per user).
  - IP rate limiting: 20 sends per hour per IP.
- **Delivery Failure Cleanup**: If SMTP transport throws an error, the pending challenge is immediately marked consumed and the Redis cooldown key is deleted so the user is not stranded with an undelivered challenge.
- **Safe Logging**: Email OTP codes and SMTP passwords are never logged to production logs. Password strings are automatically masked (`password: ***`) in diagnostic log entries.

---

## 7. Application Workflow & Official Form Features

### Permanent Application Reference Number

- **Format**: `PSGCT2026-27<DEPT>_<NNNN>` (e.g., `PSGCT2026-27CSE_0001`).
- **Transactional Allocation**: Reference numbers are allocated transactionally at the exact moment of formal candidate submission using a department-scoped database counter, guaranteeing strict sequential numbering without duplicates or race conditions.
- **Permanence**: Once assigned, the reference number is permanently tied to the application revision and appears on the receipt, generated PDF, review queues, summary sheets, CSV exports, and email notifications.

### Section-by-Section Application Wizard

The candidate application wizard organizes the official requirements into structured, accessible steps:

1. **Vacancy and Post**: Displays the selected department and post.
2. **Personal Information**: Full name (block letters), title, DOB, calculated age, gender, nationality, religion (with custom option), community category, caste, marital status, spouse details (conditional), present address, permanent address, contact details.
3. **Academic Qualifications**:
   - **School Education**: Separate SSLC and HSC subsections capturing school name, completion year, marks, maximum marks, calculated percentage, class, and attempts/arrears.
   - **College Education**: UG, PG, and Others/Diploma qualifications capturing degree (searchable dropdown), college, university, completion year, CGPA or marks, percentage, class, mode of education (Full-time, Part-time, Distance), and attempt/arrear counts.
   - **Arrear Aggregates**: Separate UG paper/attempt arrears and PG paper/attempt arrears.
4. **Academic Achievements & Ph.D.**:
   - Post-PG experience, industry experience, special recognitions (Gold Medal, University Rank), and certification courses (NPTEL, Coursera).
   - Ph.D. status (Awarded, Thesis submitted, Pursuing), degree discipline, awarding university, guideship number, registered/submitted/completed scholar counts, and competitive examinations (GATE, NET) with scores/ranks.
5. **Work Experience**:
   - Repeatable employment records with employer name, address, designation, nature of employment, date range, currently employed flag, scale of pay, last-drawn salary, service certificate upload, appointment order upload, and pay slip upload.
   - Overlapping date detection and non-duplicative total experience calculation.
6. **Research Projects & Patents**: Repeatable sponsored research projects and intellectual property/patent filings.
7. **Publications & Research Metrics**:
   - Repeatable records for Journals, Conferences, Books, and Book Chapters with publication status, DOI, and proof attachments.
   - Research metrics: h-index, i10-index, citations, Scopus author URL, ORCID ID, Google Scholar profile.
8. **Professional Memberships & References**:
   - Professional body memberships with certificate uploads.
   - **Reference Enforcement**: Strictly enforces a **minimum of 1** and a **maximum of 2** professional references with contact and designation details.
9. **Salary & Joining Details**: Last-drawn pay, expected pay, scale of pay, joining time required, and vacancy source ("Known source" reveals an accessible explanation field).
10. **Relatives & Additional Information**: Close relatives employed in PSG institutions, additional candidate remarks, and mandatory resume upload.
11. **Document Management & Single Photo/Signature**:
    - **Zero Duplicate Controls**: Exactly **one** passport-size photograph upload and **one** signature upload control across the entire portal.
    - Contextual placement: Supporting proofs are attached directly to their respective sections (qualifications, experience, publications, Ph.D.).
12. **Review & Pre-Submission Verification**:
    - Human-readable summary of every section with direct "Change" navigation links.
    - High-fidelity **watermarked PDF preview** rendered in real time from draft answers before final submission.
    - Candidate declaration with timestamp and explicit submission confirmation.
13. **Receipt & Candidate Downloads**:
    - Post-submission receipt displaying reference number, submission timestamp, selected department, applied post, and status.
    - Candidates can download both their **Application PDF** and their **Consolidated PDF Bundle** (application PDF + all supporting attachments merged).

---

## 8. Department HOD Review & Summary Sheet Workflow

1. **Bulk Assignment**: The Principal or Dean selects submitted applications across departments and assigns them in bulk to authorized departmental HODs.
2. **Department-Scoped Review**: HODs log in and see only applications belonging to their assigned department.
3. **Auditable Recommendation Outcomes**:
   - **Accept**: Application accepted as applied.
   - **Reject**: Requires a mandatory, recorded rejection reason.
   - **Recommend Cadre Change**: If a candidate applied for Associate Professor, the HOD can recommend reclassification to Assistant Professor. This recommendation is stored as a pending action requiring explicit authorization by HR/Admin.
4. **Versioned Summary Sheet**:
   - Once all department applications are decided, the HOD generates a department-wise summary sheet.
   - The HOD explicitly reviews and clicks **Approve Summary Sheet**.
   - **Access Control**: Unapproved summaries remain draft snapshots. Only after HOD approval does the summary sheet become visible to HR / N4 Section, the Dean and Principal.

---

## 9. HR / N4 Section CSV Export Workflow

The portal provides an auditable, Excel-compatible CSV export engine:

- **Application Selection**: Checkboxes on each row allow selecting specific applications, with convenient **Select all on page** and **Clear selection** controls, or exporting all matching records.
- **Column Customization**: Granular column picker with grouping and presets ("Summary columns only", "Select all").
- **Live Preview**: An interactive **Export Preview** table displays the first records and chosen columns before initiating the file download.
- **Formula Injection Protection**: Automatically prepends single quotes (`'`) to values starting with `=`, `+`, `-`, `@`, `\t`, or `\r` to safeguard spreadsheet users against CSV formula injection attacks.
- **UTF-8 with BOM**: Prepends `\uFEFF` ensuring Excel on Windows and macOS opens UTF-8 text with correct character encoding.

---

## 9a. Help Desk and E-mail Quota

Candidates raise support tickets at `/help-desk`; HR – N4 Section and senior administrators answer them at `/staff/help-desk`. E-mail is kept within the daily mail quota with a budget, one-e-mail-per-event keys and in-app notifications (bell icon). See [docs/help-desk.md](docs/help-desk.md).

## 10. Team Work Allocation: Tino vs Hari

| Ownership Dimension         | Tino (Technical Lead)                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Hari (Senior Full-Stack Engineer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Workstream**         | **Workstream A: Foundation, Security & Integration**                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Workstream B: Recruitment Experience & Workflows**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Primary Modules**         | - Authentication & Session Architecture (Passwordless OTP)<br>- RBAC & Scopes (all staff roles)<br>- Database Schema, Relations & Prisma Migrations<br>- Account Provisioning & Security Auditing<br>- Department & Vacancy Administrative Interfaces<br>- Bulk HOD Assignment Workflow & Authorization Guards<br>- Docker Multi-Stage Builds, Volumes & Host Ports<br>- Blue-Green Deployment & VPS Production Automation<br>- CI/CD Pipeline & End-to-End System Integration | - Candidate Recruitment Portal & Public Vacancies<br>- Section-based Application Wizard (Steps 1–12)<br>- Academic Qualification & Arrear Form Controls<br>- Work Experience, Overlap Detection & Calculation<br>- Research Metrics, Publications & Patents UI<br>- Document Upload Experience & Validation<br>- Application Review Screen & Watermarked PDF Preview<br>- Candidate Receipt & Consolidated Bundle Downloads<br>- HR & HOD Dashboards & Filter Composability<br>- Department Summary Sheet Approval UI<br>- CSV Export Selection, Live Counts & Preview Table |
| **Shared Responsibilities** | - Shared TypeScript API contracts and route loaders/actions<br>- Official form field mapping and PDF verification<br>- Automated unit, integration, and security test coverage<br>- WCAG 2.2 AA accessibility verification<br>- Code reviews (mandatory cross-developer pull request review)                                                                                                                                                                                                       | - Shared TypeScript API contracts and route loaders/actions<br>- Official form field mapping and PDF verification<br>- Automated unit, integration, and security test coverage<br>- WCAG 2.2 AA accessibility verification<br>- Code reviews (mandatory cross-developer pull request review)                                                                                                                                                                                                                                                                                 |

---

## 11. Developer & Production Runbook

### Prerequisites

- Node.js ≥ 22.x LTS
- Docker Desktop or Docker Engine ≥ 24.x with Docker Compose v2

### Quick Start with Docker

One launcher per environment. Each run builds the images, applies database migrations, seeds the
staff accounts and waits until the portal is healthy.

|                                                                                | Linux / macOS server | Windows (Docker Desktop) |
| ------------------------------------------------------------------------------ | -------------------- | ------------------------ |
| Development (Mailpit shows e-mails and sign-in codes at http://localhost:8025) | `./dev.sh`           | `dev.bat`                |
| Production                                                                     | `./prod.sh`          | `prod.bat`               |

Other commands (same for every launcher): `stop`, `down`, `restart`, `logs [service]`, `status`,
`health`, `seed`, `migrate`, `rebuild`, `shell [service]`, `env`, `help`.

**Production server (college IT): clone and run**

```sh
git clone https://github.com/brittytino/psg-recruitment-portal.git && cd psg-recruitment-portal
./prod.sh            # generates all secrets, asks once for the Gmail app password, sets up HTTPS
```

Full server guide (DNS, HTTPS, DB viewer): `docs/deployment/production-server.md`. Put Nginx with TLS in front (`infrastructure/nginx/host/setup-nginx.sh`) and keep `APP_BIND=127.0.0.1` so the app port is
only reachable through the proxy. `.env` is generated on the server and never committed; `.env.production` (production settings, no
secrets) and `.env.development` are the committed templates.

### Local Development on Host Machine

```sh
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run type check and linter
npm run typecheck
npm run lint

# Run unit tests
npm test

# Start React Router development server on port 3000 (accessible on host at http://localhost:6969)
npm run dev
```

### Resetting Development Database

```sh
# Explicit developer reset command (destructive: requires deliberate execution)
docker compose -f compose.yaml -f compose.dev.yaml down -v
docker compose -f compose.yaml -f compose.dev.yaml up -d
docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate
```

---

## 12. Blue-Green Production Deployment & Rollback

The production configuration (`compose.production.yaml`) runs two independent deployment slots (`app-blue` and `app-green`) behind an Nginx reverse proxy:

```sh
# Deploy a new release SHA to the inactive slot
ENV_FILE=.env.production ./infrastructure/blue-green/deploy.sh <image-tag>

# The deployment script automatically:
# 1. Validates configuration and verifies non-destructive database migrations.
# 2. Boots the inactive container color against the shared database and storage volume.
# 3. Runs internal health and smoke tests on the new container.
# 4. Flips Nginx upstream traffic to the healthy new color with zero downtime.
# 5. Drains and shuts down the previous container color.

# Instant Rollback Command:
./infrastructure/blue-green/rollback.sh
```

---

## 13. Verification & Testing Evidence

All quality gates pass cleanly:

- **TypeScript Typecheck**: `npm run typecheck` passes with 0 errors across all routes and modules.
- **ESLint Code Quality**: `npm run lint` passes with 0 errors and 0 warnings.
- **Unit & Security Tests**: `npm test` passes all unit tests across test suites covering passwordless OTP expiry, reference number formatting, role permission boundaries, CSV formula injection protection, arrear calculations, qualification document rules, and structured input master options with department-scoped filtering.
- **Production Build**: `npm run build` compiles client bundles, SSR server builds, and background worker bundles without errors.

---

## 13a. Branches and release flow

The repository has three long-lived branches. **Production servers only ever pull `main`.**

| Branch | Purpose | Who merges into it |
| :--- | :--- | :--- |
| `dev` | Integration branch. Every feature and fix lands here first. | Maintainers, after review of a pull request |
| `qa` | Testing / staging. What QA checks before a release. | Maintainers, by merging `dev` when it is ready to test |
| `main` | Production. The college server runs `git pull origin main && sudo ./prod.sh up`. | Maintainers only, by merging `qa` after it passes testing |

```
feature/my-change ──PR──▶ dev ──merge──▶ qa ──(tested)──▶ main ──▶ production server
                                                  ▲
hotfix/urgent-fix ─────────────PR─────────────────┘   (then merged back into qa and dev)
```

**Contributors:**

1. Fork the repository (or create a branch if you have access) **from `dev`**:
   `git checkout dev && git pull && git checkout -b feature/short-description`.
2. Make the change with tests; run the checks in [CONTRIBUTING.md](./CONTRIBUTING.md).
3. Open the pull request **against `dev`** (never against `main` or `qa`).

**Maintainers:** merge `dev` into `qa` for a test round, and `qa` into `main` for a release. Urgent
production fixes go in a `hotfix/…` branch from `main`, are merged into `main`, and then merged back
into `qa` and `dev` so the branches never drift apart. Database migrations must stay additive on every
branch, because `main` runs against the live database.

---

## 14. Authors and licence

- **Tino Britty J** ([GitHub](https://github.com/brittytino) · [LinkedIn](https://www.linkedin.com/in/brittytino/)) — lead developer and architect
- **Hari Anand Balaji** ([LinkedIn](https://www.linkedin.com/in/hari-anand-balaji/)) — developer

Built for **PSG College of Technology**, Coimbatore. Released under the [MIT License](./LICENSE),
Copyright (c) 2026 Tino Britty J and contributors. See [CONTRIBUTORS.md](./CONTRIBUTORS.md) for maintainer guidelines.
