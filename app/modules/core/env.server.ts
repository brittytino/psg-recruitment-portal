import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  COOKIE_SECURE: bool.default(false),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  STORAGE_DIR: z.string().min(1),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  CONVERTER_URL: z.string().url(),
  CONVERTER_TOKEN: z.string().default(""),
  MALWARE_SCAN: z.enum(["clamav", "disabled"]).default("clamav"),
  CLAMAV_HOST: z.string().default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int(),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  GIT_SHA: z.string().default("dev"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Fails fast at startup with a list of invalid variables (values are not printed). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${fields}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production") {
    if (e.MALWARE_SCAN === "disabled") throw new Error("MALWARE_SCAN=disabled is not allowed in production");
    if (e.SESSION_SECRET.startsWith("replace-with"))
      throw new Error("SESSION_SECRET still has the example value");
  }
  cached = e;
  return e;
}
