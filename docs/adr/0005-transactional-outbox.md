# ADR 0005 — Transactional outbox for jobs and e-mail

Status: Accepted

**Decision.** Side effects are written to `outbox_events` inside the business transaction. The worker relays rows to BullMQ with `FOR UPDATE SKIP LOCKED` and uses the outbox id as job id (exactly-once enqueue, safe with several workers during blue-green). Job payloads are versioned (`v`).
**Consequences.** No e-mail for rolled-back changes, no lost jobs on crash; small relay latency (≤1 s).
