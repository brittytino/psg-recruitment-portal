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
    ├── admin/            # Super Admin & Admin management routes (users, audit, vacancies)
    ├── auth/             # Passwordless authentication routes (login, verify OTP, register)
    ├── candidate/        # Candidate recruitment portal, multi-step application wizard, receipt, PDFs
    └── staff/            # HR & HOD screening, multi-criteria review queues, approved summary sheets
```

---

## 4. Host Ports & Docker Network Configuration

The application and supporting containers run on documented non-default external ports to prevent conflicts on development and shared hosting machines:

| Service | Host Port | Container Port | Protocol / Path | Purpose |
| :--- | :---: | :---: | :--- | :--- |
| **Web Portal (App)** | **`6969`** | `3000` | HTTP / `http://localhost:6969` | Main Candidate & Staff Web Application |
| **PostgreSQL Database** | **`6543`** | `5432` | TCP (Loopback `127.0.0.1`) | PostgreSQL 17 host access for tools/tests |
| **Mailpit Web UI** | **`8025`** | `8025` | HTTP / `http://localhost:8025` | Local transactional email & OTP inbox |
| **Mailpit SMTP Server** | **`2525`** | `1025` | SMTP (Loopback `127.0.0.1`) | SMTP transport for sending test emails |
| **Database Viewer (Adminer)**| **`6981`** | `8080` | HTTP / `http://localhost:6981` | Web database management interface |
| **Redis Cache / Queue** | `63879` | `6379` | TCP (Loopback `127.0.0.1`) | Redis BullMQ queue (devhost network) |
| **LibreOffice Converter** | `63100` | `3100` | HTTP (Loopback `127.0.0.1`) | Internal document conversion service |
| **ClamAV Antivirus** | `63310` | `3310` | TCP (Loopback `127.0.0.1`) | Antivirus daemon service |

---

## 5. Approved Institutional Privileged Accounts

The production database bootstraps with **only** the approved institutional accounts. There are **zero** dummy candidates, fake vacancies, or sample recruitment applications created:

| Identity / Name | Official Email | System Role | Operational Scope & Permissions |
| :--- | :--- | :--- | :--- |
| **Tino** | `brittytino08@gmail.com` | `SUPER_ADMIN` | **Super Admin**: Highest system privileges, user & role management, system settings, department management, full audit log access, security configuration, and full recruitment oversight. |
| **Dr. S. Saravanan** | `dean.admn@psgtech.ac.in` | `ADMIN` | **Dean**: Recruitment administration, institution-wide application monitoring, bulk HOD assignment, summary review, and position-change oversight. *(No unrestricted system log or user administration)* |
| **Dr. G. Thilagavathi** | `principal@psgtech.ac.in` | `ADMIN` | **Principal**: Recruitment administration, institution-wide application monitoring, bulk HOD assignment, summary review, and position-change oversight. *(No unrestricted system log or user administration)* |
| **HR / N4 Section** | `admin.n4@psgtech.ac.in` | `HR` | **HR / N4 Section**: Vacancy and job profile creation/publishing, applicant qualification screening, complete PDF bundle downloads, approved summary review, and selective CSV export. |
| **CSE HOD** | `hod.cse@psgtech.ac.in` | `HOD` | **CSE Department HOD**: Department-scoped applicant reviews, recommendation recording (Accept, Reject with reason, Recommend Assoc to Asst Prof change), and department summary sheet generation and approval. |

*Initial Department Configured*: `CSE` (Computer Science and Engineering, Code: `CSE`). All additional departments and HOD assignments are managed dynamically through the Super Admin interface.

---

## 6. Strict 100% Passwordless Authentication

- **No Passwords or Magic Links**: All users (Candidates, Staff, HODs, Dean, Principal, Super Admin) authenticate strictly via temporary 6-digit email OTPs.
- **Cryptographic Security**: Six-digit OTPs are generated using Node.js `crypto.randomInt`, salted and hashed with SHA-256 before database storage, valid for 10 minutes, and limited to 5 attempts before automatic challenge invalidation.
- **Brute-Force & Replay Defence**: Rate limited per IP and email. An OTP is instantly invalidated upon successful consumption.
- **Secure Server Sessions**: Server-managed HTTP-only, SameSite cookies with session rotation upon login.

---

## 7. Application Workflow & Official Form Features

### Permanent Application Reference Number
- **Format**: `PSGCT2026-27<DEPT>_<NNNN>` (e.g., `PSGCT2026-27CSE_0001`).
- **Transactional Allocation**: Reference numbers are allocated transactionally at the exact moment of formal candidate submission using a department-scoped database counter, guaranteeing strict sequential numbering without duplicates or race conditions.
- **Permanence**: Once assigned, the reference number is permanently tied to the application revision and appears on the receipt, generated PDF, review queues, summary sheets, CSV exports, and email notifications.

### Section-by-Section Application Wizard
The candidate application wizard organizes the official requirements into structured, accessible steps:
1. **Vacancy and Post**: Displays the selected department, post, and recruitment cycle.
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

1. **Bulk Assignment**: The Principal, Dean, or Super Admin selects submitted applications across departments and assigns them in bulk to authorized departmental HODs.
2. **Department-Scoped Review**: HODs log in and see only applications belonging to their assigned department.
3. **Auditable Recommendation Outcomes**:
   - **Accept**: Application accepted as applied.
   - **Reject**: Requires a mandatory, recorded rejection reason.
   - **Recommend Cadre Change**: If a candidate applied for Associate Professor, the HOD can recommend reclassification to Assistant Professor. This recommendation is stored as a pending action requiring explicit authorization by HR/Admin.
4. **Versioned Summary Sheet**:
   - Once all department applications are decided, the HOD generates a department-wise summary sheet.
   - The HOD explicitly reviews and clicks **Approve Summary Sheet**.
   - **Access Control**: Unapproved summaries remain draft snapshots. Only after HOD approval does the summary sheet become visible to HR / N4 Section, the Dean, Principal, and Super Admin.

---

## 9. HR / N4 Section CSV Export Workflow

The portal provides an auditable, Excel-compatible CSV export engine:
- **Application Selection**: Checkboxes on each row allow selecting specific applications, with convenient **Select all on page** and **Clear selection** controls, or exporting all matching records.
- **Column Customization**: Granular column picker with grouping and presets ("Summary columns only", "Select all").
- **Live Preview**: An interactive **Export Preview** table displays the first records and chosen columns before initiating the file download.
- **Formula Injection Protection**: Automatically prepends single quotes (`'`) to values starting with `=`, `+`, `-`, `@`, `\t`, or `\r` to safeguard spreadsheet users against CSV formula injection attacks.
- **UTF-8 with BOM**: Prepends `\uFEFF` ensuring Excel on Windows and macOS opens UTF-8 text with correct character encoding.

---

## 10. Team Work Allocation: Tino vs Hari

| Ownership Dimension | Tino (Technical Lead & Super Admin) | Hari (Senior Full-Stack Engineer) |
| :--- | :--- | :--- |
| **Core Workstream** | **Workstream A: Foundation, Security & Integration** | **Workstream B: Recruitment Experience & Workflows** |
| **Primary Modules** | - Authentication & Session Architecture (Passwordless OTP)<br>- RBAC & Scopes (`SUPER_ADMIN`, `ADMIN`, `HR`, `HOD`)<br>- Database Schema, Relations & Prisma Migrations<br>- Account Provisioning & Security Auditing<br>- Department & Vacancy Administrative Interfaces<br>- Bulk HOD Assignment Workflow & Authorization Guards<br>- Docker Multi-Stage Builds, Volumes & Host Ports<br>- Blue-Green Deployment & VPS Production Automation<br>- CI/CD Pipeline & End-to-End System Integration | - Candidate Recruitment Portal & Public Vacancies<br>- Section-based Application Wizard (Steps 1–12)<br>- Academic Qualification & Arrear Form Controls<br>- Work Experience, Overlap Detection & Calculation<br>- Research Metrics, Publications & Patents UI<br>- Document Upload Experience & Validation<br>- Application Review Screen & Watermarked PDF Preview<br>- Candidate Receipt & Consolidated Bundle Downloads<br>- HR & HOD Dashboards & Filter Composability<br>- Department Summary Sheet Approval UI<br>- CSV Export Selection, Live Counts & Preview Table |
| **Shared Responsibilities** | - Shared TypeScript API contracts and route loaders/actions<br>- Official form field mapping and PDF verification<br>- Automated unit, integration, and security test coverage<br>- WCAG 2.2 AA accessibility verification<br>- Code reviews (mandatory cross-developer pull request review) | - Shared TypeScript API contracts and route loaders/actions<br>- Official form field mapping and PDF verification<br>- Automated unit, integration, and security test coverage<br>- WCAG 2.2 AA accessibility verification<br>- Code reviews (mandatory cross-developer pull request review) |

---

## 11. Developer & Production Runbook

### Prerequisites
- Node.js ≥ 22.x LTS
- Docker Desktop or Docker Engine ≥ 24.x with Docker Compose v2

### Quick Start with Docker
```bat
REM Windows One-Click Runner:
.\run.bat
```
Or via Docker Compose commands:
```sh
# Copy environment configuration
cp .env.example .env

# Build and start the complete local stack
docker compose -f compose.yaml -f compose.dev.yaml up -d --build

# Run database migrations and bootstrap initial institutional accounts
docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate
```

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
- **Unit & Security Tests**: `npm test` passes all 84 unit tests across 7 test suites covering passwordless OTP expiry, reference number formatting, role permission boundaries (`SUPER_ADMIN` vs `ADMIN`), CSV formula injection protection, arrear calculations, qualification document rules, and structured input master options with department-scoped filtering.
- **Production Build**: `npm run build` compiles client bundles, SSR server builds, and background worker bundles without errors.
