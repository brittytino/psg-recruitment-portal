import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";
import { dummyHash, hashPassword, passwordProblems, verifyPassword } from "./password.server";
import { rateLimit } from "./rate-limit.server";
import { createSession, destroyAllSessions, hashToken } from "./session.server";

export { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";
import { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";

const VERIFY_TTL_MS = 48 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(200),
    password: z.string().max(128),
    confirmPassword: z.string(),
    privacy: z.literal("on", { error: "You must accept the privacy notice to continue" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMs: number) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/**
 * Registers a candidate. Always responds the same way whether or not the e-mail already exists,
 * so registration cannot be used to enumerate accounts; an existing user receives a notice instead.
 */
export async function registerCandidate(input: unknown, ip: string): Promise<void> {
  await rateLimit("register", ip, 10, 3600);
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      "Please correct the highlighted fields",
      z.flattenError(parsed.error).fieldErrors,
    );
  const { fullName, email, password } = parsed.data;
  const problems = passwordProblems(password, email);
  if (problems.length) throw new ValidationError("Please choose a stronger password", { password: problems });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.$transaction(async (tx) => {
      await notify(
        tx,
        existing.id,
        "account.exists",
        "Registration attempt for your account",
        "Someone tried to register a new account with your e-mail address. If this was you, sign in or reset your password instead. If not, you can ignore this message.",
      );
    });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        passwordHash,
        roles: { create: { role: "CANDIDATE" } },
        profile: {
          create: { fullName, privacyVersion: PRIVACY_NOTICE_VERSION, privacyAcceptedAt: new Date() },
        },
      },
    });
    await audit({ actorId: u.id, action: "account.registered", entityType: "user", entityId: u.id, ip }, tx);
    return u;
  });
  await sendVerification(user.id);
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

export type LoginResult = { ok: true; setCookie: string; userId: string } | { ok: false; message: string };

const GENERIC_LOGIN_ERROR = "The e-mail address or password is incorrect.";

/** Password login with per-account lockout and per-IP/per-account rate limits. */
export async function login(
  emailRaw: string,
  password: string,
  ip: string,
  userAgent: string | null,
): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit("login-ip", ip, 30, 900);
  await rateLimit("login-account", hashToken(email), 10, 900);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyPassword(await dummyHash(), password);
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }
  if (user.lockedUntil && user.lockedUntil > new Date())
    return {
      ok: false,
      message:
        "This account is temporarily locked after repeated failed sign-in attempts. Try again later or reset your password.",
    };
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid || user.status !== "ACTIVE") {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({
      actorId: user.id,
      action: "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      ip,
      metadata: { failed },
    });
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const setCookie = await createSession(user.id, userAgent);
  await audit({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip });
  return { ok: true, setCookie, userId: user.id };
}

/** Starts password recovery. Identical response whether or not the account exists. */
export async function requestPasswordReset(emailRaw: string, ip: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit("reset-ip", ip, 10, 3600);
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
  await rateLimit("reset-confirm", ip, 20, 3600);
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
