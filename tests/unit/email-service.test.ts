import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  renderOtpEmail,
  getTransporter,
  resetTransporterForTesting,
  verifySmtpConnection,
  sendOtpEmail,
} from "~/modules/notifications/mailer.server";
import { resetEnvCacheForTesting } from "~/modules/core/env.server";

describe("Email Service & Institutional Transporter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetTransporterForTesting();
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
    process.env.EMAIL_PROVIDER = "test";
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_USER = "recruitment@college.example";
    process.env.SMTP_PASSWORD = "test-mailbox-password";
    process.env.SMTP_FROM_NAME = "PSG College of Technology Recruitment";
    process.env.SMTP_FROM_EMAIL = "recruitment@college.example";
    process.env.MAIL_FROM = "PSG College of Technology Recruitment <recruitment@college.example>";
    process.env.APP_ORIGIN = "http://localhost:6969";
    process.env.DATABASE_URL = "postgresql://srp_app:pass@localhost:5432/srportal";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SESSION_SECRET = "super-secret-key-at-least-32-chars-long";
    process.env.STORAGE_DIR = "./storage";
    process.env.CONVERTER_URL = "http://converter:3100";
  });

  afterEach(() => {
    resetTransporterForTesting();
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
  });

  describe("OTP Email Template Formatting", () => {
    it("renders institutional PSG Tech recruitment branding, 6-digit code, and security notices", () => {
      const code = "048291";
      const purpose = "signing in";
      const minutes = 5;

      const { subject, text, html } = renderOtpEmail(code, purpose, minutes);

      // Subject
      expect(subject).toContain(code);
      expect(subject).toContain("PSG Tech recruitment verification code");

      // Plain Text
      expect(text).toContain("PSG COLLEGE OF TECHNOLOGY, COIMBATORE");
      expect(text).toContain("Staff Recruitment");
      expect(text).toContain(code);
      expect(text).toContain("expires in 5 minutes");
      expect(text).toContain("Never share this verification code with anyone");
      expect(text).toContain("Peelamedu, Coimbatore - 641004");
      expect(text).not.toContain("password reset"); // no password reset link
      expect(text).not.toContain("magic"); // no magic link

      // HTML Version
      expect(html).toContain("PSG College of Technology, Coimbatore");
      expect(html).toContain("Staff Recruitment");
      expect(html).toContain(code);
      expect(html).toContain("5 minutes");
      expect(html).toContain("Never share this code with anyone");
      expect(html).toContain("Peelamedu, Coimbatore");
      expect(html).toContain("<!DOCTYPE html>");
      // High contrast and monospace letter-spacing for the OTP digits
      expect(html).toContain("letter-spacing:10px");
    });

    it("correctly preserves leading zeroes in rendered email code", () => {
      const code = "000789";
      const { text, html, subject } = renderOtpEmail(code, "signing in", 5);

      expect(subject).toContain("000789");
      expect(text).toContain("    000789");
      expect(html).toContain("000789");
    });
  });

  describe("Transporter Provider Selection", () => {
    it("uses test (jsonTransport) adapter when EMAIL_PROVIDER=test", async () => {
      process.env.EMAIL_PROVIDER = "test";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      expect(transporter).toBeDefined();

      const diag = await verifySmtpConnection();
      expect(diag.ok).toBe(true);
      expect(diag.code).toBe("OK");
      expect(diag.provider).toBe("test");
    });

    it("configures Mailpit adapter without authentication on local development port", () => {
      process.env.EMAIL_PROVIDER = "mailpit";
      process.env.SMTP_HOST = "mailpit";
      process.env.SMTP_PORT = "1025";
      process.env.SMTP_SECURE = "false";
      process.env.SMTP_USER = "";
      process.env.SMTP_PASSWORD = "";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      expect(transporter).toBeDefined();
      // Mailpit transport options
      const opts = (transporter as unknown as { options: { host: string; port: number; secure: boolean } })
        .options;
      expect(opts.host).toBe("mailpit");
      expect(opts.port).toBe(1025);
      expect(opts.secure).toBe(false);
    });

    it("configures SMTP adapter with institutional credentials and TLS for production", () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_SECURE = "false";
      process.env.SMTP_USER = "recruitment@college.example";
      process.env.SMTP_PASSWORD = "app-specific-secret";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      expect(transporter).toBeDefined();

      const opts = (
        transporter as unknown as {
          options: {
            host: string;
            port: number;
            secure: boolean;
            pool: boolean;
            auth?: { user: string; pass: string };
          };
        }
      ).options;

      expect(opts.host).toBe("smtp.psgtech.ac.in");
      expect(opts.port).toBe(587);
      expect(opts.secure).toBe(false);
      expect(opts.pool).toBe(true);
      expect(opts.auth?.user).toBe("recruitment@college.example");
      expect(opts.auth?.pass).toBe("app-specific-secret");
    });
  });

  describe("SMTP Diagnostic Classification", () => {
    it("classifies DNS lookup errors cleanly without exposing credentials", async () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "unresolvable-domain-psgtech-test.invalid";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "recruitment@college.example";
      process.env.SMTP_PASSWORD = "secretPassword123";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      // Mock verify to throw ENOTFOUND error
      vi.spyOn(transporter, "verify").mockRejectedValueOnce({
        code: "EDNS",
        message: "getaddrinfo ENOTFOUND unresolvable-domain-psgtech-test.invalid",
      });

      const diag = await verifySmtpConnection(1000);
      expect(diag.ok).toBe(false);
      expect(diag.code).toBe("DNS_LOOKUP");
      expect(diag.message).toContain("DNS resolution failed");
      expect(diag.message).not.toContain("secretPassword123");
    });

    it("classifies authentication failures cleanly without exposing password", async () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "recruitment@college.example";
      process.env.SMTP_PASSWORD = "wrongPassword123";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      vi.spyOn(transporter, "verify").mockRejectedValueOnce({
        code: "EAUTH",
        responseCode: 535,
        message: "535 5.7.8 Username and Password not accepted password: wrongPassword123",
      });

      const diag = await verifySmtpConnection(1000);
      expect(diag.ok).toBe(false);
      expect(diag.code).toBe("AUTH_FAILED");
      expect(diag.message).toContain("Authentication failed");
    });

    it("classifies connection timeout cleanly", async () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "192.0.2.1"; // TEST-NET-1 unroutable
      process.env.SMTP_PORT = "587";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      vi.spyOn(transporter, "verify").mockRejectedValueOnce({
        code: "ETIMEDOUT",
        message: "Connection timed out",
      });

      const diag = await verifySmtpConnection(1000);
      expect(diag.ok).toBe(false);
      expect(diag.code).toBe("TIMEOUT");
      expect(diag.message).toContain("timed out");
    });

    it("classifies TLS certificate failures cleanly", async () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_PORT = "465";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      vi.spyOn(transporter, "verify").mockRejectedValueOnce({
        code: "ESOCKET",
        message: "DEPTH_ZERO_SELF_SIGNED_CERT self signed certificate in certificate chain",
      });

      const diag = await verifySmtpConnection(1000);
      expect(diag.ok).toBe(false);
      expect(diag.code).toBe("TLS_ERROR");
      expect(diag.message).toContain("TLS negotiation or certificate validation failed");
    });
  });

  describe("sendOtpEmail Execution & Error Sanitization", () => {
    it("successfully sends an email via the test provider", async () => {
      process.env.EMAIL_PROVIDER = "test";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      await expect(sendOtpEmail("candidate@example.com", "123456", "signing in", 5)).resolves.toBeUndefined();
    });

    it("sanitizes transport errors when SMTP delivery fails", async () => {
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_PORT = "587";
      resetEnvCacheForTesting();
      resetTransporterForTesting();

      const transporter = getTransporter();
      vi.spyOn(transporter, "sendMail").mockRejectedValueOnce(
        new Error("SMTP connection failed: password is secret123"),
      );

      await expect(sendOtpEmail("candidate@example.com", "123456", "signing in", 5)).rejects.toThrow(
        "The verification code could not be sent to your e-mail address. Please try again shortly.",
      );
    });
  });
});
