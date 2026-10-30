import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isSuperAdmin } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { ForbiddenError } from "~/modules/core/errors";
import { logDir } from "~/modules/core/logger.server";
import { LOG_CATEGORIES, LOG_RETENTION_DAYS, type LogCategory } from "./log-categories";
export { LOG_CATEGORIES, type LogCategory };

/**
 * System logs for the Super Admin: technical events written by the web app and the background
 * worker (sign-in codes and e-mail, PDF generation, rate limits, errors). Separate from the audit
 * log, which records what people did.
 */

const LEVELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};
const BASE_KEYS = new Set(["level", "time", "service", "version", "pid", "hostname", "msg", "event"]);
const MAX_FILE_BYTES = 60 * 1024 * 1024;

export interface LogEntry {
  time: string;
  level: string;
  service: string;
  event: string;
  message: string;
  details: Record<string, string>;
}

function requireSuperAdmin(user: SessionUser | null): SessionUser {
  if (!user || !isSuperAdmin(user.grants))
    throw new ForbiddenError("Only the Super Admin can read system logs");
  return user;
}

/** Days with log files, newest first, with total size. */
export async function logDays(user: SessionUser | null) {
  requireSuperAdmin(user);
  const dir = logDir();
  if (!dir) return [];
  const files = await readdir(dir).catch(() => [] as string[]);
  const days = new Map<string, number>();
  for (const f of files) {
    const m = /^(\w+)-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
    if (!m) continue;
    const size = (await stat(join(dir, f)).catch(() => null))?.size ?? 0;
    days.set(m[2]!, (days.get(m[2]!) ?? 0) + size);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, bytes]) => ({ date, bytes }));
}

function matches(e: Record<string, unknown>, category: LogCategory): boolean {
  const event = String(e.event ?? "");
  const msg = String(e.msg ?? "");
  switch (category) {
    case "errors":
      return Number(e.level) >= 50;
    case "signin":
      return /^(otp_|mail_)/.test(event) || /sign-in code|smtp|mail/i.test(msg);
    case "pdf":
      return /^pdf_/.test(event) || /pdf|bundle|document|scan|convert/i.test(msg);
    case "ratelimit":
      return event === "rate_limit";
    default:
      return true;
  }
}

function toEntry(e: Record<string, unknown>): LogEntry {
  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) {
    if (BASE_KEYS.has(k) || v === undefined || v === null) continue;
    details[k] = typeof v === "object" ? JSON.stringify(v).slice(0, 500) : String(v).slice(0, 500);
  }
  return {
    time: String(e.time ?? ""),
    level: LEVELS[Number(e.level)] ?? String(e.level ?? ""),
    service: String(e.service ?? ""),
    event: String(e.event ?? ""),
    message: String(e.msg ?? ""),
    details,
  };
}

export interface LogQuery {
  date: string;
  category: LogCategory;
  search?: string;
}

/** Entries of one day (web + worker), newest first, filtered. */
export async function readLogs(user: SessionUser | null, q: LogQuery, limit = 500) {
  requireSuperAdmin(user);
  const dir = logDir();
  if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(q.date))
    return { entries: [] as LogEntry[], total: 0, truncated: false };
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(`-${q.date}.log`));
  const term = q.search?.trim().toLowerCase();
  const all: LogEntry[] = [];
  for (const f of files) {
    const path = join(dir, f);
    const size = (await stat(path).catch(() => null))?.size ?? 0;
    if (size === 0) continue;
    let text = await readFile(path, "utf8");
    if (size > MAX_FILE_BYTES) text = text.slice(-MAX_FILE_BYTES); // newest part of a very large day
    for (const line of text.split("\n")) {
      if (!line) continue;
      let e: Record<string, unknown>;
      try {
        e = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (!matches(e, q.category)) continue;
      if (term && !line.toLowerCase().includes(term)) continue;
      all.push(toEntry(e));
    }
  }
  all.sort((a, b) => b.time.localeCompare(a.time));
  return { entries: all.slice(0, limit), total: all.length, truncated: all.length > limit };
}

/** Plain-text export (one line per entry, IST times) for download. */
export function formatLogText(entries: LogEntry[], header: string): string {
  const ist = (t: string) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime())
      ? t
      : `${new Date(d.getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 19)} IST`;
  };
  const lines = entries
    .slice()
    .reverse()
    .map((e) => {
      const extra = Object.entries(e.details)
        .map(([k, v]) => `${k}=${/\s/.test(v) ? JSON.stringify(v) : v}`)
        .join(" ");
      return `${ist(e.time)}  ${e.level.toUpperCase().padEnd(5)}  ${e.service.padEnd(6)}  ${(e.event || "-").padEnd(18)}  ${e.message}${extra ? `  | ${extra}` : ""}`;
    });
  return `${header}\n${"=".repeat(header.length)}\n\n${lines.join("\n")}\n`;
}

export { LOG_RETENTION_DAYS };
