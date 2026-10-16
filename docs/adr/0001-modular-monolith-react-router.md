# ADR 0001 — Modular monolith on React Router v7 Framework Mode

Status: Accepted (2026-10-16)

**Context.** Two developers, one institution, a workflow that is transactional end to end.
**Decision.** One TypeScript application (React Router 7.18.4, SSR) with loaders/actions as the only API, domain modules under `app/modules`, and one separate worker process from the same codebase/image. No separate API server.
**Consequences.** One deployable image; strong typing across UI and server; microservice split possible later along module boundaries. React Router 8 exists but the brief requires v7; v7 is pinned (`version-7` dist-tag).
