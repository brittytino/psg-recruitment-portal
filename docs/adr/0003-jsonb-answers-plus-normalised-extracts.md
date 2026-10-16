# ADR 0003 — Versioned JSONB answers with normalised extracts

Status: Accepted

**Decision.** Form answers are stored as JSONB keyed by form-definition field keys, versioned by (formCode, formVersion), in drafts and in immutable revisions. Qualifications and employment are additionally extracted into relational tables at submission for filtering/reporting. Core entities (users, vacancies, applications, documents, reviews, history) are relational with foreign keys.
**Consequences.** Adding template versions does not require schema changes; reporting columns stay queryable.
