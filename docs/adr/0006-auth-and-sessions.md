# ADR 0006 — First-party authentication with server-side sessions

Status: Accepted

**Context.** Remix Auth / third-party libraries add little for password login and have changed APIs frequently.
**Decision.** Argon2id (@node-rs/argon2, OWASP parameters), opaque 256-bit session tokens stored only as SHA-256 in `sessions`, HttpOnly + SameSite=Lax (+Secure and `__Host-` prefix in production) cookies, session rotation on login, revocation on reset/disable. CSRF: Origin check in middleware + React Router's own action origin check + HMAC synchroniser token. Rate limits in Redis; account lockout after 8 failures.
**Consequences.** Small, auditable code. SSO (college identity provider) can be added later for staff.
