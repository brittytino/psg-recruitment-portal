# AI Agent Prompt — PSG College of Technology Staff Recruitment Portal (v2 scope)

> Paste everything below this line into the coding agent. It is self-contained.

---

## 0. Role and ground rules

You are a senior full-stack engineer extending an **existing, working** production application: the
PSG College of Technology (PSGCT) Staff Recruitment Portal in this repository. Your job is to implement
**every** item in this document inside the existing app. Do not start a new project, do not replace
the stack, and do not delete existing features or form fields — only add, restructure, or (where this
document explicitly says so) remove.

Before writing code:

1. Read `prisma/schema.prisma`, `prisma/seed.ts`, `app/routes.ts`, every folder under `app/modules/`
   (applications, auth, documents, forms, notifications, recruitment, reporting, reviews, users, audit),
   `app/components/application-form.tsx`, `app/components/forms.tsx`, `app/components/auth-shell.tsx`,
   `app/app.css`, `app/root.tsx`, and `docs/` (ADRs, architecture, requirements, security).
2. Produce a short written plan (files to change, migrations, new routes) and then implement it in
   small, reviewable commits, one per numbered section below.
3. Follow the existing conventions: naming, folder layout (`*.server.ts` for server-only code),
   comment density, zod validation, Prisma access through `app/modules/core/db.server.ts`, audit
   logging through `app/modules/audit/audit.server.ts`, email through the notification outbox.

### Existing stack (keep it)

- React Router v7 (framework mode, SSR) + React 19 + TypeScript 5.9, Tailwind CSS v4, lucide-react icons
- PostgreSQL via Prisma 6 (`prisma migrate dev` for every schema change — never edit old migrations)
- Redis + BullMQ worker (`worker/index.ts`) for background jobs (PDF generation, bundling, email)
- nodemailer for email, pdf-lib for PDFs, argon2 for passwords, zod 4 for validation, pino logging
- Tests: vitest (unit / integration / pdf projects) and Playwright (e2e)

### Definition of done for the whole task

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:pdf`
  all pass; new behaviour has tests (see §12).
- Migrations apply cleanly on an empty DB and on a DB that already contains data from the
  current schema (write data migrations where needed; existing applications must still render).
- No dummy/demo accounts in the seed (see §1.4).
- Everything is server-side authorised — hiding a button is never the only protection.

---

## 1. Roles, accounts and authentication

### 1.1 Role model (collapse to four roles)

| Role (enum) | Who                                                                         | Capabilities                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`     | Dean (`dean.admn@psgtech.ac.in`) and Principal (`principal@psgtech.ac.in`)  | Full system access and control. Merge the current `SUPER_ADMIN` and `RECRUITMENT_ADMIN` into this single role. Manage users and roles, departments, disciplines, recruitment cycles, vacancies/job profiles, form settings; view all applications; bulk-move applications to HODs; approve/apply position changes; view approved summary sheets; export; view audit log.  |
| `HR`        | HR – N4 Section (`admin.n4@psgtech.ac.in`)                                  | Job profile (vacancy) entry and editing, view all applications, download the full application PDF and the merged application + documents bundle, HR dashboard filters, view approved HOD summary sheets, CSV export with column selection. Can approve/apply a position change only if Admin grants that permission (make it a configurable permission, default **off**). |
| `HOD`       | e.g. `hod.cse@psgtech.ac.in` — created by Admin, one or more per department | Sees **only** applications of their own department(s) that have been assigned to them. Reviews, records decisions, generates and approves the department summary sheet. No access to other departments, no exports of other departments, no user management.                                                                                                              |
| `CANDIDATE` | Self-registered applicants                                                  | Create/edit own draft, upload documents, preview PDF, submit, download own submitted PDF and receipt.                                                                                                                                                                                                                                                                     |

- Write a migration mapping old roles: `SUPER_ADMIN`, `RECRUITMENT_ADMIN` → `ADMIN`;
  `HR_OFFICER` → `HR`; `DEPARTMENT_REVIEWER` → `HOD`. Update `app/modules/auth/permissions.ts`
  and every `requireRole`/policy check accordingly.
- Admin UX must be pleasant, not a wall of settings: a single **Admin** area with clear tabs
  (Overview · Applications · Departments · Users & Roles · Vacancies · Summary Sheets · Audit · Settings).
- An Admin cannot remove the last remaining Admin or demote themselves if they are the last Admin.

### 1.2 Users & departments managed by Admin

- Admin creates departments (name, **short code** e.g. `CSE`, `ECE`, `MECH` — unique, uppercase,
  2–8 letters, used in reference numbers), disciplines, and HOD users, and maps each HOD to one or
  more departments (`UserDepartment` join table or `departmentId` on `UserRole` — pick one and document it).
- Admin can create additional HR users and additional Admins.
- New staff users receive an email invitation link (single-use, expiring token) to set a password.
- Admin can disable/re-enable users; disabled users' sessions are revoked immediately.

### 1.3 Email OTP (production grade)

- **Staff login (ADMIN and HR — mandatory; HOD — also enabled by default, Admin can toggle in Settings):**
  password → then a 6-digit email OTP → session created only after OTP succeeds.
- **Candidate:** email OTP to verify the email address at registration (replace or complement the
  existing verification-link flow), and OTP for password reset.
- OTP rules: 6 digits from a CSPRNG; store only a hash (argon2 or HMAC-SHA256 with a server secret);
  expires in 10 minutes; max 5 verification attempts per OTP then invalidate; resend allowed after
  60 s cooldown, max 5 sends per hour per email and per IP (use existing `rate-limit.server.ts` / Redis);
  single use; constant-time comparison; generic error messages (do not reveal whether an email exists).
- Extend `AuthTokenType` with `LOGIN_OTP` (and `EMAIL_OTP` if needed) or add an `OtpChallenge` model.
- Send through the existing outbox → worker → nodemailer path; SMTP settings from env
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Email template: PSGCT branded,
  plain-text alternative, shows the OTP, expiry time and "If you did not request this, ignore this email".
- Log every OTP sent/verified/failed as an audit event (never log the OTP itself).
- In development only, if SMTP is not configured, log the OTP to the console behind an explicit
  `DEV_LOG_OTP=true` flag that is rejected at startup when `NODE_ENV=production`.

### 1.4 Seed data — no dummy accounts

- Seed **only**: Admin `dean.admn@psgtech.ac.in` (display name "Dr. S. Saravanan", Dean),
  Admin `principal@psgtech.ac.in` (Principal), HR `admin.n4@psgtech.ac.in` (HR – N4 Section).
- Remove `superadmin@example.test` and every other demo/example user, demo candidate and demo
  application from the seed. Do **not** seed HODs or departments — Admin creates them in the UI.
- Seeded staff get no usable password; they activate via an invitation/set-password email (or a
  one-time password printed by `db:seed:prod` once — document which in `docs/runbooks/`).
- Seed must be idempotent (safe to run twice).

---

## 2. Application reference number

- Format: **`PSGCT2026-27<DEPT>_<NNNN>`**, e.g. `PSGCT2026-27CSE_0001`, `PSGCT2026-27ECE_0014`.
  - `2026-27` = academic year of the recruitment cycle (store `academicYear` on `RecruitmentCycle`,
    e.g. `"2026-27"`; default derives from the cycle start date, June–May).
  - `<DEPT>` = the vacancy department's short code.
  - `<NNNN>` = 4-digit zero-padded running number, **per academic year per department**.
- Assigned atomically at first final submission (replace the current `PSGTECH-YYYY-NNNNNN` logic).
  Change `ReferenceCounter` to a composite key `(academicYear, departmentCode)` and increment with
  `UPDATE ... RETURNING` inside the submission transaction — no gaps from races, no duplicates.
- Existing references stay unchanged (do not renumber old data).
- Show the reference number on the receipt, application PDF header, every dashboard row, exports
  and emails.

---

## 3. Candidate application form

### 3.0 UX and structure (HCI requirements)

Rebuild the candidate form as a **step-by-step wizard** using the existing form registry/definitions
(`app/modules/forms/`). Steps, in order:

1. Post & Department (vacancy selection; position and department shown read-only)
2. Personal Details (keep every existing field — do not remove any)
3. Academic Qualifications — School Education
4. Academic Qualifications — College Education (UG, PG, Others/Diploma, Ph.D.)
5. Arrear Details & Achievements
6. Work Experience
7. Ph.D. Guideship
8. Publications & Research (journals, conferences, books, metrics)
9. Research Projects & Patents
10. Professional Memberships & Competitive Exams (GATE/NET/SET/etc.)
11. References
12. Salary, Timing & Source of Vacancy
13. Relatives in PSG Institutions & Other Information
14. Documents & Uploads (photo, signature, resume, certificates — see §3.9)
15. Review & PDF Preview → Declaration → Final Submit

Wizard behaviour:

- Persistent left step list (top progress bar on mobile) showing each step's state:
  not started / in progress / complete / has errors. Any step can be revisited.
- "Save & Continue" and "Back" on every step; autosave drafts every 30 s and on step change using the
  existing `draftVersion` optimistic concurrency; show "Saved · 2 min ago" status.
- Validation: inline, on blur and on Continue; error text under the field, plus an error summary at
  the top of the step that links to each field; focus moves to the first error.
- Repeatable sections ("Add another …" / "Remove") with a visible count and confirmation on remove.
- Required fields marked with `*` and a legend; helper text for formats (dates DD/MM/YYYY, marks, etc.).
- Readability: base font 16 px, labels 14–15 px semibold, line-height ≥ 1.5, max content width
  ~880 px for forms, 2-column grid on desktop / 1-column on mobile, minimum 44 px touch targets,
  WCAG 2.1 AA contrast, visible focus rings, proper `<label for>`, `aria-describedby` for help/errors,
  `aria-invalid`, fieldset/legend for groups, keyboard-only operable, no layout shift.
- Consistent design tokens in `app/app.css` (colors, spacing scale, radius, shadows) — PSGCT
  institutional look, clean and calm, no decorative animation inside forms.
- Never lose user data: warn on navigation with unsaved changes.

### 3.1 Post & Department

- Candidate picks a published vacancy; department and position (Professor / Associate Professor /
  Assistant Professor) come from the vacancy.
- **Remove** the "number of posts" field from the candidate-facing form (keep it on the vacancy for
  Admin/HR only).

### 3.2 School Education

**SSLC:** School, Board, Year of Completion, Marks / Percentage, Mode of Education, Number of Attempts.
**HSC:** Major Subject (group), School, Board, Year of Completion, Marks / Percentage, Mode of
Education, Number of Attempts.

### 3.3 College Education

Each record (UG, PG, Others, Ph.D., plus "Add another qualification") has:
Level, Degree, Specialisation/Branch, College, University, Year of Completion,
**CGPA / Marks / Percentage** (with a selector: CGPA (out of 10) or Percentage),
**Class** (First Class · First Class with Distinction / Honours · Second Class · Other — "Other"
requires a text explanation and is flagged for HR review),
**Mode of Study** (Full-time · Part-time · Distance Education),
**Number of Attempts**, and inline attachment of the degree certificate / consolidated mark sheet
(keep the existing inline-attachment behaviour from commit `5a12304`).

- **UG** and **PG**: required. **Others**: "No. of Diploma/Others" count + repeatable rows
  (Others/Qualification name, College, Year, Percentage, Mode of Study).
- **Ph.D.**: Status (Awarded / Thesis submitted / Pursuing / Not applicable), Title, University,
  Supervisor, Year of registration, Year of award, Mode. Ph.D. status feeds the HR "PhD" filter.

### 3.4 Arrear details, achievements, certifications

- **UG Arrear Details:** Total number of papers with arrears, Total number of attempts.
- **PG Arrear Details:** Total number of papers with arrears, Total number of attempts.
- Special achievements in academics (Best Student, Gold medal, University Rank, etc.) — textarea.
- Certification courses completed (NPTEL, Coursera, …) — repeatable: course, platform, year, score/grade.

### 3.5 Work Experience (multiple records)

Each record: Institution / Organisation Name, Address of the Institution, Designation,
Nature (Teaching / Industry / Research), Employment type (Regular / Contract / Adhoc),
From date, To date (or "Currently working here" checkbox → To = today),
**Scale of Pay**, **Gross Salary / Total Emoluments (Rs./month)**,
Service Certificate Available (Yes/No; if Yes → upload), Reason for Leaving
(required unless currently working), **Appointment order upload** (where applicable).

- **Remove** any experience-duration-in-days field. Compute duration automatically from the dates in
  **years and months** per record (show read-only, e.g. "3 years 7 months") and totals:
  - Total experience · Teaching experience · Experience after PG · Industry experience.
    Put the calculation in a pure, unit-tested function (`app/modules/forms/experience.ts`): handle
    month boundaries, leap years, current jobs, and **overlapping periods** (do not double count in
    totals; flag overlaps to the candidate as a warning).
- Validate: From ≤ To, To ≤ today, From after date of birth + 18 years.
- **If currently employed:** show a dedicated section "Current Employment" requiring the
  service/experience certificate (or NOC if required by the vacancy), last-drawn salary
  certificate / salary slip upload, and appointment order upload.
- Upload for the **last-drawn salary certificate / salary slip** (required if any experience exists).

### 3.6 Ph.D. Guideship

Guideship (Yes/No). If Yes: Guideship Number, University, Number of Ph.D. scholars registered,
Number of scholars with thesis submitted, Number of scholars completed.

### 3.7 Publications & Research

- **Journal Papers** — repeatable list: Author name(s), Paper title, Journal name, Year,
  Volume/Issue/Pages, **Publication type** (SCI/SCIE · Scopus · Web of Science · UGC-CARE · Other),
  Indexing, DOI/URL. Show a live **"Total journal papers: N"** count.
- **Conference Papers** — repeatable: Authors, Title, Conference name, Organiser, Year, National /
  International, Publication type (Scopus-indexed proceedings, etc.), DOI/URL.
- **Books** and **Book Chapters** — repeatable: Authors, Title, Publisher, ISBN, Year.
- **Conference participation / professional membership** — repeatable: Body (IEEE, ACM, ISTE, CSI, IEI …),
  Membership type/ID, Since year, Role (member / chair / reviewer / participant).
- **Other details / metrics:** Number of journals, conferences, books, book chapters (auto-computed
  from lists but editable with a warning if they differ), **h-index**, **i10-index**, Number of
  citations, Scopus URL, ORCID ID (validate `0000-0000-0000-000X` format), Google Scholar link (URL).

### 3.8 Research Projects & Patents

- **Research Projects** — repeatable: Title, Agency/Scheme, Sanctioned date, Period, Sanctioned amount
  (Rs.), Role (PI/Co-PI), Status (Ongoing/Completed).
- **Patents** — repeatable: Name of the inventors, Title, Application number, Date of filing,
  Filed by, Status (Filed / Published / Granted), Date (of current status).

### 3.9 Competitive exams (optional)

GATE / NET / SET / SLET / Other: Exam, Discipline/Paper, Year, Score, Rank/Percentile,
Validity, scorecard upload. Feeds the HR "GATE / competitive exam" filter.

### 3.10 References (min 1, max 2)

Each: Name, Designation, Organization, Mobile No. (Indian 10-digit, validate), Email (optional),
Relationship/Professional details. "Add Reference" disabled at 2; "Remove" disabled when only 1 left.
Enforce **1 ≤ count ≤ 2** in the shared zod schema (client and server).

### 3.11 Salary, timing and source

- Last Drawn Monthly Pay (Rs.) * — Pay Expected, if Selected (Rs.) * — Joining Time Required, if
  Selected * (select: Immediate / 1 month / 2 months / 3 months / Other + text).
- "I came to know about the vacancy through" *: The Hindu newspaper · Naukri.com · College website ·
  Known source (requires name) · Other (text).

### 3.12 Relatives / known persons in PSG Institutions

Repeatable (0..n): Name, Relationship, Institution, Designation. "Any other information of importance" — textarea.

### 3.13 Uploads (separated from general attachments)

Clearly grouped, each with its own section and help text (file types PDF/JPG/PNG, size limits from
`app/modules/documents/policy.ts`, existing malware scan pipeline):

| Group                    | Items                                                                                                    | Required                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identity                 | **Photograph** (JPG/PNG, crop preview), **Signature** (JPG/PNG)                                          | **Mandatory**                                                                      |
| Resume                   | Resume / CV (PDF)                                                                                        | **Mandatory**                                                                      |
| Academic                 | Certificates/mark sheets (inline per qualification)                                                      | As per vacancy rules                                                               |
| Employment               | Service/experience certificates (per record), appointment orders, **last-drawn salary certificate/slip** | Salary slip mandatory if experienced; service cert mandatory if currently employed |
| Professional memberships | Membership certificates                                                                                  | Optional                                                                           |
| Publication proofs       | First page / acceptance proof per paper or a combined PDF                                                | Optional (recommended)                                                             |
| Competitive exam         | GATE/NET scorecards                                                                                      | Optional                                                                           |
| Other                    | General attachments                                                                                      | Optional                                                                           |

Add `DocumentType` values: `SIGNATURE`, `RESUME`, `APPOINTMENT_ORDER`, `SALARY_SLIP`,
`SERVICE_CERTIFICATE`, `MEMBERSHIP_CERTIFICATE`, `PUBLICATION_PROOF`, `COMPETITIVE_EXAM_SCORECARD`
(keep existing ones; map existing `SALARY_CERTIFICATE`/`EXPERIENCE_CERTIFICATE` sensibly).

### 3.14 Employer endorsement

- **Remove** the additional Principal note/endorsement requirement from the workflow.
- **Keep** any mandatory original employer-endorsement / NOC section that exists in the official
  application form (Assistant/Associate Professor form definitions). Do not remove employer
  endorsements — make the removal a configurable Admin setting defaulting to "keep".

### 3.15 Declaration and submission (see §8)

Declaration checkbox (required): "I hereby declare that the information furnished herein above is
correct and true to the best of my knowledge." Plus place and date (auto).

---

## 4. Data model changes (Prisma)

- Keep full answers in `ApplicationRevision.answers` (JSON) **and** extend normalised tables used for
  filtering/reporting:
  - `Qualification`: add `category` (SCHOOL | COLLEGE), `level` (SSLC, HSC, UG, PG, DIPLOMA, PHD, OTHER),
    `specialisation`, `board`, `scoreType` (CGPA | PERCENTAGE | MARKS), `score` (Decimal),
    `classAwarded` enum, `modeOfStudy` enum, `attempts`, `yearOfCompletion` (Int), `phdStatus`.
  - `EmploymentRecord`: `fromDate`/`toDate` as `DateTime @db.Date`, `isCurrent`, `scaleOfPay`,
    `grossSalary` (Decimal), `institutionAddress`, `reasonForLeaving`, `serviceCertAvailable`,
    `durationMonths` (Int, computed).
  - New: `Publication` (kind JOURNAL|CONFERENCE|BOOK|BOOK_CHAPTER, …), `ResearchMetric` (or columns on
    revision: hIndex, i10Index, citations, scopusUrl, orcid, scholarUrl), `CompetitiveExam`,
    `Reference`, `ResearchProject`, `Patent`, `ProfessionalMembership`.
  - Denormalised filter columns on `ApplicationRevision`: `hasPhd`, `phdStatus`, `hasCompetitiveExam`,
    `totalExperienceMonths`, `departmentId`, `appliedPosition`.
- `Application`: add `departmentId` (from vacancy, indexed), `appliedPosition` (immutable — what the
  candidate applied for), `effectivePosition` (nullable; set only by an approved position change),
  `assignedHodId` (nullable), `academicYear`.
- Extend `ApplicationStatus` with: `ASSIGNED_TO_HOD`, `HOD_ACCEPTED`, `HOD_RECOMMENDED_CHANGE`,
  `HOD_REJECTED` (keep existing values; update `app/modules/applications/workflow.ts` transition table).
- New `PositionChangeRequest`: applicationId, fromPosition, toPosition, reason (required), requestedById
  (HOD), status (PENDING | APPROVED | REJECTED), decidedById, decidedAt, decisionNote.
- New `SummarySheet`: departmentId, academicYear, vacancy/cycle scope, generatedById, status
  (DRAFT | APPROVED | SUPERSEDED), approvedAt, snapshot JSON of rows, version number. Approved sheets are immutable;
  regenerating creates a new version and marks the old one SUPERSEDED.
- Add indexes for every filter used in dashboards.

---

## 5. HR dashboard

- Landing page with counts by status and by department (cards + table — no decorative charts needed).
- **Applications list**, grouped/filterable **department-wise**, with columns: Reference No., Candidate
  name, Department, Applied for, Effective position (if changed), Ph.D. status, Competitive exam,
  Experience (y m), Submitted on, Status, Assigned HOD.
- **Filters (combinable, reflected in the URL query string so views are shareable/bookmarkable):**
  Department · Applied position · Status · Ph.D. (Awarded / Submitted / Pursuing / None) ·
  GATE / competitive exam (Any / GATE / NET / SET / None) · Min experience · Submitted date range ·
  free-text search (name, reference, email). Show active filter chips with "Clear all".
- Server-side pagination and sorting; filters executed in SQL via Prisma, not in memory.
- Open an application → full read-only view of the submitted revision, document list with
  scan status, download **application PDF** and the **merged application + supporting documents PDF**.
- HR enters/edits **job profiles (vacancies)**: department, position, discipline, number of posts,
  eligibility, required documents, opening/closing dates, publish/close.

---

## 6. Admin: department-wise bulk assignment to HOD

- Admin (Dean/Principal) sees submitted applications grouped by department with counts.
- Bulk action: select all / select filtered applications of a department → "Move to HOD" → choose the
  HOD mapped to that department (if exactly one, preselect) → confirm dialog showing the count.
- Server enforces: an application may only be assigned to an HOD mapped to the application's
  department. Creates `ReviewAssignment`, sets status `ASSIGNED_TO_HOD`, writes status history and an
  audit event per application, and enqueues one summary email to the HOD.
- Reassign / unassign supported with reason (audited).

---

## 7. HOD review workflow

- HOD dashboard shows only applications where `assignedHodId = me` **and** department ∈ my departments
  (enforce in the query layer and in every loader/action — test for cross-department access → 403/404).
- List shows: Reference, Candidate name, Applied position, Qualification summary (highest degree,
  Ph.D. status), Experience (y m), Publications count, h-index, Status.
- Review screen: full application view + documents, and a decision panel with three actions:
  1. **Accept as applied**.
  2. **Recommend position change** — the agreed rule: an application for **Associate Professor** may be
     recommended to be considered for **Assistant Professor** (downgrade of cadre). Also allow
     Professor → Associate Professor. Never allow upgrades from the HOD. Make the allowed transitions a
     config map (`app/modules/reviews/position-policy.ts`) so policy can change without code changes elsewhere.
     Reason is mandatory.
  3. **Reject** — reason is mandatory.
     Optional remarks/score field for all actions.
- A position change is a **recommendation**: it creates a `PositionChangeRequest` (PENDING). The
  candidate's submitted revision is **never modified**. Admin (or HR if granted permission) approves or
  rejects the request; on approval, `effectivePosition` is set. Everything is audited and shown as a
  timeline on the application (who, what, when, reason).
- HOD can change a decision until the department summary sheet is approved; after approval, changes
  require Admin to reopen the sheet (audited).

---

## 8. Application PDF and submission workflow

1. On the final step, validate **all** required fields and required attachments across all steps
   (shared zod schema). If anything fails, show a checklist of errors with links to the exact step/field.
2. Photograph and signature must be uploaded and scanned clean before submission is allowed.
3. Generate a **preview PDF** of the completed application (server-side, pdf-lib, using the existing
   PDF generator extended for all new sections; watermark "PREVIEW – NOT SUBMITTED"). Show it in an
   embedded viewer (`<iframe>`/object with download fallback) on the Review step.
4. Candidate can "Go back and edit" (returns to the step) or tick the declaration and **Confirm & Submit**.
5. On submit (single DB transaction): assign reference number (§2), create an immutable
   `ApplicationRevision` with `answers`, `answersSha256` and `attachmentManifest` (documentId, type,
   sha256, size, original name — record exactly which attachments were included), populate normalised
   tables, set status `SUBMITTED`, enqueue jobs.
6. Worker generates the **final application PDF** (with reference number, photo, signature, submitted
   timestamp, revision number, no watermark) and a **consolidated bundle PDF**: application PDF followed by
   every included supporting document in a defined order with a cover index page and bookmarks
   (convert JPG/PNG to PDF pages). Track via `ProcessingStatus`.
7. Candidate receives confirmation email with reference number; can download their own final PDF.
8. The consolidated bundle is downloadable only by Admin and HR (and HOD for their assigned applications).
9. PDF layout: A4, PSG College of Technology header, clear section headings matching the form steps,
   tables for repeatable sections, page numbers "Page X of Y", reference number in every footer.

---

## 9. HOD summary sheet → approval → HR/Admin view → CSV export

- After reviewing, the HOD clicks **Generate Summary Sheet** for their department (scope: academic year /
  cycle / vacancy). Preview table columns at minimum:

  | S. No. | Reference No. | Candidate Name | Department | Applied For | Recommended / Effective Position | HOD Decision | Reason/Remarks | Status |

- The HOD can generate only if every assigned application has a decision (otherwise list the pending ones).
- HOD clicks **Approve Summary Sheet** (confirm dialog) → saved as an immutable versioned snapshot →
  visible to HR (N4 Section) and Admin; notification email sent to both.
- **HR Summary dashboard** (HR and Admin): department-wise summary cards (submitted / accepted /
  changed / rejected / pending), table of approved sheets, and the combined summary table
  `S. No. | Candidate Name | Department | Applied For | Status`, filterable by department and position.
- **CSV export with column chooser:** a checkbox panel listing every exportable field grouped by
  section (Identity, Contact, Qualifications, Experience, Publications & metrics, Competitive exams,
  HOD decision, Position change, Status…), with "Select all / none", default selection = the summary
  columns above, and "remember my last selection" (per user, stored server-side).
  - Export reflects **actual DB data** and the **active filters** at the moment of export.
  - Excel-compatible CSV: UTF-8 **with BOM**, CRLF line endings, RFC 4180 quoting, dates as
    `DD-MM-YYYY`, numbers unformatted, and **CSV-injection protection** (prefix cells starting with
    `=`, `+`, `-`, `@`, tab or CR with `'`). File name: `PSGCT_2026-27_<DEPT|ALL>_summary_<yyyymmdd-hhmm>.csv`.
  - Stream large exports; extend `app/routes/staff/export.ts`.
  - Role restrictions: Admin and HR — all departments; HOD — only their own department and only their
    own sheet; Candidate — none. Every export is audit-logged (user, filters, columns, row count).

---

## 10. Audit, security and production readiness

- Audit events for: login, OTP send/verify/fail, logout, user/role/department changes, vacancy changes,
  submissions, assignments, HOD decisions, position-change requests and decisions, summary sheet
  generate/approve/reopen, PDF/bundle downloads, exports. Admin audit page with filters.
- Authorisation: centralised policy functions in `app/modules/auth/policy.server.ts`, used by every
  loader and action. Object-level checks (department scope) on every application/document/file route
  (`app/routes/files/*`).
- CSRF protection on all mutations, secure/HttpOnly/SameSite cookies, session rotation after OTP,
  idle and absolute session timeouts for staff, rate limiting on auth endpoints, CSP with nonce (existing
  `nonce.server.ts`), file uploads: type sniffing via `file-type`, size limits, malware scan before use.
- Env validation in `app/modules/core/env.server.ts` for all new variables; update `.env.example` and
  `docs/deployment/`.
- No secrets, OTPs or personal data in logs.

---

## 11. UI quality bar (all screens, staff and candidate)

- Apply HCI principles: visibility of system status (save state, processing state, toasts), match to
  real-world language (use PSGCT terminology), user control (back, cancel, undo remove), consistency
  (one button style per intent, consistent placement of primary action on the right), error prevention
  (confirm destructive/bulk actions, disable invalid actions with a reason), recognition over recall
  (show selected filters, show candidate name/reference in headers), minimalist design, helpful error messages.
- Typography: Plus Jakarta Sans (already installed); 16 px body, clear heading scale (28/22/18/16),
  tables 14 px with comfortable row height, zebra or divider rows, sticky table headers, right-aligned numbers.
- Layout: max width containers, 8 px spacing scale, cards with subtle borders, adequate whitespace,
  responsive down to 360 px, no horizontal page scroll (tables scroll inside their container).
- Status badges with text + colour (never colour alone). Empty states with a next action. Loading skeletons.
- Accessibility: WCAG 2.1 AA, keyboard navigation, focus management after dialogs/navigation, screen-reader
  labels for icon buttons, `prefers-reduced-motion` respected.
- Consolidate styles in `app/app.css` tokens; reuse `app/components/forms.tsx` primitives (Field, Select,
  RepeatableSection, FileUpload, StepNav, ErrorSummary, StatusBadge, DataTable, FilterBar, ConfirmDialog).

---

## 12. Tests

- **Unit:** experience duration calculator (incl. overlaps, current job, leap years); reference number
  formatter; position-change policy; reference count validation (0, 1, 2, 3); CSV escaping & injection guard;
  OTP generation/verification/expiry/attempt limits; workflow transition table.
- **Integration:** concurrent submissions produce unique sequential references per department; HOD cannot
  read/act on another department's application or file; bulk assignment only to mapped HOD; position change
  does not alter revision answers and requires Admin approval; summary sheet immutability & versioning;
  export respects filters, columns and role scope.
- **PDF:** preview vs final PDF content, all new sections render, bundle includes exactly the manifest
  documents in order.
- **E2E (Playwright):** candidate registers with OTP → completes wizard → previews PDF → edits → submits;
  Admin OTP login → creates department + HOD → bulk-moves applications; HOD reviews (accept / recommend
  change / reject) → generates & approves summary sheet; HR views sheet → exports CSV with chosen columns.

---

## 13. Deliverables

1. Code + Prisma migrations (schema + data migration for roles and existing data).
2. Updated seed (three real staff accounts only, idempotent).
3. Updated docs: `docs/architecture/` (roles, workflow state diagram, data model), an ADR for the
   reference-number format and the position-change policy, `docs/runbooks/` (OTP/SMTP setup, onboarding a
   department + HOD, exporting summaries), `.env.example`.
4. A final report listing every checklist item below with ✅ and the file(s) implementing it, plus any item
   that needs college confirmation.

### Items requiring college confirmation (implement as configurable, with the defaults stated)

- Exact eligibility rules for position change (default: HOD may recommend Associate → Assistant and
  Professor → Associate only; Admin approves).
- Whether HR may approve position changes (default: no).
- Whether employer endorsement/NOC sections are removed (default: keep).
- "Other" class acceptance (default: allowed, flagged for HR).
- Which documents are mandatory per vacancy (default as in §3.13).

---

## 14. Master checklist (must all be ✅)

**Candidate form:** CGPA/Marks · Class (4 options) · Mode of education · Attempts per qualification ·
School vs College separation · SSLC/HSC/UG/PG/Others/Ph.D. fields as listed · UG & PG arrear details ·
achievements · certification courses · multiple experience records · scale of pay · gross salary ·
auto duration in years+months (days field removed) · experience after PG / industry / total ·
service certificate available + reason for leaving · current-employment section · salary slip upload ·
appointment order upload · Ph.D. guideship · journal papers list with total count (author, journal, year,
type) · conferences · books · book chapters · h-index · i10-index · citations · Scopus URL · ORCID ·
Google Scholar · research projects · patents · professional memberships + separate certificate upload ·
separate publication-proof upload · GATE/competitive exam (optional) · references 1–2 enforced ·
last drawn pay · expected pay · joining time · vacancy source · relatives in PSG institutions ·
other information · resume (mandatory) · photograph & signature (mandatory) · number-of-posts field removed ·
declaration · PDF preview before submit · return to edit · final PDF · revision + attachment manifest preserved.

**Reference number:** `PSGCT2026-27<DEPT>_<NNNN>` per department per academic year, atomic.

**Auth & roles:** ADMIN (Dean, Principal) · HR (N4 Section) · HOD (created by Admin) · CANDIDATE ·
email OTP for Admin/HR login (and HOD by default) · candidate email OTP verification · no dummy accounts.

**HR:** department-wise view · combinable filters (dept, position, PhD, GATE/exam, status, experience, date,
search) · job profile entry · full application PDF and merged bundle download.

**Admin:** bulk move by department to HOD · approve position changes · manage users/roles/departments ·
Principal note/endorsement step removed · employer endorsement preserved.

**HOD:** sees only own assigned department applications · accept / recommend change (Assoc→Asst, Prof→Assoc)
with reason / reject with reason · original application unchanged · audit history ·
generate + approve summary sheet.

**Summary & export:** HR Summary dashboard · department-wise summary · S.No/Name/Department/Applied For/Status
table · filters by department and position · CSV export with column checkboxes · real DB data with active
filters · Excel-compatible formatting · role-restricted and audited.

**Quality:** clean, readable, accessible, HCI-compliant UI on every screen · tests · docs · migrations.
