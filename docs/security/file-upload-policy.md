# File upload policy

Implemented in `app/modules/documents/policy.ts`, `service.server.ts`, `scan.server.ts`.

| Rule            | Value                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowed types   | PDF, JPEG, PNG — determined from file signature, never from name or browser MIME                                                                                                       |
| Photograph      | JPEG/PNG only, ≤ 2 MB, 50–10 000 px per side; a new photo replaces the old one                                                                                                         |
| Other documents | ≤ `MAX_UPLOAD_MB` (default 10 MB); at most 10 files per document type                                                                                                                  |
| PDF checks      | must parse with pdf-lib and have ≥ 1 page; encrypted/password-protected PDFs rejected                                                                                                  |
| Malware         | every file scanned by ClamAV (clamd INSTREAM) asynchronously; INFECTED blocks submission and bundling; scanning cannot be disabled in production                                       |
| Storage         | random server-generated keys (`uploads/xx/<uuid>.ext`), owner-only file permissions, atomic writes, SHA-256 recorded and verified on read, private Docker volume never served directly |
| Names           | original filename sanitised for display only                                                                                                                                           |
| Changes         | allowed only while the application is editable; removal is a soft delete; bytes referenced by a submitted manifest are never deleted (DB trigger)                                      |
| Downloads       | authorised route only; candidates their own files, staff within record scope (audited); `attachment` disposition, `nosniff`, sandbox CSP, `no-store`                                   |
| Bundle          | non-PDF images converted to A4 pages; failed/infected attachments fail the bundle with an actionable message — never silently omitted                                                  |

Retention of uploads: **awaiting college policy** (see release readiness).
