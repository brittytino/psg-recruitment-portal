-- Read-only view of uploaded files for the DB viewer. The files themselves live in the private
-- storage volume (see docs/deployment/production-server.md, "Where files are stored").
CREATE OR REPLACE VIEW reports.documents AS
SELECT
  coalesce(a."referenceNo", '(draft)')                           AS "Reference No",
  coalesce(p."fullName", u.email)                                AS "Candidate",
  u.email                                                        AS "Candidate e-mail",
  initcap(replace(d."documentType"::text, '_', ' '))             AS "Document type",
  d."originalName"                                               AS "File name (as uploaded)",
  CASE d."mimeType" WHEN 'application/pdf' THEN 'PDF' WHEN 'image/png' THEN 'PNG' ELSE 'JPEG' END AS "Format",
  round(d."sizeBytes" / 1024.0)::int || ' KB'                    AS "Size",
  initcap(d."scanStatus"::text)                                  AS "Virus scan",
  CASE WHEN d."removedAt" IS NULL THEN 'Attached' ELSE 'Removed by candidate' END AS "State",
  reports.ist(d."uploadedAt")                                    AS "Uploaded (IST)",
  '/var/lib/srportal/storage/' || d."storageKey"                 AS "Path inside app container",
  d."uploadedAt"                                                 AS "Uploaded at",
  d.id                                                           AS "Document ID"
FROM application_documents d
JOIN applications a ON a.id = d."applicationId"
JOIN users u ON u.id = a."candidateId"
LEFT JOIN candidate_profiles p ON p."userId" = a."candidateId"
ORDER BY d."uploadedAt" DESC;

-- Generated application PDFs and consolidated bundles.
CREATE OR REPLACE VIEW reports.generated_pdfs AS
SELECT
  coalesce(a."referenceNo", '(draft)')                           AS "Reference No",
  CASE g.kind WHEN 'APPLICATION_PDF' THEN 'Application form' ELSE 'Consolidated bundle' END AS "Kind",
  g.version                                                      AS "Version",
  initcap(g.status::text)                                        AS "Status",
  coalesce(g."pageCount"::text, '—')                             AS "Pages",
  coalesce(round(g."sizeBytes" / 1024.0)::int || ' KB', '—')     AS "Size",
  coalesce(g.error, '')                                          AS "Error",
  reports.ist(g."createdAt")                                     AS "Requested (IST)",
  coalesce(reports.ist(g."completedAt"), '—')                    AS "Completed (IST)",
  coalesce('/var/lib/srportal/storage/' || g."storageKey", '—')  AS "Path inside app container"
FROM generated_documents g
JOIN applications a ON a.id = g."applicationId"
ORDER BY g."createdAt" DESC;
