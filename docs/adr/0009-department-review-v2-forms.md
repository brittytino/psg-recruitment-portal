# ADR 0009 — Department-wise HOD review, v2 application form, reference numbers and e-mail OTP

Status: accepted (2026-10-23). Items marked _pending confirmation_ are switches in Admin → Settings.

## Context

The 2026-27 recruitment needs more detailed applications (school and college education with CGPA, class,
mode and attempts; arrears; experience with scale of pay and gross salary; journal/conference/book records;
research metrics; guideship; projects; patents; competitive exams; one or two references; salary
expectations; relatives in PSG institutions), mandatory photograph, signature and resume, a PDF preview before
submission, and a department-wise review by HODs whose decisions are summarised for HR – N4 Section.

## Decisions

1. **Roles** collapse to ADMIN (Dean, Principal), HR (N4 Section), HOD (per department) and CANDIDATE.
2. **Form v2** (`app/modules/forms/definitions/faculty-v2.ts`) is one definition per form code, built from
   shared sections; the Associate/Professor form keeps its additional official sections. Every v1 field is kept
   or replaced by a richer v2 structure (unit test `keeps every v1 field key`). New vacancies use v2; v1
   applications keep their template and still render.
3. **v2 PDFs are drawn directly with pdf-lib** (`app/modules/documents/pdf/render.ts`) instead of filling a
   Word template, because the v2 content has no official Word layout. The same renderer produces the
   watermarked preview, the submitted application PDF and the first part of the consolidated bundle (with a
   contents page and bookmarks). The present-employer endorsement block is still printed (setting
   `printEmployerEndorsement`, default on). The additional Principal note/endorsement step is not part of
   the workflow.
4. **Reference numbers**: `PSGCT<academic year><department code>_<NNNN>`, e.g. `PSGCT2026-27CSE_0001`.
   The academic year comes from the recruitment cycle (June–May, IST, unless set explicitly); the running
   number is per academic year and department, allocated with `INSERT … ON CONFLICT … RETURNING` inside the
   submission transaction (`department_reference_counters`). References issued before v2 are unchanged.
5. **Workflow**: SUBMITTED → ASSIGNED_TO_HOD (Admin/HR, bulk by department) → HOD_ACCEPTED /
   HOD_RECOMMENDED_CHANGE / HOD_REJECTED → (office) SHORTLISTED / REJECTED / APPROVED.
6. **Position change** (_pending confirmation_): a HOD may only recommend a lower cadre
   (Professor → Associate/Assistant, Associate → Assistant; `position-policy.ts`). A reason is required.
   Approval by Admin (or HR if `hrCanApprovePositionChange`) sets `effectivePosition`; the submitted revision
   is never modified; every step is audited.
7. **Summary sheets** are immutable, versioned snapshots approved by the HOD once every assigned
   application is decided. A DB trigger forbids changes other than APPROVED → SUPERSEDED. While a sheet is
   current, decisions on its applications are locked; the Admin can reopen it (audited).
8. **E-mail OTP**: 6-digit codes from a CSPRNG, only an HMAC is stored, 10-minute expiry, 5 attempts,
   60-second resend cooldown, per-user and per-IP send limits, single use. OTP e-mails are sent directly (not
   via the outbox) so codes never reach the notifications table. Admin and HR always use OTP at sign-in; HODs
   by default (`hodLoginOtp`). Candidates verify their e-mail with a code or the link.
9. **Exports**: Excel-compatible CSV (UTF-8 BOM, CRLF, RFC 4180 quoting, formula-injection guard,
   DD-MM-YYYY dates) with columns chosen per export and remembered per user. Admin and HR only; HODs
   download their own approved sheet. Every export is audited.

## Consequences

- Filter fields (Ph.D. status, competitive exams, experience months, journal count, h-index) are
  denormalised onto `application_revisions` at submission for indexed filtering.
- Detailed repeatable records (publications, references, projects, patents) stay in the revision's JSONB
  answers (ADR 0003); exports read them from there.
- The LibreOffice converter is only needed for v1 applications.
