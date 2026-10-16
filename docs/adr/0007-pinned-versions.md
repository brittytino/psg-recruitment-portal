# ADR 0007 — Dependency and image versions

Status: Accepted

Pinned exact versions; lockfile committed. Notable: React Router 7.18.4, TypeScript 5.9.3 (RR 7 peer range excludes TS 7), Vite 7.3.7, Prisma 6.19.3 (Prisma 8 is still RC; 7 needs config migration), BullMQ 5.81.5 (6.x is new), ioredis 5.11.1, Node 22.22.0 LTS, PostgreSQL 17.6, Redis 7.4.6, ClamAV 1.4.3, Nginx 1.28.0.
Known advisory: deepmerge-ts via @prisma/config (CLI-time config loading, not request path). Tracked in the risk register; resolve by upgrading to Prisma 7 in a dedicated change.
