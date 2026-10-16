# ADR 0004 — Separate document-processing status from recruitment status

Status: Accepted

**Context.** The brief suggested PROCESSING_DOCUMENTS / DOCUMENTS_READY as recruitment states but also required that recruitment and document state be separated.
**Decision.** `applications.processingStatus` (NOT_STARTED/QUEUED/PROCESSING/READY/FAILED) is independent of `status`. Forwarding to department review requires READY.
**Consequences.** A failed PDF job cannot alter or corrupt a valid submission.
