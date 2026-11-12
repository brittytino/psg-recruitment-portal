import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { redis } from "~/modules/core/redis.server";
import { runtimeEnvSync } from "~/modules/settings/runtime-config.server";

/**
 * Daily e-mail budget & per-channel cooldown tracker shared by the web app and
 * the worker through Redis counters per IST day.
 *  - sign-in codes fail over across channels when a channel hits its budget/cooldown
 *    and still attempt delivery if every enabled channel is over budget,
 *  - "critical" mail (submission receipt, interview call, invitations) uses up to 100 % of channel budget,
 *  - "routine" mail (help desk, assignment notices) uses up to 80 % of it; beyond that it stays in the app.
 */
export type MailPriority = "otp" | "critical" | "routine";
export type MailChannelId = "primary" | "fallback";
export type ChannelCooldownKind = "quota" | "blocked" | "auth" | "error";

export interface ChannelCooldownStatus {
  active: boolean;
  kind?: ChannelCooldownKind;
  reason?: string;
  ttlSeconds?: number;
}

export interface ChannelBucketTarget {
  id: MailChannelId;
  transport?: "smtp" | "brevo-api";
  host?: string;
  user?: string;
}

export const ROUTINE_SHARE = 0.8;
const ALERTS = [0.7, 0.85, 0.95];

const istDay = (t = Date.now()) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);
// The key name is kept from earlier releases so today's count carries over on deploy.
const key = (day = istDay()) => `mail:sent:gmail:${day}`;

function channelBucket(target: ChannelBucketTarget): string {
  const host = (target.host ?? "").trim().toLowerCase();
  const transport = target.transport ?? "smtp";
  const user = (target.user ?? "").trim().toLowerCase();
  if (transport === "smtp" && host.includes("gmail.com")) {
    const envUser = env().SMTP_USER.trim().toLowerCase();
    // Preserve legacy key for the original .env Gmail mailbox while isolating any different Gmail address.
    if (!user || user === envUser) {
      return "gmail";
    }
    return `${target.id}:smtp:gmail:${user}`;
  }
  return `${target.id}:${transport}:${host || "default"}`;
}

function channelSentKey(target: ChannelBucketTarget, day = istDay()): string {
  const bucket = channelBucket(target);
  return bucket === "gmail" ? key(day) : `mail:sent:ch:${bucket}:${day}`;
}

function channelCooldownKey(target: ChannelBucketTarget): string {
  return `mail:cooldown:${channelBucket(target)}`;
}

/** Redis calls here never hold up an e-mail (or a sign-in code) for more than a moment. */
const quick = <T>(p: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 500))]).catch(() => fallback);

export async function emailsSentToday(): Promise<number> {
  try {
    return Number((await quick(redis().get(key()), null)) ?? 0);
  } catch {
    return 0;
  }
}

export async function channelSentToday(target: ChannelBucketTarget): Promise<number> {
  try {
    return Number((await quick(redis().get(channelSentKey(target)), null)) ?? 0);
  } catch {
    return 0;
  }
}

export function hasChannelRoom(sent: number, budget: number, priority: MailPriority): boolean {
  if (budget <= 0) return false;
  const limit = priority === "routine" ? Math.floor(budget * ROUTINE_SHARE) : budget;
  return sent < limit;
}

/** Whether an e-mail of this priority may be sent on the default channel now. Fails open if Redis is unavailable. */
export async function hasRoom(priority: MailPriority): Promise<boolean> {
  if (priority === "otp") return true;
  const budget = runtimeEnvSync().MAIL_DAILY_BUDGET;
  const sent = await emailsSentToday();
  return sent < (priority === "critical" ? budget : Math.floor(budget * ROUTINE_SHARE));
}

function warnBudgetThresholds(sent: number, budget: number, channelId?: MailChannelId): void {
  if (budget <= 0) return;
  for (const a of ALERTS) {
    if (sent === Math.ceil(budget * a)) {
      logger.warn(
        { event: "mail_budget", channelId, sent, budget, percent: Math.round(a * 100) },
        `e-mail usage reached ${Math.round(a * 100)}% of today's budget`,
      );
    }
  }
}

/** Counts one sent e-mail on the default counter and logs threshold crossings. */
export async function countEmail(): Promise<void> {
  try {
    const k = key();
    const n = await quick(redis().incr(k), 0);
    if (n === 1) await quick(redis().expire(k, 3 * 86_400), 0);
    warnBudgetThresholds(n, runtimeEnvSync().MAIL_DAILY_BUDGET);
  } catch {
    /* counting must never block delivery */
  }
}

/** Counts one sent e-mail for a specific channel and logs when usage crosses 70 %, 85 % and 95 %. */
export async function countChannelEmail(target: ChannelBucketTarget, budget: number): Promise<void> {
  try {
    const k = channelSentKey(target);
    const n = await quick(redis().incr(k), 0);
    if (n === 1) await quick(redis().expire(k, 3 * 86_400), 0);
    warnBudgetThresholds(n, budget, target.id);
  } catch {
    /* counting must never block delivery */
  }
}

export async function setChannelCooldown(
  target: ChannelBucketTarget,
  kind: ChannelCooldownKind,
  reason: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    const k = channelCooldownKey(target);
    const payload = JSON.stringify({ kind, reason: reason.slice(0, 240) });
    const ttl = Math.max(30, Math.round(ttlSeconds));
    await quick(redis().set(k, payload, "EX", ttl), "OK");
  } catch {
    /* cooldown tracking must never crash delivery */
  }
}

export async function getChannelCooldown(target: ChannelBucketTarget): Promise<ChannelCooldownStatus> {
  try {
    const k = channelCooldownKey(target);
    const r = redis();
    const [raw, ttl] = await Promise.all([
      quick(r.get(k), null),
      quick(r.ttl(k), -1),
    ]);
    if (!raw) return { active: false };
    try {
      const parsed = JSON.parse(raw) as { kind?: ChannelCooldownKind; reason?: string };
      return {
        active: true,
        kind: parsed.kind ?? "error",
        reason: parsed.reason ?? "Channel temporarily paused after delivery error",
        ttlSeconds: ttl > 0 ? ttl : undefined,
      };
    } catch {
      return { active: true, kind: "error", reason: raw, ttlSeconds: ttl > 0 ? ttl : undefined };
    }
  } catch {
    return { active: false };
  }
}

export async function clearChannelCooldown(target: ChannelBucketTarget): Promise<void> {
  try {
    await quick(redis().del(channelCooldownKey(target)), 0);
  } catch {
    /* best effort */
  }
}
