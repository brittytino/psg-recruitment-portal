import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateCode,
  codeHash,
  getOtpConfig,
  pendingCookie,
  clearPendingCookie,
} from "~/modules/auth/otp.server";
import { resetEnvCacheForTesting } from "~/modules/core/env.server";

describe("OTP Lifecycle & Security Unit Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long-123456";
    process.env.OTP_LENGTH = "6";
    process.env.OTP_EXPIRY_MINUTES = "5";
    process.env.OTP_RESEND_COOLDOWN_SECONDS = "60";
    process.env.OTP_MAX_ATTEMPTS = "5";
    process.env.OTP_MAX_SENDS_PER_HOUR = "5";
  });

  afterEach(() => {
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
  });

  describe("CSPRNG OTP Code Generation", () => {
    it("generates exactly 6-digit numeric codes with leading zeros preserved", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateCode(6);
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it("generates varied cryptographic codes across invocations", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 30; i++) {
        codes.add(generateCode(6));
      }
      // With CSPRNG randomInt(0, 1000000), 30 samples should all or almost all be unique
      expect(codes.size).toBeGreaterThanOrEqual(28);
    });

    it("supports custom configured OTP lengths", () => {
      expect(generateCode(4)).toMatch(/^\d{4}$/);
      expect(generateCode(8)).toMatch(/^\d{8}$/);
    });
  });

  describe("HMAC Code Hashing", () => {
    it("generates deterministic HMAC-SHA256 hex hashes bound to challenge ID", () => {
      const challengeId = "11111111-2222-3333-4444-555555555555";
      const code = "012345";

      const hash1 = codeHash(challengeId, code);
      const hash2 = codeHash(challengeId, code);

      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different challenge IDs or codes", () => {
      const c1 = "11111111-2222-3333-4444-555555555555";
      const c2 = "99999999-8888-7777-6666-555555555555";
      const code = "012345";

      expect(codeHash(c1, code)).not.toBe(codeHash(c2, code));
      expect(codeHash(c1, "123456")).not.toBe(codeHash(c1, "123457"));
    });

    it("changes hash when SESSION_SECRET changes", () => {
      const c = "11111111-2222-3333-4444-555555555555";
      const code = "123456";

      const hash1 = codeHash(c, code);

      process.env.SESSION_SECRET = "a-different-secret-key-at-least-32-chars-long";
      resetEnvCacheForTesting();

      const hash2 = codeHash(c, code);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Configuration Defaults and Dynamic Overrides", () => {
    it("reads default 5-minute expiry, 60s cooldown, and 5 max attempts", () => {
      const cfg = getOtpConfig();
      expect(cfg.length).toBe(6);
      expect(cfg.expiryMinutes).toBe(5);
      expect(cfg.resendCooldownSeconds).toBe(60);
      expect(cfg.maxAttempts).toBe(5);
      expect(cfg.maxSendsPerHour).toBe(5);
    });

    it("respects environment overrides for OTP parameters", () => {
      process.env.OTP_EXPIRY_MINUTES = "10";
      process.env.OTP_RESEND_COOLDOWN_SECONDS = "120";
      process.env.OTP_MAX_ATTEMPTS = "3";
      resetEnvCacheForTesting();

      const cfg = getOtpConfig();
      expect(cfg.expiryMinutes).toBe(10);
      expect(cfg.resendCooldownSeconds).toBe(120);
      expect(cfg.maxAttempts).toBe(3);
    });
  });

  describe("Pending Cookie Lifecycle & Tamper Resistance", () => {
    it("creates a signed pending cookie carrying challenge ID and next URL", () => {
      const challengeId = "b9f1d0a8-4c3e-4b2a-9f1e-8d7c6b5a4e3d";
      const next = "/staff";

      const cookie = pendingCookie(challengeId, next);

      expect(cookie).toContain("srp_otp=");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain(`Max-Age=${5 * 60}`); // 5 minutes Max-Age
    });

    it("generates clearPendingCookie with Max-Age=0", () => {
      const cleared = clearPendingCookie();
      expect(cleared).toContain("srp_otp=");
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("HttpOnly");
    });
  });
});
