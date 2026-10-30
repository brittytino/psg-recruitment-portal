import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { redis } from "~/modules/core/redis.server";

/**
 * Daily e-mail budgets, per sending route, shared by the web app and the worker (Redis counters per
 * IST day).
 *
 *   relay  — Google Workspace SMTP Relay (smtp-relay.gmail.com), MAIL_RELAY_DAILY_BUDGET (≈10 000/day)
 *   gmail  — the Gmail account (smtp.gmail.com, app password), MAIL_DAILY_BUDGET (≈500/day)
 *
 * The relay is used first; the Gmail account is the fallback. On the Gmail route:
 *  - sign-in codes are always sent (nobody is locked out),
 *  - "critical" mail (submission receipt, interview call, invitations) up to MAIL_DAILY_BUDGET,
 *  - "routine" mail (help desk, assignment notices) up to 80 % of it; beyond that it stays in the app.
 */
export type MailPriority = "otp" | "critical" | "routine";
export type MailRoute = "relay" | "gmail";
export const ROUTINE_SHARE = 0.8;
const ALERTS = [0.7, 0.85, 0.95];

const istDay = (t = Date.now()) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);
const key = (route: MailRoute, day = istDay()) => `mail:sent:${route}:${day}`;

/** Redis calls here never hold up an e-mail (or a sign-in code) for more than a moment. */
const quick = <T>(p: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 500))]).catch(() => fallback);

export function routeBudget(route: MailRoute): number {
  return route === "relay" ? env().MAIL_RELAY_DAILY_BUDGET : env().MAIL_DAILY_BUDGET;
}

export async function sentToday(route: MailRoute): Promise<number> {
  try {
    return Number((await quick(redis().get(key(route)), null)) ?? 0);
  } catch {
    return 0;
  }
}

/** Total sent today over both routes. */
export async function emailsSentToday(): Promise<number> {
  const [a, b] = await Promise.all([sentToday("relay"), sentToday("gmail")]);
  return a + b;
}

/** Whether this route may send an e-mail of this priority now. Fails open if Redis is unavailable. */
export async function routeHasRoom(route: MailRoute, priority: MailPriority): Promise<boolean> {
  const budget = routeBudget(route);
  const sent = await sentToday(route);
  if (route === "relay") return sent < budget;
  if (priority === "otp") return true;
  return sent < (priority === "critical" ? budget : Math.floor(budget * ROUTINE_SHARE));
}

/** Counts one sent e-mail and logs when a route crosses 70 %, 85 % and 95 % of its budget. */
export async function countEmail(route: MailRoute): Promise<void> {
  try {
    const k = key(route);
    const n = await quick(redis().incr(k), 0);
    if (n === 1) await quick(redis().expire(k, 3 * 86_400), 0);
    const budget = routeBudget(route);
    for (const a of ALERTS)
      if (n === Math.ceil(budget * a))
        logger.warn(
          { event: "mail_budget", route, sent: n, budget, percent: Math.round(a * 100) },
          `e-mail usage on the ${route} route reached ${Math.round(a * 100)}% of today's budget`,
        );
  } catch {
    /* counting must never block delivery */
  }
}

// ---- Relay health: after a failure the relay is skipped for a while (shared across processes) ----
const DOWN_KEY = "mail:relay:down";
const DOWN_SECONDS = 600;
let downUntil = 0;

export async function relayIsDown(): Promise<boolean> {
  if (Date.now() < downUntil) return true;
  return !!(await quick(redis().get(DOWN_KEY), null));
}

export async function markRelayDown(reason: string): Promise<void> {
  downUntil = Date.now() + DOWN_SECONDS * 1000;
  await quick(redis().set(DOWN_KEY, reason.slice(0, 200), "EX", DOWN_SECONDS), null);
}

export async function relayDownReason(): Promise<string | null> {
  return quick(redis().get(DOWN_KEY), null);
}
