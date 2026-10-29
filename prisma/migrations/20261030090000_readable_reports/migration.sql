-- Read-only, human-friendly views for the DB viewer (schema "reports"). Views only read the
-- existing tables: no data is copied, changed or deleted. Times are shown in IST.

CREATE SCHEMA IF NOT EXISTS reports;

CREATE OR REPLACE FUNCTION reports.ist(ts timestamptz) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$fn$ SELECT to_char(ts AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') $fn$;

CREATE OR REPLACE FUNCTION reports.role_label(r text) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$fn$ SELECT CASE r
     WHEN 'SUPER_ADMIN' THEN 'Super Admin'
     WHEN 'ADMIN'       THEN 'Admin (Dean / Principal)'
     WHEN 'HR'          THEN 'HR – N4 Section'
     WHEN 'HOD'         THEN 'HOD'
     WHEN 'CANDIDATE'   THEN 'Candidate'
     ELSE r END $fn$;

CREATE OR REPLACE FUNCTION reports.status_label(s text) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$fn$ SELECT initcap(replace(s, '_', ' ')) $fn$;

CREATE OR REPLACE FUNCTION reports.position_label(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$fn$ SELECT CASE p
     WHEN 'ASSISTANT_PROFESSOR' THEN 'Assistant Professor'
     WHEN 'ASSOCIATE_PROFESSOR' THEN 'Associate Professor'
     WHEN 'PROFESSOR'           THEN 'Professor'
     ELSE p END $fn$;

-- Every account with name, e-mail and role(s).
CREATE OR REPLACE VIEW reports.users AS
SELECT
  coalesce(p."fullName", '—')                                   AS "Name",
  u.email                                                        AS "E-mail",
  coalesce(string_agg(DISTINCT reports.role_label(r.role::text) || coalesce(' – ' || d.code, ''), ', '), '—') AS "Role",
  initcap(u.status::text)                                        AS "Status",
  CASE WHEN u."emailVerifiedAt" IS NULL THEN 'No' ELSE 'Yes' END AS "E-mail verified",
  coalesce(reports.ist(u."lastLoginAt"), 'Never')                AS "Last sign-in (IST)",
  reports.ist(u."createdAt")                                     AS "Registered (IST)",
  u."createdAt"                                                  AS "Registered at",
  u.id                                                           AS "User ID"
FROM users u
LEFT JOIN candidate_profiles p ON p."userId" = u.id
LEFT JOIN user_roles r ON r."userId" = u.id
LEFT JOIN departments d ON d.id = r."departmentId"
GROUP BY u.id, p."fullName"
ORDER BY u."createdAt" DESC;

-- Staff only (Super Admin, Dean/Principal, HR, HODs).
CREATE OR REPLACE VIEW reports.staff AS
SELECT * FROM reports.users WHERE "Role" NOT IN ('Candidate', '—');

-- Candidates with their application counts.
CREATE OR REPLACE VIEW reports.candidates AS
SELECT
  coalesce(p."fullName", '—')                                   AS "Name",
  u.email                                                        AS "E-mail",
  coalesce(p.phone, '—')                                         AS "Phone",
  CASE WHEN u."emailVerifiedAt" IS NULL THEN 'No' ELSE 'Yes' END AS "E-mail verified",
  (SELECT count(*) FROM applications a WHERE a."candidateId" = u.id AND a.status <> 'DRAFT') AS "Submitted applications",
  (SELECT count(*) FROM applications a WHERE a."candidateId" = u.id AND a.status = 'DRAFT')  AS "Drafts",
  coalesce(reports.ist(u."lastLoginAt"), 'Never')                AS "Last sign-in (IST)",
  reports.ist(u."createdAt")                                     AS "Registered (IST)",
  u."createdAt"                                                  AS "Registered at"
FROM users u
JOIN user_roles r ON r."userId" = u.id AND r.role = 'CANDIDATE'
LEFT JOIN candidate_profiles p ON p."userId" = u.id
ORDER BY u."createdAt" DESC;

-- Applications with candidate, post, department, HOD, interview and status.
CREATE OR REPLACE VIEW reports.applications AS
SELECT
  coalesce(a."referenceNo", '(draft)')                           AS "Reference No",
  coalesce(rev."candidateName", p."fullName", '—')               AS "Candidate",
  cu.email                                                       AS "Candidate e-mail",
  coalesce(v."researchPositionTitle", reports.position_label(coalesce(a."appliedPosition", v.position)::text)) AS "Applied for",
  coalesce(reports.position_label(a."effectivePosition"::text), '') AS "Approved post (after change)",
  coalesce(d.name, rs.name, '—')                                 AS "Department / Specialisation",
  initcap(a."recruitmentCategory"::text)                         AS "Category",
  reports.status_label(a.status::text)                           AS "Status",
  coalesce(hp."fullName", hu.email, '—')                         AS "HOD",
  coalesce(initcap(replace(a."hodDecision"::text, '_', ' ')), '—') AS "HOD decision",
  coalesce(reports.ist(a."interviewAt"), '—')                    AS "Interview (IST)",
  coalesce(a."interviewVenue", '—')                              AS "Interview venue",
  coalesce(reports.ist(a."submittedAt"), 'Not submitted')        AS "Submitted (IST)",
  reports.ist(a."updatedAt")                                     AS "Last updated (IST)",
  v.code                                                         AS "Vacancy code",
  a."submittedAt"                                                AS "Submitted at",
  a.id                                                           AS "Application ID"
FROM applications a
JOIN users cu ON cu.id = a."candidateId"
LEFT JOIN candidate_profiles p ON p."userId" = a."candidateId"
LEFT JOIN application_revisions rev ON rev.id = a."currentRevisionId"
JOIN vacancies v ON v.id = a."vacancyId"
LEFT JOIN departments d ON d.id = a."departmentId"
LEFT JOIN research_specialisations rs ON rs.id = v."researchSpecialisationId"
LEFT JOIN users hu ON hu.id = a."assignedHodId"
LEFT JOIN candidate_profiles hp ON hp."userId" = a."assignedHodId"
ORDER BY a."submittedAt" DESC NULLS LAST, a."updatedAt" DESC;

-- Job openings with their counts.
CREATE OR REPLACE VIEW reports.job_openings AS
SELECT
  v.code                                                         AS "Code",
  v.title                                                        AS "Title",
  initcap(v."recruitmentCategory"::text)                         AS "Category",
  coalesce(d.name, rs.name, '—')                                 AS "Department / Specialisation",
  initcap(v.status::text)                                        AS "Status",
  coalesce(v."numberOfPosts"::text, '—')                         AS "Posts",
  reports.ist(v."opensAt")                                       AS "Opens (IST)",
  reports.ist(v."closesAt")                                      AS "Closes (IST)",
  (SELECT count(*) FROM applications a WHERE a."vacancyId" = v.id AND a.status <> 'DRAFT') AS "Applications",
  (SELECT count(*) FROM applications a WHERE a."vacancyId" = v.id AND a.status = 'DRAFT')  AS "Drafts",
  reports.ist(v."createdAt")                                     AS "Created (IST)"
FROM vacancies v
LEFT JOIN departments d ON d.id = v."departmentId"
LEFT JOIN research_specialisations rs ON rs.id = v."researchSpecialisationId"
ORDER BY v."createdAt" DESC;

-- Departments with their HODs.
CREATE OR REPLACE VIEW reports.departments AS
SELECT
  d.code                                                         AS "Code",
  d.name                                                         AS "Department",
  coalesce((SELECT string_agg(coalesce(p."fullName", u.email) || ' <' || u.email || '>', ', ')
            FROM user_roles r JOIN users u ON u.id = r."userId"
            LEFT JOIN candidate_profiles p ON p."userId" = u.id
            WHERE r.role = 'HOD' AND r."departmentId" = d.id), 'Not set') AS "HOD",
  CASE WHEN d.active THEN 'Active' ELSE 'Inactive' END           AS "Status",
  (SELECT count(*) FROM vacancies v WHERE v."departmentId" = d.id) AS "Job openings",
  (SELECT count(*) FROM applications a WHERE a."departmentId" = d.id AND a.status <> 'DRAFT') AS "Applications",
  reports.ist(d."createdAt")                                     AS "Created (IST)"
FROM departments d
ORDER BY d.name;

-- Audit trail with readable actor names.
CREATE OR REPLACE VIEW reports.audit_log AS
SELECT
  reports.ist(e."createdAt")                                     AS "When (IST)",
  coalesce(p."fullName", u.email, 'System')                      AS "Who",
  e.action                                                       AS "Action",
  e."entityType"                                                 AS "On",
  coalesce(e."entityId", '')                                     AS "Record ID",
  coalesce(e.ip, '')                                             AS "IP",
  e."createdAt"                                                  AS "At"
FROM audit_events e
LEFT JOIN users u ON u.id = e."actorId"
LEFT JOIN candidate_profiles p ON p."userId" = e."actorId"
ORDER BY e."createdAt" DESC;
