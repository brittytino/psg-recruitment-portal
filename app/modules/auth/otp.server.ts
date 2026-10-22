import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpPurpose } from "@prisma/client";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";
import { redis } from "~/modules/core/redis.server";
import { sendOtpEmail } from "~/modules/notifications/mailer.server";
import { rateLimit } from "./rate-limit.server";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
const SENDS_PER_HOUR = 5;

const PURPOSE_TEXT: Record<OtpPurpose, string> = {
  STAFF_LOGIN: "signing in",
  EMAIL_VERIFICATION: "verifying your e-mail address",
};

/** 6-digit code from a CSPRNG (leading zeros kept). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC of the code bound to the challenge id; the code itself is never stored. */
export function codeHash(challengeId: string, code: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(`otp:${challengeId}:${code}`).digest("hex");
}

/**
 * Creates a challenge and e-mails the code. Earlier open challenges of the same purpose are
 * closed. Sends are limited per user and per IP with a 60-second resend cooldown.
 */
export async function issueOtp(userId: string, purpose: OtpPurpose, ip: string): Promise<string> {
  const r = redis();
  const cooldownKey = `otp:cooldown:${purpose}:${userId}`;
  const ttl = await r.ttl(cooldownKey);
  if (ttl > 0) throw new ConflictError(`Please wait ${ttl} seconds before requesting another code.`);
  await rateLimit(`otp-send-${purpose}`, userId, SENDS_PER_HOUR, 3600);
  await rateLimit("otp-send-ip", ip, SENDS_PER_HOUR * 4, 3600);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const code = generateCode();
  const challenge = await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const c = await tx.otpChallenge.create({
      data: {
        userId,
        purpose,
        codeHash: "pending",
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        ip: ip.slice(0, 64),
      },
    });
    await tx.otpChallenge.update({ where: { id: c.id }, data: { codeHash: codeHash(c.id, code) } });
    return c;
  });
  await r.set(cooldownKey, "1", "EX", OTP_RESEND_SECONDS);
  if (env().DEV_LOG_OTP) logger.warn({ email: user.email, purpose }, `DEV OTP ${code}`);
  try {
    await sendOtpEmail(user.email, code, PURPOSE_TEXT[purpose], OTP_TTL_MINUTES);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "otp e-mail failed");
    if (!env().DEV_LOG_OTP)
      throw new ConflictError("The code could not be e-mailed. Please try again shortly.");
  }
  await audit({
    actorId: userId,
    action: "auth.otp_sent",
    entityType: "user",
    entityId: userId,
    ip,
    metadata: { purpose },
  });
  return challenge.id;
}

export type OtpCheck = { ok: true; userId: string } | { ok: false; message: string };

/** Verifies a code: single use, unexpired, at most 5 attempts, constant-time comparison. */
export async function verifyOtp(
  challengeId: string,
  codeRaw: string,
  purpose: OtpPurpose,
  ip: string,
): Promise<OtpCheck> {
  const code = codeRaw.replace(/\s/g, "");
  const invalid: OtpCheck = {
    ok: false,
    message: "The code is incorrect or has expired. Request a new code.",
  };
  if (!/^[0-9a-f-]{36}$/.test(challengeId)) return invalid;
  await rateLimit("otp-verify-ip", ip, 60, 900);
  const c = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (
    !c ||
    c.purpose !== purpose ||
    c.consumedAt ||
    c.expiresAt < new Date() ||
    c.attempts >= OTP_MAX_ATTEMPTS
  )
    return invalid;
  // Count the attempt first so parallel guesses cannot exceed the limit.
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: c.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return invalid;
  const expected = Buffer.from(c.codeHash);
  const got = Buffer.from(/^\d{6}$/.test(code) ? codeHash(c.id, code) : "x".repeat(expected.length));
  if (!(expected.length === got.length && timingSafeEqual(expected, got))) {
    await audit({
      actorId: c.userId,
      action: "auth.otp_failed",
      entityType: "user",
      entityId: c.userId,
      ip,
      metadata: { purpose, attempts: c.attempts + 1 },
    });
    const left = OTP_MAX_ATTEMPTS - (c.attempts + 1);
    return {
      ok: false,
      message:
        left > 0 ? `The code is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.` : invalid.message,
    };
  }
  const used = await prisma.otpChallenge.updateMany({
    where: { id: c.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (used.count !== 1) return invalid;
  await audit({
    actorId: c.userId,
    action: "auth.otp_verified",
    entityType: "user",
    entityId: c.userId,
    ip,
    metadata: { purpose },
  });
  return { ok: true, userId: c.userId };
}

// ------------------------------------------------------------------------------------------------
// Pending sign-in cookie: carries the challenge id between the password step and the code step.
// ------------------------------------------------------------------------------------------------
const PENDING_COOKIE = "srp_otp";

const sign = (v: string) =>
  createHmac("sha256", env().SESSION_SECRET).update(`pending:${v}`).digest("base64url");

export function pendingCookie(challengeId: string, next: string): string {
  const value = Buffer.from(JSON.stringify({ c: challengeId, n: next })).toString("base64url");
  const parts = [
    `${PENDING_COOKIE}=${value}.${sign(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OTP_TTL_MINUTES * 60}`,
  ];
  if (env().COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}

export function clearPendingCookie(): string {
  return `${PENDING_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env().COOKIE_SECURE ? "; Secure" : ""}`;
}

export function readPending(request: Request): { challengeId: string; next: string } | null {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${PENDING_COOKIE}=`))
    ?.slice(PENDING_COOKIE.length + 1);
  if (!raw) return null;
  const [value, mac] = raw.split(".");
  if (!value || !mac) return null;
  const a = Buffer.from(sign(value));
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { c: string; n: string };
    return { challengeId: o.c, next: o.n };
  } catch {
    return null;
  }
}
