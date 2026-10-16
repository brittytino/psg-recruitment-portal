# Application workflow

Implemented in `app/modules/applications/workflow.ts` (pure) and enforced by `service.server.ts`.
**This model is an initial proposal and must be reviewed against college policy before production.**

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED: candidate submits
  DRAFT --> WITHDRAWN: candidate
  SUBMITTED --> UNDER_HR_REVIEW: HR starts screening
  UNDER_HR_REVIEW --> NEEDS_CLARIFICATION: HR (reason)
  NEEDS_CLARIFICATION --> SUBMITTED: candidate resubmits (new revision)
  UNDER_HR_REVIEW --> UNDER_DEPARTMENT_REVIEW: HR (PDF must be READY)
  UNDER_HR_REVIEW --> REJECTED: HR (reason)
  UNDER_DEPARTMENT_REVIEW --> UNDER_HR_REVIEW: HR (reason)
  UNDER_DEPARTMENT_REVIEW --> SHORTLISTED: HR (≥1 department review)
  UNDER_DEPARTMENT_REVIEW --> REJECTED: HR (reason, ≥1 department review)
  SHORTLISTED --> APPROVED: HR (reason)
  SHORTLISTED --> REJECTED: HR (reason)
  SUBMITTED --> WITHDRAWN: candidate (reason)
  UNDER_HR_REVIEW --> WITHDRAWN
  UNDER_DEPARTMENT_REVIEW --> WITHDRAWN
  NEEDS_CLARIFICATION --> WITHDRAWN
  SHORTLISTED --> WITHDRAWN
```

Every transition: current state re-checked inside the transaction (`updateMany where status = current`), actor permission and scope verified, reason validated where required, history row + audit event written, candidate notification queued via the outbox only for decision states.

## Document processing status (separate)

`NOT_STARTED → QUEUED → PROCESSING → READY | FAILED`. The spec's suggested `PROCESSING_DOCUMENTS` / `DOCUMENTS_READY` recruitment states were deliberately replaced by this separate field (ADR 0004), so a failed PDF job never changes or corrupts the recruitment state.

## Open policy decisions

- Who may record the final APPROVED decision (currently HR officer; may need HOD/committee).
- Whether withdrawal after shortlisting is allowed; whether one application per vacancy is correct.
- Whether clarification resubmission is allowed after the closing date (currently allowed).
