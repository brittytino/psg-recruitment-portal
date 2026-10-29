import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";
import { hashPassword, passwordProblems } from "./password.server";
import { issueOtp, verifyOtp } from "./otp.server";
import { perIp, rateLimit, refundRateLimit } from "./rate-limit.server";
import { createSession, destroyAllSessions, hashToken } from "./session.server";

export { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";
import { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";

const VERIFY_TTL_MS = 48 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(200),
  phone: z.string().trim().optional().or(z.literal("")),
  privacy: z.literal("on", { error: "You must accept the privacy notice to continue" }),
});

async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMs: number) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/**
 * Registers a candidate with passwordless email OTP verification.
 */
export async function registerCandidate(input: unknown, ip: string): Promise<string> {
  await rateLimit("register", ip, perIp(10), 3600);
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      "Please correct the highlighted fields",
      z.flattenError(parsed.error).fieldErrors,
    );
  const { fullName, email, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  if (existing) {
    const isCand = existing.roles.some((r) => r.role === "CANDIDATE");
    if (isCand && existing.status === "ACTIVE") {
      return await issueOtp(existing.id, "LOGIN", ip);
    }
    await prisma.$transaction(async (tx) => {
      await notify(
        tx,
        existing.id,
        "account.exists",
        "Sign-in attempt for your account",
        "Someone tried to register with your e-mail address on the PSG Tech Staff Recruitment Portal. Sign in using your email address to receive a one-time code.",
      );
    });
    return randomUUID();
  }

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        status: "ACTIVE",
        roles: { create: { role: "CANDIDATE" } },
        profile: {
          create: {
            fullName,
            phone: phone || null,
            privacyVersion: PRIVACY_NOTICE_VERSION,
            privacyAcceptedAt: new Date(),
          },
        },
      },
    });
    await audit({ actorId: u.id, action: "account.registered", entityType: "user", entityId: u.id, ip }, tx);
    return u;
  });

  return await issueOtp(user.id, "LOGIN", ip);
}

/** Verifies a candidate's e-mail address with the 6-digit code. */
export async function verifyEmailByOtp(challengeId: string, code: string, ip: string): Promise<boolean> {
  const r = await verifyOtp(challengeId, code, "EMAIL_VERIFICATION", ip);
  if (!r.ok) return false;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: r.userId }, data: { emailVerifiedAt: new Date() } });
    await audit(
      { actorId: r.userId, action: "account.email_verified", entityType: "user", entityId: r.userId, ip },
      tx,
    );
  });
  return true;
}

/** Sends a fresh verification code to a signed-in candidate. */
export async function resendEmailOtp(userId: string, ip: string): Promise<string> {
  return issueOtp(userId, "EMAIL_VERIFICATION", ip);
}

export async function sendVerification(userId: string): Promise<void> {
  const token = await issueToken(userId, "EMAIL_VERIFICATION", VERIFY_TTL_MS);
  const link = `${env().APP_ORIGIN}/verify-email?token=${token}`;
  await prisma.$transaction(async (tx) => {
    await notify(
      tx,
      userId,
      "account.verify",
      "Verify your e-mail address — PSG Tech Recruitment",
      `Please confirm your e-mail address to activate your recruitment account:\n\n${link}\n\nThis link expires in 48 hours.`,
    );
  });
}

export async function verifyEmail(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!t || t.type !== "EMAIL_VERIFICATION" || t.usedAt || t.expiresAt < new Date()) return false;
  await prisma.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
    await audit(
      { actorId: t.userId, action: "account.email_verified", entityType: "user", entityId: t.userId },
      tx,
    );
  });
  return true;
}

export type LoginResult =
  | { ok: true; setCookie: string; userId: string }
  | { ok: "otp"; challengeId: string; userId: string }
  | { ok: false; message: string };

export type RequestOtpResult =
  { ok: true; challengeId: string; email: string } | { ok: false; message: string };

/**
 * Initiates passwordless e-mail OTP login for all users (candidates and staff).
 */
export async function requestLoginOtp(emailRaw: string, ip: string): Promise<RequestOtpResult> {
  const email = emailRaw.trim().toLowerCase();
  const valid = z.string().email().safeParse(email);
  if (!valid.success) return { ok: false, message: "Enter a valid e-mail address." };

  await rateLimit("login-ip", ip, perIp(30), 900);
  await rateLimit("login-account", hashToken(email), 10, 900);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return {
      ok: false,
      message:
        "No account found with this e-mail address. If you are an applicant, please create an account first.",
    };
  }

  if (user.status === "DISABLED") {
    return {
      ok: false,
      message: "This account has been disabled. Please contact the recruitment office.",
    };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      ok: false,
      message: "This account is temporarily locked after repeated failed attempts. Please try again later.",
    };
  }

  try {
    const challengeId = await issueOtp(user.id, "LOGIN", ip);
    return { ok: true, challengeId, email };
  } catch (err) {
    // The per-account login limit should only count codes that were actually sent.
    await refundRateLimit("login-account", hashToken(email)).catch(() => undefined);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "The code could not be sent. Please try again shortly.",
    };
  }
}

/** Verifies the e-mailed code and creates the session for any user. */
export async function completeLoginWithOtp(
  challengeId: string,
  code: string,
  ip: string,
  userAgent: string | null,
): Promise<LoginResult> {
  const r = await verifyOtp(challengeId, code, "LOGIN", ip);
  if (!r.ok) return r;
  const user = await prisma.user.findUnique({ where: { id: r.userId } });
  if (!user || user.status !== "ACTIVE") return { ok: false, message: "This account cannot sign in." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });

  const setCookie = await createSession(user.id, userAgent);
  await audit({
    actorId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ip,
    metadata: { otp: true },
  });
  return { ok: true, setCookie, userId: user.id };
}

export async function resendLoginOtp(challengeId: string, ip: string): Promise<string> {
  const c = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!c) throw new ValidationError("Sign in again to receive a new code.");
  return issueOtp(c.userId, c.purpose, ip);
}

/** Passwordless login with rate limits and instant OTP issue. */
export async function login(
  emailRaw: string,
  _password: string,
  ip: string,
  _userAgent: string | null,
): Promise<LoginResult> {
  const r = await requestLoginOtp(emailRaw, ip);
  if (!r.ok) return { ok: false, message: r.message };
  const user = await prisma.user.findUniqueOrThrow({ where: { email: emailRaw.trim().toLowerCase() } });
  return { ok: "otp", challengeId: r.challengeId, userId: user.id };
}

/** Starts password recovery. Identical response whether or not the account exists. */
export async function requestPasswordReset(emailRaw: string, ip: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit("reset-ip", ip, perIp(10), 3600);
  await rateLimit("reset-account", hashToken(email), 3, 3600);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", RESET_TTL_MS);
  const link = `${env().APP_ORIGIN}/reset-password?token=${token}`;
  await prisma.$transaction(async (tx) => {
    await notify(
      tx,
      user.id,
      "account.reset",
      "Reset your password — PSG Tech Recruitment",
      `A password reset was requested for your account. Use this link within 60 minutes:\n\n${link}\n\nIf you did not request this, you can ignore this message; your password is unchanged.`,
    );
    await audit(
      { actorId: user.id, action: "account.reset_requested", entityType: "user", entityId: user.id, ip },
      tx,
    );
  });
}

export async function resetPassword(token: string, password: string, ip: string): Promise<void> {
  await rateLimit("reset-confirm", ip, perIp(20), 3600);
  const invalid = new ValidationError("This reset link is invalid or has expired. Please request a new one.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid;
  const t = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!t || t.type !== "PASSWORD_RESET" || t.usedAt || t.expiresAt < new Date()) throw invalid;
  const problems = passwordProblems(password, t.user.email);
  if (problems.length) throw new ValidationError("Please choose a stronger password", { password: problems });
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    // Reset proves control of the mailbox, so it also verifies the e-mail and clears the lockout.
    await tx.user.update({
      where: { id: t.userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: t.user.emailVerifiedAt ?? new Date(),
      },
    });
    await audit(
      { actorId: t.userId, action: "account.password_reset", entityType: "user", entityId: t.userId, ip },
      tx,
    );
  });
  await destroyAllSessions(t.userId);
}
