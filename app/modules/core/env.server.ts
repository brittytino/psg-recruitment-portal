import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().url(),
  ALLOWED_ORIGINS: z.string().optional().default(""),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  COOKIE_SECURE: bool.default(false),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  STORAGE_DIR: z.string().min(1),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  /**
   * Scales every per-IP rate limit. Campus users share one public IP (NAT), so per-IP limits must be
   * generous; per-account limits are unaffected and still protect individual accounts.
   */
  IP_RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(30),
  /** E-mails the app may send per day (IST), across web and worker. Keep below the provider quota. */
  MAIL_DAILY_BUDGET: z.coerce.number().int().min(10).max(100000).default(450),
  /**
   * Google Workspace SMTP Relay (primary route, about 10 000 e-mails a day). Empty host = not used.
   * Authenticates by the server IP (set up by IT in the Google Admin console) or, if set, with
   * SMTP_RELAY_USER / SMTP_RELAY_PASSWORD. The Gmail account (SMTP_*) is the fallback.
   */
  SMTP_RELAY_HOST: z.string().optional().default(""),
  SMTP_RELAY_PORT: z.coerce.number().int().default(587),
  SMTP_RELAY_SECURE: bool.default(false),
  SMTP_RELAY_USER: z.string().optional().default(""),
  SMTP_RELAY_PASSWORD: z.string().optional().default(""),
  /** Name sent in EHLO; Google requires a real domain when the relay authenticates by IP. */
  SMTP_RELAY_HELO: z.string().optional().default(""),
  MAIL_RELAY_DAILY_BUDGET: z.coerce.number().int().min(10).max(100000).default(9500),
  CONVERTER_URL: z.string().url(),
  CONVERTER_TOKEN: z.string().default(""),
  MALWARE_SCAN: z.enum(["clamav", "disabled"]).default("clamav"),
  CLAMAV_HOST: z.string().default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  // Email Infrastructure
  EMAIL_PROVIDER: z.enum(["smtp", "mailpit", "test"]).default("smtp"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int(),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM_NAME: z.string().default("PSG College of Technology Recruitment"),
  SMTP_FROM_EMAIL: z.string().email().default("recruitments@psgtech.ac.in"),
  MAIL_FROM: z.string().optional(),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().default(10000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().default(10000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().default(20000),

  // OTP Authentication Configuration
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(1).max(50).default(5),

  /** Development only: print sign-in codes to the server log (rejected in production). */
  DEV_LOG_OTP: bool.default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  GIT_SHA: z.string().default("dev"),
});

export type Env = z.infer<typeof schema> & { MAIL_FROM: string };

let cached: Env | undefined;

export function resetEnvCacheForTesting(): void {
  cached = undefined;
}

/** Validated environment. Fails fast at startup with a list of invalid variables (values are not printed). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${fields}`);
  }
  const e = {
    ...parsed.data,
    MAIL_FROM: parsed.data.MAIL_FROM || `${parsed.data.SMTP_FROM_NAME} <${parsed.data.SMTP_FROM_EMAIL}>`,
  };
  if (e.NODE_ENV === "production") {
    if (e.MALWARE_SCAN === "disabled") throw new Error("MALWARE_SCAN=disabled is not allowed in production");
    if (e.DEV_LOG_OTP) throw new Error("DEV_LOG_OTP=true is not allowed in production");
    if (e.SESSION_SECRET.startsWith("replace-with"))
      throw new Error("SESSION_SECRET still has the example value");
    if (e.EMAIL_PROVIDER === "mailpit" || e.EMAIL_PROVIDER === "test")
      throw new Error(
        `EMAIL_PROVIDER=${e.EMAIL_PROVIDER} is not allowed in production. Production must use EMAIL_PROVIDER=smtp.`,
      );
    if (e.EMAIL_PROVIDER === "smtp") {
      if (!e.SMTP_HOST || e.SMTP_HOST === "mailpit")
        throw new Error(
          `Invalid production SMTP_HOST: "${e.SMTP_HOST}". Production requires an institutional SMTP host.`,
        );
      if (!e.SMTP_USER) throw new Error("SMTP_USER is required for production SMTP authentication.");
      if (!e.SMTP_PASSWORD) throw new Error("SMTP_PASSWORD is required for production SMTP authentication.");
    }
  }
  cached = e;
  return e;
}
