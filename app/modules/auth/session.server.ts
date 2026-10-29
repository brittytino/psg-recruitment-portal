import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import type { RoleGrant, RoleName } from "./permissions";

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  grants: RoleGrant[];
  sessionId: string;
}

export const hashToken = (s: string) => createHash("sha256").update(s).digest("hex");
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** The `__Host-` prefix requires Secure; it is used whenever cookies are Secure (HTTPS). */
export function cookieName(): string {
  return env().COOKIE_SECURE ? "__Host-srp_session" : "srp_session";
}

function serialize(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${cookieName()}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env().COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === cookieName()) {
      const token = v.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

/** Creates a new server-side session and returns the Set-Cookie header (always a fresh token). */
export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = env().SESSION_TTL_HOURS * 3600 * 1000;
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });
  return serialize(token, Math.floor(ttlMs / 1000));
}

export async function destroySession(request: Request): Promise<string> {
  const token = readSessionToken(request);
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  return serialize("", 0);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Resolves the signed-in user for a request, or null. Expired sessions are removed. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const id = hashToken(token);
  const s = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { roles: true, profile: { select: { fullName: true } } } } },
  });
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() <= now || s.user.status !== "ACTIVE") {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  if (now - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS)
    await prisma.session
      .update({ where: { id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => undefined);
  return {
    id: s.user.id,
    email: s.user.email,
    emailVerified: !!s.user.emailVerifiedAt,
    displayName: s.user.profile?.fullName ?? s.user.email,
    grants: s.user.roles.map((r) => ({
      role: r.role as RoleName,
      departmentId: r.departmentId,
    })),
    sessionId: id,
  };
}

/**
 * CSRF synchroniser token bound to the session (HMAC). Checked for every mutation in addition to
 * the Origin check and SameSite=Lax cookies (defence in depth).
 */
export function csrfToken(sessionId: string | null): string {
  return createHmac("sha256", env().SESSION_SECRET)
    .update(`csrf:${sessionId ?? "anonymous"}`)
    .digest("base64url");
}

export function verifyCsrf(sessionId: string | null, token: unknown): boolean {
  if (typeof token !== "string") return false;
  const expected = Buffer.from(csrfToken(sessionId));
  const got = Buffer.from(token);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
