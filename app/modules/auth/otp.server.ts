import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpPurpose } from "@prisma/client";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";
import { redis } from "~/modules/core/redis.server";
import { sendOtpEmail } from "~/modules/notifications/mailer.server";
import { rateLimit, refundRateLimit } from "./rate-limit.server";

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;

export function getOtpConfig() {
  const e = env();
  return {
    length: e.OTP_LENGTH ?? 6,
    expiryMinutes: e.OTP_EXPIRY_MINUTES ?? 5,
    resendCooldownSeconds: e.OTP_RESEND_COOLDOWN_SECONDS ?? 60,
    maxAttempts: e.OTP_MAX_ATTEMPTS ?? 5,
    maxSendsPerHour: e.OTP_MAX_SENDS_PER_HOUR ?? 5,
  };
}

const PURPOSE_TEXT: Record<OtpPurpose, string> = {
  STAFF_LOGIN: "signing in",
  EMAIL_VERIFICATION: "verifying your e-mail address",
  LOGIN: "signing in",
};

/** 6-digit code from a CSPRNG (leading zeros kept). */
export function generateCode(length = 6): string {
  const max = Math.pow(10, length);
  return String(randomInt(0, max)).padStart(length, "0");
}

/** HMAC of the code bound to the challenge id; the code itself is never stored. */
export function codeHash(challengeId: string, code: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(`otp:${challengeId}:${code}`).digest("hex");
}

/**
 * Creates a challenge and e-mails the code. Earlier open challenges of the same purpose are
 * closed. Sends are limited per user and per IP with a resend cooldown.
 */
export async function issueOtp(userId: string, purpose: OtpPurpose, ip: string): Promise<string> {
  const cfg = getOtpConfig();
  const r = redis();
  const cooldownKey = `otp:cooldown:${purpose}:${userId}`;
  const ttl = await r.ttl(cooldownKey);
  if (ttl > 0) throw new ConflictError(`Please wait ${ttl} seconds before requesting another code.`);
  await rateLimit(`otp-send-${purpose}`, userId, cfg.maxSendsPerHour, 3600);
  await rateLimit("otp-send-ip", ip, cfg.maxSendsPerHour * 4, 3600);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const code = generateCode(cfg.length);
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
        expiresAt: new Date(Date.now() + cfg.expiryMinutes * 60_000),
        ip: ip.slice(0, 64),
      },
    });
    await tx.otpChallenge.update({ where: { id: c.id }, data: { codeHash: codeHash(c.id, code) } });
    return c;
  });
  await r.set(cooldownKey, "1", "EX", cfg.resendCooldownSeconds);
  if (env().DEV_LOG_OTP) logger.warn({ email: user.email, purpose }, `DEV OTP ${code}`);
  try {
    await sendOtpEmail(user.email, code, PURPOSE_TEXT[purpose] ?? "authentication", cfg.expiryMinutes);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "otp e-mail failed");
    // Clean up immediately so user is not locked out with an undelivered challenge
    await prisma.otpChallenge
      .updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      })
      .catch(() => undefined);
    await r.del(cooldownKey).catch(() => undefined);
    // A mail outage is not the user's fault: do not count this attempt against their limits.
    await refundRateLimit(`otp-send-${purpose}`, userId).catch(() => undefined);
    await refundRateLimit("otp-send-ip", ip).catch(() => undefined);
    if (!env().DEV_LOG_OTP)
      throw new ConflictError(
        "We could not send the sign-in code because the e-mail service is unreachable. Please try again in a few minutes or contact the recruitment office.",
      );
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

/** Verifies a code: single use, unexpired, within max attempts, constant-time comparison. */
export async function verifyOtp(
  challengeId: string,
  codeRaw: string,
  purpose: OtpPurpose,
  ip: string,
): Promise<OtpCheck> {
  const cfg = getOtpConfig();
  const code = codeRaw.replace(/\s/g, "");
  const invalid: OtpCheck = {
    ok: false,
    message: "The code is incorrect or has expired. Request a new code.",
  };
  if (!/^[0-9a-f-]{36}$/.test(challengeId)) return invalid;
  await rateLimit("otp-verify-ip", ip, 60, 900);
  const c = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  const isLoginPurpose = (p: OtpPurpose) => p === "STAFF_LOGIN" || p === "LOGIN";
  const purposeMatches =
    c && (c.purpose === purpose || (isLoginPurpose(purpose) && isLoginPurpose(c.purpose)));
  if (!c || !purposeMatches || c.consumedAt || c.expiresAt < new Date() || c.attempts >= cfg.maxAttempts)
    return invalid;
  // Count the attempt first so parallel guesses cannot exceed the limit.
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: c.id, consumedAt: null, attempts: { lt: cfg.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return invalid;
  const expected = Buffer.from(c.codeHash);
  const codeRegex = new RegExp(`^\\d{${cfg.length}}$`);
  const got = Buffer.from(codeRegex.test(code) ? codeHash(c.id, code) : "x".repeat(expected.length));
  if (!(expected.length === got.length && timingSafeEqual(expected, got))) {
    const attemptsUsed = c.attempts + 1;
    // If attempts are exhausted, immediately mark consumed
    if (attemptsUsed >= cfg.maxAttempts) {
      await prisma.otpChallenge
        .updateMany({
          where: { id: c.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        .catch(() => undefined);
    }
    await audit({
      actorId: c.userId,
      action: "auth.otp_failed",
      entityType: "user",
      entityId: c.userId,
      ip,
      metadata: { purpose, attempts: attemptsUsed },
    });
    const left = cfg.maxAttempts - attemptsUsed;
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
// Pending sign-in cookie: carries the challenge id between email submission and code verification.
// ------------------------------------------------------------------------------------------------
const PENDING_COOKIE = "srp_otp";

const sign = (v: string) =>
  createHmac("sha256", env().SESSION_SECRET).update(`pending:${v}`).digest("base64url");

export function pendingCookie(challengeId: string, next: string): string {
  const cfg = getOtpConfig();
  const value = Buffer.from(JSON.stringify({ c: challengeId, n: next })).toString("base64url");
  const parts = [
    `${PENDING_COOKIE}=${value}.${sign(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${cfg.expiryMinutes * 60}`,
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
