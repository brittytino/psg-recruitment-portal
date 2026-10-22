# Runbook — recruitment operations (2026-27)

## First-time set-up

1. Configure SMTP in `.env.production` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_PASSWORD`, `MAIL_FROM`). Sign-in codes are e-mailed, so staff cannot sign in without working mail.
   `DEV_LOG_OTP` must stay `false` in production (the app refuses to start otherwise).
2. Run migrations and the seed: `docker compose run --rm migrate` (or `npm run db:seed:prod`). The seed
   registers the form templates and creates, if missing, `dean.admn@psgtech.ac.in` and
   `principal@psgtech.ac.in` (Admin) and `admin.n4@psgtech.ac.in` (HR – N4 Section). Each new account is
   e-mailed a set-password link valid for 72 hours; the link is also printed once in the seed output.
   No demo accounts, departments or HODs are created.
3. Admin → **Job profiles → Departments**: create each department with its short code (e.g. `CSE`). The code
   appears in reference numbers and cannot be changed casually.
4. Admin → **Users & roles**: add each HOD with their official e-mail and department(s). They receive a
   set-password e-mail. Use **Resend invitation** if it expired.
5. Admin or HR → **Job profiles → Recruitment cycles**: create the cycle with academic year `2026-27`, publish
   it, then create and publish job profiles.

## During the recruitment

- **Move applications to HODs**: Applications → choose a department → select applications (or none to move
  every not-yet-assigned application matching the filters) → choose the HOD → confirm.
- **Position-change approvals**: Summary & export → “Position changes waiting for approval”, or on the
  application page.
- **HOD**: My reviews → open each application → Accept / Recommend a different position / Reject (reason
  required) → Summary sheet → Generate and approve.
- **Reopen a sheet** (Admin): Summary sheets → View → Reopen (reason recorded).

## Exports

Summary & export → filter by department/position → choose columns → Download CSV. The file reflects the
database at the time of download and the active filters. HODs download their own approved sheet from the
sheet page. All exports are in the audit log (`applications.exported`, `summary.exported`).

## Troubleshooting

| Symptom                                        | Action                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Staff say no code arrives                      | Check SMTP and spam; `auth.otp_sent` in the audit log; wait 60 s, resend |
| “Too many attempts”                            | Rate limit window (15–60 min); try later                                 |
| Candidate cannot submit: “still being checked” | ClamAV scan pending — wait a minute and reload                           |
| HOD cannot change a decision                   | The department sheet is approved — Admin reopens it                      |
| No HOD in the “Move to HOD” list               | Add a HOD for that department in Users & roles                           |
