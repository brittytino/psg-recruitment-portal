import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { redis } from "~/modules/core/redis.server";

/**
 * Daily e-mail budget of the SMTP mailbox (MAIL_DAILY_BUDGET, a Gmail mailbox allows about 500 a day),
 * shared by the web app and the worker through a Redis counter per IST day.
 *  - sign-in codes are always sent (nobody is locked out),
 *  - "critical" mail (submission receipt, interview call, invitations) up to the budget,
 *  - "routine" mail (help desk, assignment notices) up to 80 % of it; beyond that it stays in the app.
 */
export type MailPriority = "otp" | "critical" | "routine";
export const ROUTINE_SHARE = 0.8;
const ALERTS = [0.7, 0.85, 0.95];

const istDay = (t = Date.now()) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);
// The key name is kept from earlier releases so today's count carries over on deploy.
const key = (day = istDay()) => `mail:sent:gmail:${day}`;

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

/** Whether an e-mail of this priority may be sent now. Fails open if Redis is unavailable. */
export async function hasRoom(priority: MailPriority): Promise<boolean> {
  if (priority === "otp") return true;
  const budget = env().MAIL_DAILY_BUDGET;
  const sent = await emailsSentToday();
  return sent < (priority === "critical" ? budget : Math.floor(budget * ROUTINE_SHARE));
}

/** Counts one sent e-mail and logs when usage crosses 70 %, 85 % and 95 % of the budget. */
export async function countEmail(): Promise<void> {
  try {
    const k = key();
    const n = await quick(redis().incr(k), 0);
    if (n === 1) await quick(redis().expire(k, 3 * 86_400), 0);
    const budget = env().MAIL_DAILY_BUDGET;
    for (const a of ALERTS)
      if (n === Math.ceil(budget * a))
        logger.warn(
          { event: "mail_budget", sent: n, budget, percent: Math.round(a * 100) },
          `e-mail usage reached ${Math.round(a * 100)}% of today's budget`,
        );
  } catch {
    /* counting must never block delivery */
  }
}
