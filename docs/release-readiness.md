# Release-readiness report — 2026-10-16

## Verified (with test evidence)

- Both official forms: every inventoried field (44 + 121) bound into the original DOCX; original text preserved; photo placement; continuation for long data (unit).
- Generated PDFs: minimal applications keep the template page counts (2 / 11 in LibreOffice); visually compared with the originals; merged bundles have exact expected page counts (integration).
- Submission creates an immutable revision (DB triggers reject UPDATE/DELETE), unique reference number, single revision under concurrent submits, stale-version rejection.
- Upload abuse: non-matching content, PDF as photograph, damaged PDF rejected; EICAR detected by ClamAV.
- Authorization: cross-candidate, cross-department, unassigned reviewer, HR drafts, admin role separation.
- Docker: full stack starts from Compose; data persists across restarts; e2e passes against the container deployment.
- Blue-green: deploy, switch, rollback and failed-release abort locally with 0 failed requests out of 156.
- Backup/restore: restore into scratch DB/volume reproduced identical counts and file checksums.

## Implemented, not yet independently verified

Account e-mail flows (verification/reset delivery via Mailpit), admin screens (cycles/vacancies/users), CSV export, regeneration, withdrawal, clarification resubmission UI, worker retry/backoff behaviour under real outages, CI workflows (never run on GitHub), deploy workflow, TLS config, `switch.sh` restore path, destructive-migration guard.

## Outstanding defects / limitations

- Associate form: when page 1 overflows, the typed "..2" marker spills onto its own page; "State :" values wrap on the Assistant form (label near right margin).
- Development database contains ~12 synthetic test applications from early test runs (a reset needs explicit approval).
- `deepmerge-ts` advisory in Prisma CLI config loader (ADR 0007).
- No staff MFA; no automated accessibility audit; Word pagination may differ slightly from LibreOffice.

## External dependencies

VPS, DNS, TLS certificates, SMTP service, container registry, GitHub repository with protected `main` and `production` environment.

## Decisions required from the college

1. Final workflow states and who records APPROVED/REJECTED.
2. One application per vacancy; withdrawal rules; resubmission after closing date.
3. Mandatory vs optional fields marked `policy` (religion, community, caste, category) and the Gender options (Assistant form prints "M/F").
4. Retention period and deletion process for applications and documents; privacy notice wording and data-request contact.
5. Recruitment office contact details, eligibility criteria, official logo/branding use on the web.
6. Meaning of the "ssc" circle on both forms (preserved unchanged).
7. Whether the form's "Address (Permanent / Present)" should capture both addresses.
8. Whether Word or LibreOffice rendering is the reference for official printouts.
