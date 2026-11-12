import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { isSuperAdmin } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ForbiddenError, ValidationError } from "~/modules/core/errors";
import { redis } from "~/modules/core/redis.server";
import { requestRegeneration } from "~/modules/documents/service.server";
import { storageWritable } from "~/modules/documents/storage.server";
import {
  channelSentToday,
  clearChannelCooldown,
  getChannelCooldown,
  ROUTINE_SHARE,
  type MailChannelId,
} from "~/modules/notifications/budget.server";
import {
  sendChannelTestEmail,
  sendNotificationEmail,
  verifyChannelConnection,
  resetTransporterForTesting,
  type MailDeliveryOutcome,
} from "~/modules/notifications/mailer.server";
import { activeSenderEmail, loadRuntimeConfig, type MailChannelConfig } from "./runtime-config.server";

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
      detail: (e as Error).message === "timeout" ? "No answer (timed out)" : (e as Error).message || "Not reachable",
    };
  }
}

async function checkMailChannel(ch: MailChannelConfig): Promise<CheckState> {
  if (!ch.enabled) return { ok: false, detail: "Channel disabled" };
  return check(async () => {
    const r = await verifyChannelConnection(ch.id, 6000);
    if (!r.ok) throw new Error(r.message);
    if (ch.transport === "brevo-api") {
      return `Brevo HTTPS API ready (${ch.fromEmail || "sender configured"})`;
    }
    return `Signed in as ${ch.user || ch.host || "(dev mail)"}`;
  }, 8000);
}

export async function systemStatus(user: SessionUser | null) {
  requireSuperAdmin(user);
  const e = env();
  const { mail: mailCfg } = await loadRuntimeConfig(true);

  const [database, cache, storage, primaryState, fallbackState, converter] = await Promise.all([
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
    checkMailChannel(mailCfg.primary),
    mailCfg.fallback.enabled
      ? checkMailChannel(mailCfg.fallback)
      : Promise.resolve<CheckState>({ ok: false, detail: "Not enabled" }),
    check(async () => {
      const res = await fetch(`${e.CONVERTER_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error("down");
      return "Running";
    }),
  ]);

  const mailCheck: CheckState =
    mailCfg.strategy === "fallback-only"
      ? fallbackState
      : primaryState.ok
        ? primaryState
        : mailCfg.fallback.enabled && fallbackState.ok
          ? { ok: true, detail: `Failover active (${fallbackState.detail})` }
          : primaryState;

  const since = new Date(Date.now() - 24 * 3600_000);
  const istMidnight = new Date(
    `${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}T00:00:00+05:30`,
  );

  const [
    primarySent,
    fallbackSent,
    primaryCooldown,
    fallbackCooldown,
    mailSkipped,
    mailFailed,
    usersByRole,
    applications,
    sessions,
    failedPdfs,
    signIns24h,
    failedCodes24h,
  ] = await Promise.all([
    channelSentToday(mailCfg.primary),
    channelSentToday(mailCfg.fallback),
    getChannelCooldown(mailCfg.primary),
    getChannelCooldown(mailCfg.fallback),
    prisma.notification.count({
      where: { status: "IN_APP", error: { not: null }, createdAt: { gte: istMidnight } },
    }),
    prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: istMidnight } } }),
    prisma.userRole.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.application.count({ where: { status: { not: "DRAFT" } } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.application.count({ where: { processingStatus: "FAILED" } }),
    prisma.auditEvent.count({ where: { action: "auth.login", createdAt: { gte: since } } }),
    prisma.auditEvent.count({ where: { action: "auth.otp_failed", createdAt: { gte: since } } }),
  ]);

  const primaryChannel = {
    id: mailCfg.primary.id,
    label: mailCfg.primary.label || "Primary",
    enabled: mailCfg.primary.enabled,
    transport: mailCfg.primary.transport,
    host: mailCfg.primary.host,
    port: mailCfg.primary.port,
    fromEmail: mailCfg.primary.fromEmail,
    ok: primaryState.ok,
    detail: primaryState.detail,
    sent: primarySent,
    budget: mailCfg.primary.dailyBudget,
    routineLimit: Math.floor(mailCfg.primary.dailyBudget * ROUTINE_SHARE),
    cooldown: primaryCooldown,
  };

  const fallbackChannel = {
    id: mailCfg.fallback.id,
    label: mailCfg.fallback.label || "Fallback",
    enabled: mailCfg.fallback.enabled,
    transport: mailCfg.fallback.transport,
    host: mailCfg.fallback.host,
    port: mailCfg.fallback.port,
    fromEmail: mailCfg.fallback.fromEmail,
    ok: fallbackState.ok,
    detail: fallbackState.detail,
    sent: fallbackSent,
    budget: mailCfg.fallback.dailyBudget,
    routineLimit: Math.floor(mailCfg.fallback.dailyBudget * ROUTINE_SHARE),
    cooldown: fallbackCooldown,
  };

  const combinedSent =
    (mailCfg.strategy !== "fallback-only" && mailCfg.primary.enabled ? primarySent : 0) +
    (mailCfg.fallback.enabled ? fallbackSent : 0);
  const combinedBudget =
    (mailCfg.strategy !== "fallback-only" && mailCfg.primary.enabled ? mailCfg.primary.dailyBudget : 0) +
    (mailCfg.fallback.enabled ? mailCfg.fallback.dailyBudget : 0);
  const activeHost =
    mailCfg.strategy === "fallback-only"
      ? mailCfg.fallback.host
      : primaryState.ok || !mailCfg.fallback.enabled
        ? mailCfg.primary.host
        : mailCfg.fallback.host;

  return {
    checks: [
      { name: "Database", ...database },
      { name: "Redis (queue and rate limits)", ...cache },
      { name: "File storage", ...storage },
      { name: "E-mail (sign-in codes)", ...mailCheck },
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
      strategy: mailCfg.strategy,
      smtp: {
        host: activeHost || e.SMTP_HOST,
        ok: mailCheck.ok,
        sent: combinedSent,
        budget: combinedBudget || e.MAIL_DAILY_BUDGET,
        routineLimit: Math.floor((combinedBudget || e.MAIL_DAILY_BUDGET) * ROUTINE_SHARE),
      },
      channels: {
        primary: primaryChannel,
        fallback: fallbackChannel,
      },
      skipped: mailSkipped,
      failed: mailFailed,
    },
    version: process.env.GIT_SHA ?? "dev",
    mailFrom: activeSenderEmail(mailCfg),
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

/** Sends a test e-mail to the Super Admin right now (not queued) using auto-failover. */
export async function sendTestEmail(user: SessionUser | null, ip?: string) {
  const u = requireSuperAdmin(user);
  await sendNotificationEmail(
    u.email,
    "PSG Tech recruitment portal: test e-mail",
    "This test e-mail was sent from the control centre. E-mail delivery is working.",
  );
  await audit({ actorId: u.id, action: "system.test_email_sent", entityType: "system", ip });
}

/** Sends a live diagnostic test e-mail through a specific channel or auto-failover. */
export async function sendChannelTest(
  user: SessionUser | null,
  target: MailChannelId | "auto",
  recipientRaw: string,
  ip?: string,
): Promise<MailDeliveryOutcome> {
  const u = requireSuperAdmin(user);
  const to = (recipientRaw || u.email).trim();
  const parsed = z.string().email().safeParse(to);
  if (!parsed.success) {
    throw new ValidationError("Enter a valid recipient e-mail address for the test.");
  }
  const outcome = await sendChannelTestEmail(target, parsed.data);
  await audit({
    actorId: u.id,
    action: "system.test_email_sent",
    entityType: "system",
    ip,
    metadata: {
      target,
      usedChannel: outcome.channelId,
      transport: outcome.transport,
      host: outcome.host,
    },
  });
  return outcome;
}

/** Manually clears an active channel cooldown (e.g., after upgrading quota or fixing credentials). */
export async function clearMailCooldown(
  user: SessionUser | null,
  channelId: MailChannelId,
  ip?: string,
): Promise<void> {
  const u = requireSuperAdmin(user);
  const { mail } = await loadRuntimeConfig(true);
  await clearChannelCooldown(mail[channelId]);
  await audit({
    actorId: u.id,
    action: "settings.mail_channels_changed",
    entityType: "system",
    entityId: `mail.cooldown.${channelId}`,
    ip,
    metadata: { clearedCooldown: channelId },
  });
}

/** Clears cooldowns and resets pooled transports right after saving updated mail channels. */
export async function refreshMailDeliveryState(): Promise<void> {
  const { mail } = await loadRuntimeConfig(true);
  resetTransporterForTesting();
  await Promise.all([
    clearChannelCooldown(mail.primary),
    clearChannelCooldown(mail.fallback),
  ]);
}
