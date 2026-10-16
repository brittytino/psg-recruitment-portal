# Authorization matrix

Permissions: `app/modules/auth/permissions.ts`. Record scope: `app/modules/auth/policy.server.ts`. All checks are server-side; the UI only hides controls.

| Capability                                                    | Candidate             | HR officer                                     | Dept. reviewer / HOD                | Recruitment admin | Super admin | Auditor                  |
| ------------------------------------------------------------- | --------------------- | ---------------------------------------------- | ----------------------------------- | ----------------- | ----------- | ------------------------ |
| Browse published vacancies                                    | ✓                     | ✓                                              | ✓                                   | ✓                 | ✓           | ✓                        |
| Own drafts, uploads, submission, withdrawal                   | own only              | –                                              | –                                   | –                 | –           | –                        |
| List / read submitted applications                            | –                     | cycles in scope (null = all), never drafts     | own department **and** assigned     | –                 | –           | all non-draft, read-only |
| Draft counts                                                  | –                     | ✓ (count only)                                 | –                                   | –                 | –           | –                        |
| Download attachments / PDFs                                   | own                   | in scope (audited)                             | in scope (audited)                  | –                 | –           | –                        |
| Status transitions                                            | candidate transitions | HR transitions                                 | –                                   | –                 | –           | –                        |
| Assign reviewers                                              | –                     | ✓ (reviewer must hold role for the department) | –                                   | –                 | –           | –                        |
| Record reviews                                                | –                     | HR screening notes                             | department reviews on assigned apps | –                 | –           | –                        |
| Regenerate PDF (new version)                                  | –                     | ✓                                              | –                                   | –                 | –           | –                        |
| CSV export (metadata)                                         | –                     | ✓ (audited)                                    | –                                   | –                 | –           | –                        |
| Departments, cycles, vacancies, required docs                 | –                     | –                                              | –                                   | ✓                 | –           | –                        |
| Grant department-reviewer role                                | –                     | –                                              | –                                   | ✓                 | ✓           | –                        |
| Create staff accounts, grant any staff role, disable accounts | –                     | –                                              | –                                   | –                 | ✓           | –                        |
| Audit log                                                     | –                     | –                                              | –                                   | –                 | –           | ✓                        |

Notes

- Administrators have **no** application data access by default.
- Unknown and unauthorised records return the same 404 (no existence disclosure).
- Candidate accounts cannot be given staff roles (separate accounts).
- A Super Admin cannot remove their own Super Admin role or disable their own account.

Test evidence: `tests/integration/workflow.test.ts › authorization` (cross-candidate, cross-department, unassigned reviewer, HR drafts, admins, auditor) and e2e (`candidate cannot` open `/staff` → 403).
