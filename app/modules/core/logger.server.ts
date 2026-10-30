import { LOG_RETENTION_DAYS } from "~/modules/settings/log-categories";
import { closeSync, mkdirSync, openSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import pino from "pino";

/**
 * Structured JSON logger. Sensitive fields are redacted by key wherever they appear; callers must
 * still never pass application answers, document contents, passwords or tokens to the logger.
 *
 * Besides stdout (docker logs), every entry is appended to a daily file in the private storage
 * volume — <STORAGE_DIR>/logs/<service>-YYYY-MM-DD.log (IST dates) — so the Super Admin can read
 * and download system logs from the Control centre. Files older than LOG_RETENTION_DAYS are removed.
 */

const service = process.env.ROLE ?? "web";
const istDate = (t = Date.now()) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);

export function logDir(): string | null {
  const dir = process.env.STORAGE_DIR;
  if (!dir || process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  return join(resolve(dir), "logs");
}

/** Daily-rotating append-only file sink (sync writes: entries are small, and nothing is lost on exit). */
function dailyFileStream(dir: string) {
  let day = "";
  let fd: number | null = null;
  const prune = () => {
    const cutoff = istDate(Date.now() - LOG_RETENTION_DAYS * 86_400_000);
    try {
      for (const f of readdirSync(dir)) {
        const m = /-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
        if (m && m[1]! < cutoff) unlinkSync(join(dir, f));
      }
    } catch {
      /* best effort */
    }
  };
  return {
    write(line: string) {
      try {
        const today = istDate();
        if (today !== day || fd === null) {
          if (fd !== null) closeSync(fd);
          mkdirSync(dir, { recursive: true, mode: 0o700 });
          fd = openSync(join(dir, `${service}-${today}.log`), "a", 0o600);
          day = today;
          prune();
        }
        writeSync(fd, line);
      } catch {
        /* never let logging break a request */
      }
    },
  };
}

const dir = logDir();
const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
if (dir) streams.push({ stream: dailyFileStream(dir) });

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service, version: process.env.GIT_SHA ?? "dev" },
    redact: {
      paths: [
        "password",
        "*.password",
        "passwordHash",
        "*.passwordHash",
        "token",
        "*.token",
        "otp",
        "*.otp",
        "code",
        "*.code",
        "codeHash",
        "*.codeHash",
        "secret",
        "*.secret",
        "sessionId",
        "*.sessionId",
        "cookie",
        "*.cookie",
        "authorization",
        "*.authorization",
        "answers",
        "*.answers",
        "email",
        "*.email",
      ],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams),
);
