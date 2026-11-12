import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env, type Env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";

export const MAIL_CHANNELS_KEY = "mail.channels";
export const RUNTIME_ENV_KEY = "runtime.env";

export type MailChannelId = "primary" | "fallback";
export type MailTransport = "smtp" | "brevo-api";
export type MailStrategy = "primary-first" | "fallback-only";

export interface MailChannelConfig {
  id: MailChannelId;
  enabled: boolean;
  label: string;
  transport: MailTransport;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Decrypted secret in memory; encrypted at rest in system_settings. */
  password: string;
  /** When true and password is empty, falls back to server .env SMTP_PASSWORD at runtime. */
  useEnvPassword: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  dailyBudget: number;
}

export interface MailChannelsConfig {
  strategy: MailStrategy;
  primary: MailChannelConfig;
  fallback: MailChannelConfig;
  /** True when loaded from system_settings rather than server .env defaults. */
  fromDb: boolean;
}

export interface RedactedMailChannel {
  id: MailChannelId;
  enabled: boolean;
  label: string;
  transport: MailTransport;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  passwordSource: "db" | "env" | "none";
  useEnvPassword: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  dailyBudget: number;
}

export interface EditableMailConfig {
  strategy: MailStrategy;
  primary: RedactedMailChannel;
  fallback: RedactedMailChannel;
  fromDb: boolean;
}

export const RUNTIME_ENV_FIELDS = [
  {
    key: "OTP_LENGTH",
    label: "Sign-in code length",
    help: "Number of digits in one-time codes (default 6).",
    min: 4,
    max: 10,
    unit: "digits",
  },
  {
    key: "OTP_EXPIRY_MINUTES",
    label: "Code validity (minutes)",
    help: "How long a sign-in code remains valid after sending.",
    min: 1,
    max: 60,
    unit: "min",
  },
  {
    key: "OTP_RESEND_COOLDOWN_SECONDS",
    label: "Resend wait cooldown (seconds)",
    help: "Wait before a user can request another code (higher saves daily mail quota).",
    min: 10,
    max: 600,
    unit: "sec",
  },
  {
    key: "OTP_MAX_ATTEMPTS",
    label: "Wrong code attempts allowed",
    help: "Maximum tries before a code is invalidated.",
    min: 1,
    max: 20,
    unit: "tries",
  },
  {
    key: "OTP_MAX_SENDS_PER_HOUR",
    label: "Max codes per account per hour",
    help: "Protects mail quota from repeated sign-in requests.",
    min: 1,
    max: 50,
    unit: "codes/hr",
  },
  {
    key: "IP_RATE_LIMIT_MULTIPLIER",
    label: "Campus NAT IP limit multiplier",
    help: "Scales per-IP limits when many campus users share one public IP.",
    min: 1,
    max: 1000,
    unit: "x",
  },
  {
    key: "SESSION_TTL_HOURS",
    label: "Session duration (hours)",
    help: "Default session lifetime (non-remembered logins).",
    min: 1,
    max: 72,
    unit: "hours",
  },
  {
    key: "MAX_UPLOAD_MB",
    label: "Maximum file upload size (MB)",
    help: "Applies to application PDFs, certificates, photographs and support tickets.",
    min: 1,
    max: 50,
    unit: "MB",
  },
  {
    key: "MAIL_DAILY_BUDGET",
    label: "Fallback default daily mail budget",
    help: "Used when channel-specific daily budgets are not overridden.",
    min: 10,
    max: 100000,
    unit: "emails/day",
  },
  {
    key: "SMTP_CONNECTION_TIMEOUT_MS",
    label: "SMTP connection timeout (ms)",
    help: "How long to wait for TCP handshake before trying alternate port / fallback.",
    min: 1000,
    max: 60000,
    unit: "ms",
  },
  {
    key: "SMTP_GREETING_TIMEOUT_MS",
    label: "SMTP greeting timeout (ms)",
    help: "Wait time for the remote SMTP banner after connecting.",
    min: 1000,
    max: 60000,
    unit: "ms",
  },
  {
    key: "SMTP_SOCKET_TIMEOUT_MS",
    label: "SMTP socket timeout (ms)",
    help: "Maximum idle time during an SMTP send before failing over.",
    min: 2000,
    max: 120000,
    unit: "ms",
  },
] as const;

export type RuntimeEnvKey = (typeof RUNTIME_ENV_FIELDS)[number]["key"];
export type RuntimeEnvOverrides = Partial<Record<RuntimeEnvKey, number>>;

// -------------------------------------------------------------------------------------------------
// Encryption at rest (AES-256-GCM keyed from SESSION_SECRET)
// -------------------------------------------------------------------------------------------------

const ENC_PREFIX = "enc:v1:";

function sealingKey(): Buffer {
  const secret = process.env.SESSION_SECRET || "dev-fallback-secret-do-not-use-in-production";
  return createHash("sha256").update(`psg-srp-runtime-settings-v1:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(stored: unknown): string {
  if (typeof stored !== "string" || !stored) return "";
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const rest = stored.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, cipherHex] = rest.split(":");
    if (!ivHex || !tagHex || !cipherHex) return "";
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// -------------------------------------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------------------------------------

const emailOrEmpty = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid e-mail address");

const storedChannelSchema = z.object({
  id: z.enum(["primary", "fallback"]),
  enabled: z.boolean().default(false),
  label: z.string().trim().max(80).default(""),
  transport: z.enum(["smtp", "brevo-api"]).default("smtp"),
  host: z.string().trim().max(200).default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().max(200).default(""),
  passwordEnc: z.string().optional().default(""),
  useEnvPassword: z.boolean().default(false),
  fromName: z.string().trim().max(150).default("PSG College of Technology Recruitment"),
  fromEmail: z.string().trim().max(200).default(""),
  replyTo: z.string().trim().max(200).default(""),
  dailyBudget: z.coerce.number().int().min(1).max(500000).default(450),
});

const storedMailConfigSchema = z.object({
  strategy: z.enum(["primary-first", "fallback-only"]).default("primary-first"),
  primary: storedChannelSchema,
  fallback: storedChannelSchema,
});

export const channelInputSchema = z.object({
  enabled: z.boolean().default(false),
  label: z.string().trim().max(80).default(""),
  transport: z.enum(["smtp", "brevo-api"]).default("smtp"),
  host: z.string().trim().max(200).default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().max(200).default(""),
  password: z.string().max(500).optional().default(""),
  clearPassword: z.boolean().optional().default(false),
  useEnvPassword: z.boolean().optional().default(false),
  fromName: z.string().trim().max(150).default("PSG College of Technology Recruitment"),
  fromEmail: emailOrEmpty.default(""),
  replyTo: emailOrEmpty.default(""),
  dailyBudget: z.coerce.number().int().min(1).max(500000).default(300),
});

export const mailChannelsInputSchema = z.object({
  strategy: z.enum(["primary-first", "fallback-only"]).default("primary-first"),
  primary: channelInputSchema,
  fallback: channelInputSchema,
});

export const runtimeEnvInputSchema = z.object({
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).optional(),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(60).optional(),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).optional(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).optional(),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(1).max(50).optional(),
  IP_RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).optional(),
  MAIL_DAILY_BUDGET: z.coerce.number().int().min(10).max(100000).optional(),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).optional(),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).optional(),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().min(2000).max(120000).optional(),
});

// -------------------------------------------------------------------------------------------------
// In-memory cache shared by request handlers and background jobs (refreshes every 5s cleanly)
// -------------------------------------------------------------------------------------------------

const CACHE_TTL_MS = 5_000;

let cachedMailConfig: MailChannelsConfig | undefined;
let cachedRuntimeOverrides: RuntimeEnvOverrides | undefined;
let lastLoadedAt = 0;
let mailConfigSignature = "";
let allowDbInTest = false;

export function setRuntimeConfigDbInTest(enabled: boolean): void {
  allowDbInTest = enabled;
}

export function resetRuntimeConfigForTesting(): void {
  cachedMailConfig = undefined;
  cachedRuntimeOverrides = undefined;
  lastLoadedAt = 0;
  mailConfigSignature = "";
  allowDbInTest = false;
}

export function invalidateRuntimeConfigCache(): void {
  lastLoadedAt = 0;
}

export function defaultMailChannelsFromEnv(): MailChannelsConfig {
  const e = env();
  return {
    strategy: "primary-first",
    fromDb: false,
    primary: {
      id: "primary",
      enabled: e.EMAIL_PROVIDER !== "test",
      label: e.SMTP_HOST.includes("gmail")
        ? "Gmail Workspace (env)"
        : e.SMTP_HOST.includes("brevo")
          ? "Brevo SMTP (env)"
          : "Primary SMTP (env)",
      transport: "smtp",
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      useEnvPassword: Boolean(e.SMTP_PASSWORD),
      fromName: e.SMTP_FROM_NAME,
      fromEmail: e.SMTP_FROM_EMAIL || e.SMTP_USER,
      replyTo: "",
      dailyBudget: e.MAIL_DAILY_BUDGET,
    },
    fallback: {
      id: "fallback",
      enabled: false,
      label: "Fallback mail channel",
      transport: "smtp",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: e.SMTP_USER || "",
      password: "",
      useEnvPassword: Boolean(e.SMTP_PASSWORD),
      fromName: e.SMTP_FROM_NAME,
      fromEmail: e.SMTP_FROM_EMAIL || e.SMTP_USER || "",
      replyTo: "",
      dailyBudget: 450,
    },
  };
}

function hydrateChannel(
  stored: z.infer<typeof storedChannelSchema>,
  e: Env,
): MailChannelConfig {
  const dbSecret = decryptSecret(stored.passwordEnc);
  const password = dbSecret || (stored.useEnvPassword ? e.SMTP_PASSWORD : "");
  const isBrevoApi = stored.transport === "brevo-api";
  return {
    id: stored.id,
    enabled: stored.enabled,
    label: stored.label || (stored.id === "primary" ? "Primary mail" : "Fallback mail"),
    transport: stored.transport,
    host: isBrevoApi ? "api.brevo.com" : stored.host,
    port: isBrevoApi ? 443 : stored.port,
    secure: isBrevoApi ? true : stored.secure,
    user: stored.user,
    password,
    useEnvPassword: stored.useEnvPassword,
    fromName: stored.fromName || e.SMTP_FROM_NAME,
    fromEmail: stored.fromEmail || e.SMTP_FROM_EMAIL || stored.user,
    replyTo: stored.replyTo || "",
    dailyBudget: stored.dailyBudget,
  };
}

function computeSignature(cfg: MailChannelsConfig, rt?: RuntimeEnvOverrides): string {
  const pick = (c: MailChannelConfig) => ({
    enabled: c.enabled,
    transport: c.transport,
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    pwHash: c.password ? createHash("sha256").update(c.password).digest("hex").slice(0, 12) : "",
    fromEmail: c.fromEmail,
    fromName: c.fromName,
    replyTo: c.replyTo,
  });
  return JSON.stringify({
    strategy: cfg.strategy,
    p: pick(cfg.primary),
    f: pick(cfg.fallback),
    t: [rt?.SMTP_CONNECTION_TIMEOUT_MS, rt?.SMTP_GREETING_TIMEOUT_MS, rt?.SMTP_SOCKET_TIMEOUT_MS],
  });
}

export function getMailConfigSignature(): string {
  return mailConfigSignature;
}

/**
 * Loads mail channel and runtime env overrides from system_settings with a short in-memory cache.
 * Falls back cleanly to .env values when not saved yet or when no DB is attached (unit tests).
 */
export async function loadRuntimeConfig(force = false): Promise<{
  mail: MailChannelsConfig;
  runtimeEnv: RuntimeEnvOverrides;
}> {
  const e = env();
  if (e.NODE_ENV === "test" && !allowDbInTest) {
    const mail = defaultMailChannelsFromEnv();
    cachedMailConfig = mail;
    cachedRuntimeOverrides = {};
    mailConfigSignature = computeSignature(mail);
    return { mail, runtimeEnv: {} };
  }

  if (!force && cachedMailConfig && cachedRuntimeOverrides && Date.now() - lastLoadedAt < CACHE_TTL_MS) {
    return { mail: cachedMailConfig, runtimeEnv: cachedRuntimeOverrides };
  }

  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: [MAIL_CHANNELS_KEY, RUNTIME_ENV_KEY] } },
    });

    const mailRow = rows.find((r) => r.key === MAIL_CHANNELS_KEY)?.value;
    let mail = defaultMailChannelsFromEnv();
    if (mailRow && typeof mailRow === "object") {
      const parsedMail = storedMailConfigSchema.safeParse(mailRow);
      if (parsedMail.success) {
        mail = {
          strategy: parsedMail.data.strategy,
          fromDb: true,
          primary: hydrateChannel(parsedMail.data.primary, e),
          fallback: hydrateChannel(parsedMail.data.fallback, e),
        };
      }
    }

    const envRow = rows.find((r) => r.key === RUNTIME_ENV_KEY)?.value;
    let runtimeEnv: RuntimeEnvOverrides = {};
    if (envRow && typeof envRow === "object") {
      const parsedEnv = runtimeEnvInputSchema.safeParse(envRow);
      if (parsedEnv.success) {
        runtimeEnv = Object.fromEntries(
          Object.entries(parsedEnv.data).filter(([, v]) => typeof v === "number" && Number.isFinite(v)),
        ) as RuntimeEnvOverrides;
      }
    }

    cachedMailConfig = mail;
    cachedRuntimeOverrides = runtimeEnv;
    mailConfigSignature = computeSignature(mail, runtimeEnv);
    lastLoadedAt = Date.now();
    return { mail, runtimeEnv };
  } catch (err) {
    logger.warn(
      { event: "runtime_config_load_failed", err: err instanceof Error ? err.message : String(err) },
      "could not load dynamic settings from DB, using .env defaults",
    );
    const mail = cachedMailConfig ?? defaultMailChannelsFromEnv();
    const runtimeEnv = cachedRuntimeOverrides ?? {};
    return { mail, runtimeEnv };
  }
}

/** Synchronous view combining .env with latest cached DB overrides (never throws). */
export function runtimeEnvSync(): Env {
  const base = env();
  if (!cachedRuntimeOverrides) return base;
  return { ...base, ...cachedRuntimeOverrides };
}

export function getMailConfigSync(): MailChannelsConfig {
  return cachedMailConfig ?? defaultMailChannelsFromEnv();
}

// -------------------------------------------------------------------------------------------------
// Super Admin UI loaders & mutators (never return raw secrets)
// -------------------------------------------------------------------------------------------------

function redactChannel(
  ch: MailChannelConfig,
  hasDbPassword: boolean,
  e: Env,
): RedactedMailChannel {
  const hasEnv = ch.useEnvPassword && Boolean(e.SMTP_PASSWORD);
  return {
    id: ch.id,
    enabled: ch.enabled,
    label: ch.label,
    transport: ch.transport,
    host: ch.host,
    port: ch.port,
    secure: ch.secure,
    user: ch.user,
    hasPassword: hasDbPassword || hasEnv,
    passwordSource: hasDbPassword ? "db" : hasEnv ? "env" : "none",
    useEnvPassword: ch.useEnvPassword,
    fromName: ch.fromName,
    fromEmail: ch.fromEmail,
    replyTo: ch.replyTo,
    dailyBudget: ch.dailyBudget,
  };
}

export async function getEditableMailConfig(user: SessionUser | null): Promise<EditableMailConfig> {
  requirePermission(user, "settings:manage");
  const e = env();
  const { mail } = await loadRuntimeConfig(true);

  let primaryHasDbPw = false;
  let fallbackHasDbPw = false;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: MAIL_CHANNELS_KEY } });
    const parsed = storedMailConfigSchema.safeParse(row?.value);
    if (parsed.success) {
      primaryHasDbPw = Boolean(decryptSecret(parsed.data.primary.passwordEnc));
      fallbackHasDbPw = Boolean(decryptSecret(parsed.data.fallback.passwordEnc));
    }
  } catch {
    // Ignore if unavailable
  }

  return {
    strategy: mail.strategy,
    fromDb: mail.fromDb,
    primary: redactChannel(mail.primary, primaryHasDbPw, e),
    fallback: redactChannel(mail.fallback, fallbackHasDbPw, e),
  };
}

export async function saveMailChannelsConfig(
  user: SessionUser | null,
  rawInput: unknown,
  ip?: string,
): Promise<MailChannelsConfig> {
  const u = requirePermission(user, "settings:manage");
  const parsed = mailChannelsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid mail configuration");
  }

  const input = parsed.data;
  const e = env();
  const existingRow = await prisma.systemSetting.findUnique({ where: { key: MAIL_CHANNELS_KEY } });
  const existingParsed = storedMailConfigSchema.safeParse(existingRow?.value);

  const validateAndBuild = (
    id: MailChannelId,
    ch: z.infer<typeof channelInputSchema>,
    prev?: z.infer<typeof storedChannelSchema>,
  ): z.infer<typeof storedChannelSchema> => {
    const isBrevoApi = ch.transport === "brevo-api";
    const host = isBrevoApi ? "api.brevo.com" : ch.host;
    const port = isBrevoApi ? 443 : ch.port;
    const secure = isBrevoApi ? true : ch.secure;

    if (ch.enabled) {
      if (!isBrevoApi && !host) {
        throw new ValidationError(`${id === "primary" ? "Primary" : "Fallback"} channel requires an SMTP host.`);
      }
      if (!ch.fromEmail) {
        throw new ValidationError(
          `${id === "primary" ? "Primary" : "Fallback"} channel requires a From e-mail address.`,
        );
      }
    }

    const hasChangedProvider =
      prev !== undefined &&
      (prev.transport !== ch.transport || prev.host.trim().toLowerCase() !== host.trim().toLowerCase());

    let passwordEnc = hasChangedProvider ? "" : (prev?.passwordEnc ?? "");
    if (ch.password.trim()) {
      passwordEnc = encryptSecret(ch.password.trim());
    } else if (ch.clearPassword) {
      passwordEnc = "";
    }

    const hasResolvedSecret =
      Boolean(decryptSecret(passwordEnc)) || (ch.useEnvPassword && Boolean(e.SMTP_PASSWORD));
    if (ch.enabled && isBrevoApi && !hasResolvedSecret) {
      throw new ValidationError(
        `${id === "primary" ? "Primary" : "Fallback"} Brevo HTTPS API channel requires a Brevo API key.`,
      );
    }

    return {
      id,
      enabled: ch.enabled,
      label: ch.label || (id === "primary" ? "Primary mail" : "Fallback mail"),
      transport: ch.transport,
      host: host.trim(),
      port,
      secure,
      user: isBrevoApi ? "" : ch.user.trim(),
      passwordEnc,
      useEnvPassword: isBrevoApi ? false : ch.useEnvPassword,
      fromName: ch.fromName || e.SMTP_FROM_NAME,
      fromEmail: ch.fromEmail.trim(),
      replyTo: ch.replyTo.trim(),
      dailyBudget: ch.dailyBudget,
    };
  };

  const toStore: z.infer<typeof storedMailConfigSchema> = {
    strategy: input.strategy,
    primary: validateAndBuild("primary", input.primary, existingParsed.success ? existingParsed.data.primary : undefined),
    fallback: validateAndBuild("fallback", input.fallback, existingParsed.success ? existingParsed.data.fallback : undefined),
  };

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: MAIL_CHANNELS_KEY },
      create: { key: MAIL_CHANNELS_KEY, value: toStore as unknown as Prisma.InputJsonValue, updatedById: u.id },
      update: { value: toStore as unknown as Prisma.InputJsonValue, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "settings.mail_channels_changed",
        entityType: "setting",
        entityId: MAIL_CHANNELS_KEY,
        ip,
        metadata: {
          strategy: toStore.strategy,
          primaryEnabled: toStore.primary.enabled,
          primaryHost: toStore.primary.host,
          primaryTransport: toStore.primary.transport,
          primaryBudget: toStore.primary.dailyBudget,
          fallbackEnabled: toStore.fallback.enabled,
          fallbackHost: toStore.fallback.host,
          fallbackTransport: toStore.fallback.transport,
          fallbackBudget: toStore.fallback.dailyBudget,
        },
      },
      tx,
    );
  });

  const result: MailChannelsConfig = {
    strategy: toStore.strategy,
    fromDb: true,
    primary: hydrateChannel(toStore.primary, e),
    fallback: hydrateChannel(toStore.fallback, e),
  };
  cachedMailConfig = result;
  mailConfigSignature = computeSignature(result, cachedRuntimeOverrides);
  lastLoadedAt = Date.now();
  return result;
}

/** Returns the active outward From address for help/status display. */
export function activeSenderEmail(mail: MailChannelsConfig): string {
  const active =
    mail.strategy === "fallback-only"
      ? mail.fallback
      : mail.primary.enabled
        ? mail.primary
        : mail.fallback.enabled
          ? mail.fallback
          : mail.primary;
  return active.fromEmail || env().SMTP_FROM_EMAIL || env().SMTP_USER || "";
}

/** Swaps Primary and Fallback channels (preserving encrypted passwords) in one atomic update. */
export async function swapMailChannelsConfig(
  user: SessionUser | null,
  ip?: string,
): Promise<MailChannelsConfig> {
  const u = requirePermission(user, "settings:manage");
  const e = env();
  const { mail } = await loadRuntimeConfig(true);
  const existingRow = await prisma.systemSetting.findUnique({ where: { key: MAIL_CHANNELS_KEY } });
  const existingParsed = storedMailConfigSchema.safeParse(existingRow?.value);

  const toStoredChannel = (
    targetId: MailChannelId,
    ch: MailChannelConfig,
    prevEnc?: string,
  ): z.infer<typeof storedChannelSchema> => ({
    id: targetId,
    enabled: ch.enabled,
    label: ch.label,
    transport: ch.transport,
    host: ch.host,
    port: ch.port,
    secure: ch.secure,
    user: ch.user,
    passwordEnc: prevEnc ?? (ch.password && !ch.useEnvPassword ? encryptSecret(ch.password) : ""),
    useEnvPassword: ch.useEnvPassword,
    fromName: ch.fromName,
    fromEmail: ch.fromEmail,
    replyTo: ch.replyTo,
    dailyBudget: ch.dailyBudget,
  });

  const prevPrimaryEnc = existingParsed.success ? existingParsed.data.primary.passwordEnc : undefined;
  const prevFallbackEnc = existingParsed.success ? existingParsed.data.fallback.passwordEnc : undefined;

  const toStore: z.infer<typeof storedMailConfigSchema> = {
    strategy: "primary-first",
    primary: toStoredChannel("primary", mail.fallback, prevFallbackEnc),
    fallback: toStoredChannel("fallback", mail.primary, prevPrimaryEnc),
  };

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: MAIL_CHANNELS_KEY },
      create: { key: MAIL_CHANNELS_KEY, value: toStore as unknown as Prisma.InputJsonValue, updatedById: u.id },
      update: { value: toStore as unknown as Prisma.InputJsonValue, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "settings.mail_channels_changed",
        entityType: "setting",
        entityId: MAIL_CHANNELS_KEY,
        ip,
        metadata: { swapped: true, primaryHost: toStore.primary.host, fallbackHost: toStore.fallback.host },
      },
      tx,
    );
  });

  const result: MailChannelsConfig = {
    strategy: toStore.strategy,
    fromDb: true,
    primary: hydrateChannel(toStore.primary, e),
    fallback: hydrateChannel(toStore.fallback, e),
  };
  cachedMailConfig = result;
  mailConfigSignature = computeSignature(result, cachedRuntimeOverrides);
  lastLoadedAt = Date.now();
  return result;
}

export async function getEditableRuntimeEnv(user: SessionUser | null) {
  requirePermission(user, "settings:manage");
  const base = env();
  const { runtimeEnv } = await loadRuntimeConfig(true);
  return {
    overrides: runtimeEnv,
    fields: RUNTIME_ENV_FIELDS.map((f) => ({
      ...f,
      value: runtimeEnv[f.key] ?? base[f.key],
      envDefault: base[f.key],
      overridden: typeof runtimeEnv[f.key] === "number",
    })),
  };
}

export async function saveRuntimeEnvConfig(
  user: SessionUser | null,
  rawInput: unknown,
  ip?: string,
): Promise<RuntimeEnvOverrides> {
  const u = requirePermission(user, "settings:manage");
  const parsed = runtimeEnvInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid runtime configuration value");
  }
  const clean = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => typeof v === "number" && Number.isFinite(v)),
  ) as RuntimeEnvOverrides;

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: RUNTIME_ENV_KEY },
      create: { key: RUNTIME_ENV_KEY, value: clean as Prisma.InputJsonValue, updatedById: u.id },
      update: { value: clean as Prisma.InputJsonValue, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "settings.runtime_env_changed",
        entityType: "setting",
        entityId: RUNTIME_ENV_KEY,
        ip,
        metadata: { ...clean },
      },
      tx,
    );
  });

  cachedRuntimeOverrides = clean;
  if (cachedMailConfig) mailConfigSignature = computeSignature(cachedMailConfig, cachedRuntimeOverrides);
  lastLoadedAt = Date.now();
  return clean;
}

export async function resetRuntimeEnvConfig(user: SessionUser | null, ip?: string): Promise<void> {
  const u = requirePermission(user, "settings:manage");
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.deleteMany({ where: { key: RUNTIME_ENV_KEY } });
    await audit(
      {
        actorId: u.id,
        action: "settings.runtime_env_changed",
        entityType: "setting",
        entityId: RUNTIME_ENV_KEY,
        ip,
        metadata: { resetToEnvDefaults: true },
      },
      tx,
    );
  });
  cachedRuntimeOverrides = {};
  if (cachedMailConfig) mailConfigSignature = computeSignature(cachedMailConfig, cachedRuntimeOverrides);
  lastLoadedAt = Date.now();
}
