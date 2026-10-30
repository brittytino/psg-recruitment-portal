import { audit } from "~/modules/audit/audit.server";
import { isSuperAdmin } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ForbiddenError } from "~/modules/core/errors";
import { redis } from "~/modules/core/redis.server";
import { requestRegeneration } from "~/modules/documents/service.server";
import { storageWritable } from "~/modules/documents/storage.server";
import { relayDownReason, ROUTINE_SHARE, sentToday } from "~/modules/notifications/budget.server";
import {
  relayConfigured,
  sendNotificationEmail,
  verifyRelay,
  verifySmtpConnection,
} from "~/modules/notifications/mailer.server";

/** Super Admin control centre: live system status and operations no other role can run. */
function requireSuperAdmin(user: SessionUser | null): SessionUser {
  if (!user || !isSuperAdmin(user.grants)) throw new ForbiddenError("Only the Super Admin can do this");
  return user;
}

const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export type CheckState = { ok: boolean; detail: string };

async function check(fn: () => Promise<string>, ms = 4000): Promise<CheckState> {
  try {
    return { ok: true, detail: await within(fn(), ms) };
  } catch (e) {
    return {
      ok: false,
      detail: (e as Error).message === "timeout" ? "No answer (timed out)" : "Not reachable",
    };
  }
}

export async function systemStatus(user: SessionUser | null) {
  requireSuperAdmin(user);
  const e = env();
  const [database, cache, storage, mail, converter] = await Promise.all([
    check(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return "Connected";
    }),
    check(async () => {
      await redis().ping();
      return "Connected";
    }),
    check(async () => {
      if (!(await storageWritable())) throw new Error("not writable");
      return "Writable";
    }),
    check(async () => {
      const r = await verifySmtpConnection(6000);
      if (!r.ok) throw new Error(r.message);
      return `Signed in as ${e.SMTP_USER || "(dev mail)"}`;
    }, 8000),
    check(async () => {
      const res = await fetch(`${e.CONVERTER_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error("down");
      return "Running";
    }),
  ]);
  const since = new Date(Date.now() - 24 * 3600_000);
  const istMidnight = new Date(
    `${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}T00:00:00+05:30`,
  );
  const [relaySent, gmailSent, relayCheck, relayPaused, mailSkipped, mailFailed] = await Promise.all([
    sentToday("relay"),
    sentToday("gmail"),
    relayConfigured() ? verifyRelay() : Promise.resolve(null),
    relayDownReason(),
    prisma.notification.count({
      where: { status: "IN_APP", error: { not: null }, createdAt: { gte: istMidnight } },
    }),
    prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: istMidnight } } }),
  ]);
  const [usersByRole, applications, sessions, failedPdfs, signIns24h, failedCodes24h] = await Promise.all([
    prisma.userRole.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.application.count({ where: { status: { not: "DRAFT" } } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.application.count({ where: { processingStatus: "FAILED" } }),
    prisma.auditEvent.count({ where: { action: "auth.login", createdAt: { gte: since } } }),
    prisma.auditEvent.count({ where: { action: "auth.otp_failed", createdAt: { gte: since } } }),
  ]);
  return {
    checks: [
      { name: "Database", ...database },
      { name: "Redis (queue and rate limits)", ...cache },
      { name: "File storage", ...storage },
      { name: "E-mail (sign-in codes)", ...mail },
      { name: "PDF converter", ...converter },
    ],
    counts: {
      usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])) as Record<
        string,
        number
      >,
      applications,
      sessions,
      failedPdfs,
      signIns24h,
      failedCodes24h,
    },
    mail: {
      relay: relayConfigured()
        ? {
            host: e.SMTP_RELAY_HOST,
            ok: !!relayCheck?.ok && !relayPaused,
            detail: relayPaused
              ? `Paused after a failure (${relayPaused}); the Gmail account is used meanwhile`
              : (relayCheck?.message ?? ""),
            sent: relaySent,
            budget: e.MAIL_RELAY_DAILY_BUDGET,
          }
        : null,
      gmail: {
        sent: gmailSent,
        budget: e.MAIL_DAILY_BUDGET,
        routineLimit: Math.floor(e.MAIL_DAILY_BUDGET * ROUTINE_SHARE),
      },
      skipped: mailSkipped,
      failed: mailFailed,
    },
    version: process.env.GIT_SHA ?? "dev",
    mailFrom: e.SMTP_FROM_EMAIL,
  };
}

/** Queues a fresh PDF for every application whose document generation failed. */
export async function retryFailedPdfs(user: SessionUser | null, ip?: string) {
  const u = requireSuperAdmin(user);
  const failed = await prisma.application.findMany({
    where: { processingStatus: "FAILED" },
    select: { id: true },
    take: 300,
  });
  let queued = 0;
  for (const a of failed) {
    try {
      await requestRegeneration(u, a.id, ip);
      queued++;
    } catch {
      /* already running or not eligible: skip */
    }
  }
  await audit({
    actorId: u.id,
    action: "system.pdfs_retried",
    entityType: "system",
    ip,
    metadata: { count: queued },
  });
  return queued;
}

/** Ends every session except the Super Admin's own (e.g. after a suspected compromise). */
export async function signOutEveryoneElse(user: SessionUser | null, ip?: string) {
  const u = requireSuperAdmin(user);
  const { count } = await prisma.session.deleteMany({ where: { id: { not: u.sessionId } } });
  await audit({
    actorId: u.id,
    action: "system.all_sessions_revoked",
    entityType: "system",
    ip,
    metadata: { count },
  });
  return count;
}

/** Sends a test e-mail to the Super Admin right now (not queued) and reports the result. */
export async function sendTestEmail(user: SessionUser | null, ip?: string) {
  const u = requireSuperAdmin(user);
  await sendNotificationEmail(
    u.email,
    "PSG Tech recruitment portal: test e-mail",
    "This test e-mail was sent from the Super Admin control centre. E-mail delivery is working.",
  );
  await audit({ actorId: u.id, action: "system.test_email_sent", entityType: "system", ip });
}
