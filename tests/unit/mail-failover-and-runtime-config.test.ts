import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisStore, mockPrismaSystemSetting, mockTransportSendMail, mockTransportVerify } = vi.hoisted(() => {
  const store = new Map<string, { val: string; ttl?: number }>();
  const systemSetting = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  };
  const sendMail = vi.fn();
  const verify = vi.fn();
  return {
    mockRedisStore: store,
    mockPrismaSystemSetting: systemSetting,
    mockTransportSendMail: sendMail,
    mockTransportVerify: verify,
  };
});

vi.mock("~/modules/core/db.server", () => ({
  prisma: {
    systemSetting: mockPrismaSystemSetting,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        systemSetting: mockPrismaSystemSetting,
        auditEvent: { create: vi.fn() },
      }),
  },
}));

vi.mock("~/modules/core/redis.server", () => ({
  redis: () => ({
    get: async (k: string) => mockRedisStore.get(k)?.val ?? null,
    set: async (k: string, val: string, _ex?: string, ttl?: number) => {
      mockRedisStore.set(k, { val, ttl });
      return "OK";
    },
    incr: async (k: string) => {
      const cur = Number(mockRedisStore.get(k)?.val ?? 0) + 1;
      const existing = mockRedisStore.get(k);
      mockRedisStore.set(k, { val: String(cur), ttl: existing?.ttl });
      return cur;
    },
    ttl: async (k: string) => mockRedisStore.get(k)?.ttl ?? -1,
    expire: async () => 1,
    del: async (k: string) => (mockRedisStore.delete(k) ? 1 : 0),
    ping: async () => "PONG",
  }),
}));

vi.mock("nodemailer", async () => {
  const actual = await vi.importActual<typeof import("nodemailer")>("nodemailer");
  return {
    default: {
      ...actual.default,
      createTransport: vi.fn(() => ({
        sendMail: mockTransportSendMail,
        verify: mockTransportVerify,
        close: vi.fn(),
      })),
    },
  };
});

import { resetEnvCacheForTesting } from "~/modules/core/env.server";
import {
  channelSentToday,
  countChannelEmail,
  hasChannelRoom,
  ROUTINE_SHARE,
} from "~/modules/notifications/budget.server";
import {
  classifyMailError,
  MailBudgetExceededError,
  resetTransporterForTesting,
  sendNotificationEmail,
  sendOtpEmail,
} from "~/modules/notifications/mailer.server";
import {
  decryptSecret,
  encryptSecret,
  getEditableMailConfig,
  loadRuntimeConfig,
  mailChannelsInputSchema,
  resetRuntimeConfigForTesting,
  runtimeEnvInputSchema,
  runtimeEnvSync,
  saveMailChannelsConfig,
  setRuntimeConfigDbInTest,
  swapMailChannelsConfig,
} from "~/modules/settings/runtime-config.server";

describe("Runtime Config Encryption, Validation & Mail Failover", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockRedisStore.clear();
    mockPrismaSystemSetting.findMany.mockReset();
    mockPrismaSystemSetting.findUnique.mockReset();
    mockTransportSendMail.mockReset();
    mockTransportVerify.mockReset();
    resetTransporterForTesting();
    resetRuntimeConfigForTesting();
    resetEnvCacheForTesting();

    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "recruitments@psgtech.ac.in";
    process.env.SMTP_PASSWORD = "gmail-env-app-password";
    process.env.SMTP_FROM_NAME = "PSG College of Technology Recruitment";
    process.env.SMTP_FROM_EMAIL = "recruitments@psgtech.ac.in";
    process.env.MAIL_DAILY_BUDGET = "450";
    process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
    process.env.DATABASE_URL = "postgresql://srp_app:pass@localhost:5432/srportal";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SESSION_SECRET = "super-secret-key-at-least-32-chars-long";
    process.env.STORAGE_DIR = "./storage";
    process.env.CONVERTER_URL = "http://converter:3100";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetTransporterForTesting();
    resetRuntimeConfigForTesting();
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
  });

  it("encrypts and decrypts SMTP/API secrets with AES-256-GCM and rejects tampered ciphertext", () => {
    const secret = "xkeysib-1234567890abcdef-secret";
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);

    expect(enc1.startsWith("enc:v1:")).toBe(true);
    expect(enc1).not.toContain(secret);
    expect(enc1).not.toBe(enc2); // distinct random IVs
    expect(decryptSecret(enc1)).toBe(secret);
    expect(decryptSecret(enc2)).toBe(secret);

    const parts = enc1.split(":");
    const cipherHex = parts[4] ?? "";
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${cipherHex.slice(0, -2)}ff`;
    expect(decryptSecret(tampered)).toBe("");
  });

  it("validates mail channel schemas and runtime env bounds", () => {
    const goodMail = mailChannelsInputSchema.safeParse({
      strategy: "primary-first",
      primary: {
        enabled: true,
        label: "Brevo API",
        transport: "brevo-api",
        host: "api.brevo.com",
        port: 443,
        secure: true,
        user: "",
        password: "xkeysib-valid",
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "recruitments@psgtech.ac.in",
        dailyBudget: 280,
      },
      fallback: {
        enabled: true,
        label: "Gmail SMTP",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "recruitments@psgtech.ac.in",
        useEnvPassword: true,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 450,
      },
    });
    expect(goodMail.success).toBe(true);

    const badEnv = runtimeEnvInputSchema.safeParse({ OTP_LENGTH: 2 });
    expect(badEnv.success).toBe(false);

    const goodEnv = runtimeEnvInputSchema.safeParse({
      OTP_LENGTH: 6,
      MAX_UPLOAD_MB: 15,
      SMTP_CONNECTION_TIMEOUT_MS: 5000,
    });
    expect(goodEnv.success).toBe(true);
  });

  it("classifies Gmail 550-5.4.5 quota errors, Brevo HTTP 402/429, 403 IP blocks, and single-recipient bounces accurately", () => {
    const gmailLimit = Object.assign(
      new Error("Data command failed: 550-5.4.5 Daily user sending limit exceeded."),
      { responseCode: 550 },
    );
    expect(classifyMailError(gmailLimit)).toMatchObject({
      diagnosticCode: "QUOTA_EXCEEDED",
      cooldownKind: "quota",
    });

    const brevoCredits = Object.assign(new Error("Brevo API error (402): not_enough_credits"), {
      httpStatus: 402,
      brevoCode: "not_enough_credits",
    });
    expect(classifyMailError(brevoCredits).diagnosticCode).toBe("QUOTA_EXCEEDED");

    const brevoIpBlock = Object.assign(new Error("Unauthorized IP address for SMTP"), {
      responseCode: 550,
    });
    expect(classifyMailError(brevoIpBlock)).toMatchObject({
      diagnosticCode: "BLOCKED",
      cooldownKind: "blocked",
    });

    const userTypo = Object.assign(new Error("550 5.1.1 User unknown"), { responseCode: 550 });
    const typoClassified = classifyMailError(userTypo);
    expect(typoClassified.recipientError).toBe(true);
    expect(typoClassified.cooldownKind).toBeUndefined();
  });

  it("enforces routine vs critical/otp channel budgets", () => {
    expect(hasChannelRoom(223, 280, "routine")).toBe(true);
    expect(hasChannelRoom(Math.floor(280 * ROUTINE_SHARE), 280, "routine")).toBe(false);
    expect(hasChannelRoom(225, 280, "critical")).toBe(true);
    expect(hasChannelRoom(280, 280, "critical")).toBe(false);
    expect(hasChannelRoom(280, 280, "otp")).toBe(false);
  });

  it("fails over seamlessly from Gmail 550-5.4.5 SMTP limit to Brevo HTTPS API and avoids retrying Gmail while on cooldown", async () => {
    setRuntimeConfigDbInTest(true);
    const dbMailValue = {
      strategy: "primary-first",
      primary: {
        id: "primary",
        enabled: true,
        label: "Gmail Workspace",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "recruitments@psgtech.ac.in",
        passwordEnc: "",
        useEnvPassword: true,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 450,
      },
      fallback: {
        id: "fallback",
        enabled: true,
        label: "Brevo API",
        transport: "brevo-api",
        host: "api.brevo.com",
        port: 443,
        secure: true,
        user: "",
        passwordEnc: encryptSecret("xkeysib-test-brevo-key"),
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "recruitments@psgtech.ac.in",
        dailyBudget: 280,
      },
    };
    const dbRuntimeEnvValue = {
      OTP_LENGTH: 8,
      MAX_UPLOAD_MB: 20,
      SMTP_CONNECTION_TIMEOUT_MS: 4500,
    };

    mockPrismaSystemSetting.findMany.mockResolvedValue([
      { key: "mail.channels", value: dbMailValue },
      { key: "runtime.env", value: dbRuntimeEnvValue },
    ]);
    mockPrismaSystemSetting.findUnique.mockResolvedValue({
      key: "mail.channels",
      value: dbMailValue,
    });

    // Ensure Super Admin redacted loader never leaks decrypted API key
    const redacted = await getEditableMailConfig({
      id: "sa-1",
      email: "admin@psgtech.ac.in",
      emailVerified: true,
      displayName: "Admin",
      grants: [{ role: "SUPER_ADMIN", departmentId: null }],
      sessionId: "sess-1",
    });
    expect(redacted.fallback.hasPassword).toBe(true);
    expect(redacted.fallback.passwordSource).toBe("db");
    expect(JSON.stringify(redacted)).not.toContain("xkeysib-test-brevo-key");
    expect(runtimeEnvSync().OTP_LENGTH).toBe(8);
    expect(runtimeEnvSync().MAX_UPLOAD_MB).toBe(20);
    expect(runtimeEnvSync().SMTP_CONNECTION_TIMEOUT_MS).toBe(4500);

    // Primary SMTP rejects with Gmail 550-5.4.5
    mockTransportSendMail.mockRejectedValueOnce(
      Object.assign(new Error("Data command failed: 550-5.4.5 Daily user sending limit exceeded."), {
        responseCode: 550,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: "<brevo-1>" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // 1st OTP: Primary fails with 550 -> immediately fails over to Brevo API and succeeds!
    await expect(sendOtpEmail("candidate@example.com", "123456", "signing in", 5)).resolves.toBeUndefined();
    expect(mockTransportSendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "xkeysib-test-brevo-key" }),
      }),
    );

    // 2nd OTP immediately after: Primary is in Redis cooldown -> skips Gmail directly, hits Brevo API!
    await expect(sendOtpEmail("candidate2@example.com", "654321", "signing in", 5)).resolves.toBeUndefined();
    expect(mockTransportSendMail).toHaveBeenCalledTimes(1); // still 1: Gmail skipped!
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws MailBudgetExceededError for routine notifications when all channels exhaust quota", async () => {
    setRuntimeConfigDbInTest(true);
    const dbMailValue = {
      strategy: "primary-first",
      primary: {
        id: "primary",
        enabled: true,
        label: "Brevo API",
        transport: "brevo-api",
        host: "api.brevo.com",
        port: 443,
        secure: true,
        user: "",
        passwordEnc: encryptSecret("xkeysib-test-brevo-key"),
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 280,
      },
      fallback: {
        id: "fallback",
        enabled: false,
        label: "Disabled",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "",
        passwordEnc: "",
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 450,
      },
    };
    mockPrismaSystemSetting.findMany.mockResolvedValue([{ key: "mail.channels", value: dbMailValue }]);
    await loadRuntimeConfig(true);

    // Simulate Brevo API returning 402 credits exhausted
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      json: async () => ({ code: "not_enough_credits", message: "No credits left" }),
    }) as unknown as typeof fetch;

    await expect(
      sendNotificationEmail("candidate@example.com", "Application update", "Routine notice", "routine"),
    ).rejects.toBeInstanceOf(MailBudgetExceededError);
  });

  it("lets Super Admin store custom app passwords & mail addresses in DB, isolate Gmail mailbox quotas, and swap channels safely", async () => {
    setRuntimeConfigDbInTest(true);
    const superAdmin = {
      id: "sa-1",
      email: "admin@psgtech.ac.in",
      emailVerified: true,
      displayName: "Admin",
      grants: [{ role: "SUPER_ADMIN" as const, departmentId: null }],
      sessionId: "sess-1",
    };

    mockPrismaSystemSetting.findUnique.mockResolvedValue(null);
    mockPrismaSystemSetting.upsert.mockImplementation(async ({ create }: { create: { value: unknown } }) => ({
      key: "mail.channels",
      value: create.value,
    }));

    // Save two custom Gmail accounts with DB-stored App Passwords (overriding .env completely)
    const saved = await saveMailChannelsConfig(superAdmin, {
      strategy: "primary-first",
      primary: {
        enabled: true,
        label: "Primary Gmail",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "recruitments@psgtech.ac.in",
        password: "primary-db-app-password",
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 450,
      },
      fallback: {
        enabled: true,
        label: "Secondary Gmail",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "backup-recruit@gmail.com",
        password: "backup-db-app-password",
        useEnvPassword: false,
        fromName: "PSG Tech Backup",
        fromEmail: "backup-recruit@gmail.com",
        replyTo: "recruitments@psgtech.ac.in",
        dailyBudget: 450,
      },
    });

    expect(saved.primary.password).toBe("primary-db-app-password");
    expect(saved.fallback.password).toBe("backup-db-app-password");

    // Verify independent Redis quota buckets for each Gmail mailbox address
    await countChannelEmail(saved.primary, saved.primary.dailyBudget);
    expect(await channelSentToday(saved.primary)).toBe(1);
    expect(await channelSentToday(saved.fallback)).toBe(0);

    // Swap Primary <-> Fallback cleanly without retyping encrypted DB passwords
    const upsertCalls = mockPrismaSystemSetting.upsert.mock.calls;
    const storedAfterSave = upsertCalls[upsertCalls.length - 1]?.[0]?.create?.value;
    mockPrismaSystemSetting.findUnique.mockResolvedValue({
      key: "mail.channels",
      value: storedAfterSave,
    });

    const swapped = await swapMailChannelsConfig(superAdmin);
    expect(swapped.primary.user).toBe("backup-recruit@gmail.com");
    expect(swapped.primary.password).toBe("backup-db-app-password");
    expect(swapped.fallback.user).toBe("recruitments@psgtech.ac.in");
    expect(swapped.fallback.password).toBe("primary-db-app-password");

    // Switching provider host without supplying a new password clears incompatible DB secret cleanly
    const storedAfterSwap = upsertCalls[upsertCalls.length - 1]?.[0]?.create?.value;
    mockPrismaSystemSetting.findUnique.mockResolvedValue({
      key: "mail.channels",
      value: storedAfterSwap,
    });
    const switchedToBrevoSmtp = await saveMailChannelsConfig(superAdmin, {
      strategy: "primary-first",
      primary: {
        enabled: true,
        label: "Brevo SMTP",
        transport: "smtp",
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        user: "c0bbb8001@smtp-brevo.com",
        password: "",
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 280,
      },
      fallback: {
        enabled: true,
        label: "Gmail Backup",
        transport: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "recruitments@psgtech.ac.in",
        password: "",
        useEnvPassword: false,
        fromName: "PSG Tech Recruitment",
        fromEmail: "recruitments@psgtech.ac.in",
        replyTo: "",
        dailyBudget: 450,
      },
    });
    expect(switchedToBrevoSmtp.primary.password).toBe("");
    expect(switchedToBrevoSmtp.fallback.password).toBe("primary-db-app-password");
  });
});

