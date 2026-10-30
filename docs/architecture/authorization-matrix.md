# Authorization matrix

Permissions: `app/modules/auth/permissions.ts`. Record scope: `app/modules/auth/policy.server.ts` and
`hodScope()` in `app/modules/reviews/service.server.ts`. All checks are server-side; the UI only hides controls.

Roles (since v2, migration `20261023090000_v2_department_review`):

- **ADMIN** — Dean (`dean@your-college.edu`) and Principal (`principal@your-college.edu`). Full control.
- **HR** — HR – N4 Section (`hr@your-college.edu`).
- **HOD** — created by the Admin; one role row per department reviewed.
- **CANDIDATE** — self-registered.

The former roles map as SUPER_ADMIN / RECRUITMENT_ADMIN → ADMIN, HR_OFFICER → HR, DEPARTMENT_REVIEWER → HOD.

| Capability                                               | Candidate | HOD                                          | HR – N4 Section                     | Admin |
| -------------------------------------------------------- | --------- | -------------------------------------------- | ----------------------------------- | ----- |
| Own drafts, uploads, PDF preview, submission, withdrawal | own only  | –                                            | –                                   | –     |
| Download own submitted application PDF                   | own       | –                                            | –                                   | –     |
| List / read submitted applications                       | –         | own department **and** assigned to them      | all (or cycles in scope), no drafts | all   |
| Download application PDF and consolidated bundle         | –         | assigned applications (audited)              | ✓ (audited)                         | ✓     |
| Move applications to a HOD (bulk, department-wise)       | –         | –                                            | ✓                                   | ✓     |
| Accept / recommend position change / reject              | –         | assigned applications, before sheet approval | –                                   | –     |
| Approve a position change                                | –         | –                                            | only if enabled in Settings         | ✓     |
| Generate and approve department summary sheet            | –         | own department(s)                            | –                                   | –     |
| View approved summary sheets                             | –         | own department(s)                            | ✓                                   | ✓     |
| Reopen an approved summary sheet                         | –         | –                                            | –                                   | ✓     |
| Download a summary sheet CSV                             | –         | own department(s)                            | ✓                                   | ✓     |
| CSV export with column choice (filtered applications)    | –         | –                                            | ✓ (audited)                         | ✓     |
| Status transitions after the HOD decision                | –         | –                                            | ✓                                   | ✓     |
| Job profiles (vacancies), recruitment cycles             | –         | –                                            | ✓                                   | ✓     |
| Departments, disciplines                                 | –         | –                                            | –                                   | ✓     |
| Staff accounts and roles, disable accounts               | –         | –                                            | –                                   | ✓     |
| Settings                                                 | –         | –                                            | –                                   | ✓     |
| Audit log                                                | –         | –                                            | –                                   | ✓     |

Sign-in: Admin and HR always confirm sign-in with a 6-digit e-mail code; HODs too unless the Admin turns
it off in Settings. Candidates verify their e-mail address with a code (or the link in the same e-mail).

Notes

- Unknown and unauthorised records return the same 404 (no existence disclosure).
- Candidate accounts cannot be given staff roles (separate accounts).
- An Admin cannot remove their own Admin role or disable their own account, and the last active Admin cannot
  be removed or disabled.
- A HOD's position-change recommendation never changes the submitted revision; approval sets
  `applications.effectivePosition` and is audited.

Test evidence: `tests/integration/workflow.test.ts › authorization`, `tests/integration/department-review.test.ts`
(cross-department HOD, position-change approval, summary sheet immutability, export scope),
`tests/unit/v2-rules.test.ts › roles` and e2e (`candidate` opening `/staff` → 403).
