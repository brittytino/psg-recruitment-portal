# Entity-relationship diagram

Source of truth: `prisma/schema.prisma`. All ids are UUIDs; `applications.referenceNo` is the human-readable id.

```mermaid
erDiagram
  users ||--o{ user_roles : has
  users ||--o{ sessions : has
  users ||--o{ auth_tokens : has
  users ||--o| candidate_profiles : has
  departments ||--o{ disciplines : has
  departments ||--o{ vacancies : offers
  recruitment_cycles ||--o{ vacancies : contains
  form_templates ||--o{ vacancies : "official form version"
  vacancies ||--o{ eligibility_criteria : has
  vacancies ||--o{ required_documents : requires
  users ||--o{ applications : submits
  vacancies ||--o{ applications : receives
  applications ||--o{ application_revisions : "immutable snapshots"
  applications |o--|| application_revisions : "current revision"
  application_revisions ||--o{ qualifications : extracts
  application_revisions ||--o{ employment_records : extracts
  applications ||--o{ application_documents : uploads
  applications ||--o{ generated_documents : "PDF versions"
  application_revisions ||--o{ generated_documents : "rendered from"
  applications ||--o{ application_status_history : history
  applications ||--o{ review_assignments : assigned
  users ||--o{ review_assignments : reviewer
  applications ||--o{ reviews : reviewed
  users ||--o{ audit_events : actor
  users ||--o{ notifications : receives
```

`outbox_events` and `reference_counters` are infrastructure tables without foreign keys.

## Integrity rules

- Unique: `users.email`, `(candidateId, vacancyId)`, `(applicationId, revisionNo)`, `(code, version)` on templates, `(revisionId, kind, version)` on generated documents, `(applicationId, reviewerId, stage)` on assignments.
- CHECK: date windows, positive sizes/posts, review score 0–100, lower-case e-mail, submitted applications must have reference + revision.
- Triggers: append-only `application_revisions`, `audit_events`, `application_status_history`, `reviews`, `qualifications`, `employment_records`; `application_documents` content immutable and undeletable; `generated_documents` write-once once READY.
- Indexes: vacancy+status, status+submittedAt, submittedAt, department, candidate name, audit entity/actor/time.
- Answers are stored as versioned JSONB (`revision.answers`, keyed by form-definition field keys) with qualifications and employment normalised for filtering (ADR 0003).
