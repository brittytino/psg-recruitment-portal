import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env, resetEnvCacheForTesting } from "~/modules/core/env.server";
import {
  isSuperAdmin,
  isAdmin,
  isHrOfficer,
  isHodReviewer,
  hodDepartments,
  homePath,
  hasPermission,
  primaryRoleLabel,
  type RoleGrant,
} from "~/modules/auth/permissions";
import { cookieName, csrfToken, verifyCsrf, type SessionUser } from "~/modules/auth/session.server";
import { staffApplicationScope, hrScope } from "~/modules/auth/policy.server";
import { loader as smtpHealthLoader } from "~/routes/health/smtp";

describe("Authentication & Authorization Security Controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
    process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
    process.env.DATABASE_URL = "postgresql://srp_app:pass@db:5432/srportal";
    process.env.REDIS_URL = "redis://redis:6379";
    process.env.SESSION_SECRET = "production-grade-session-secret-at-least-32-chars";
    process.env.STORAGE_DIR = "/var/lib/srportal/storage";
    process.env.CONVERTER_URL = "http://converter:3100";
    process.env.EMAIL_PROVIDER = "test";
    process.env.SMTP_HOST = "smtp.psgtech.ac.in";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "recruitments@psgtech.ac.in";
    process.env.SMTP_PASSWORD = "app-specific-secret";
    process.env.DEV_LOG_OTP = "false";
  });

  afterEach(() => {
    resetEnvCacheForTesting();
    process.env = { ...originalEnv };
  });

  describe("Production Environment Validation Rules", () => {
    it("strictly prohibits EMAIL_PROVIDER=mailpit in production", () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "mailpit";
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/EMAIL_PROVIDER=mailpit is not allowed in production/);
    });

    it("strictly prohibits EMAIL_PROVIDER=test in production", () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "test";
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/EMAIL_PROVIDER=test is not allowed in production/);
    });

    it("requires institutional SMTP credentials when NODE_ENV=production", () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "mailpit"; // invalid in prod
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/Invalid production SMTP_HOST/);
    });

    it("requires SMTP_USER and SMTP_PASSWORD in production", () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_USER = "";
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/SMTP_USER is required for production/);

      process.env.SMTP_USER = "recruitments@psgtech.ac.in";
      process.env.SMTP_PASSWORD = "";
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/SMTP_PASSWORD is required for production/);
    });

    it("prohibits DEV_LOG_OTP=true in production", () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_PROVIDER = "smtp";
      process.env.SMTP_HOST = "smtp.psgtech.ac.in";
      process.env.SMTP_USER = "recruitments@psgtech.ac.in";
      process.env.SMTP_PASSWORD = "secure-password";
      process.env.DEV_LOG_OTP = "true";
      resetEnvCacheForTesting();

      expect(() => env()).toThrow(/DEV_LOG_OTP=true is not allowed in production/);
    });
  });

  describe("Role Authorization Matrix & Hierarchy", () => {
    const superAdminGrants: RoleGrant[] = [{ role: "SUPER_ADMIN", departmentId: null }];
    const adminGrants: RoleGrant[] = [{ role: "ADMIN", departmentId: null }];
    const hrGrants: RoleGrant[] = [{ role: "HR", departmentId: null }];
    const hodGrants: RoleGrant[] = [{ role: "HOD", departmentId: "dept-cse-101" }];
    const candidateGrants: RoleGrant[] = [{ role: "CANDIDATE", departmentId: null }];

    it("preserves Super Admin (Tino) full system permissions", () => {
      expect(isSuperAdmin(superAdminGrants)).toBe(true);
      expect(isAdmin(superAdminGrants)).toBe(true);
      expect(hasPermission(superAdminGrants, "system:manage")).toBe(true);
      expect(hasPermission(superAdminGrants, "user:manage")).toBe(true);
      expect(hasPermission(superAdminGrants, "audit:read")).toBe(true);
      expect(primaryRoleLabel(superAdminGrants)).toBe("Super Admin");
      expect(homePath(superAdminGrants)).toBe("/staff");
    });

    it("preserves Admin (Dean / Principal) administrative permissions", () => {
      expect(isSuperAdmin(adminGrants)).toBe(false);
      expect(isAdmin(adminGrants)).toBe(true);
      expect(hasPermission(adminGrants, "position:approve")).toBe(true);
      expect(hasPermission(adminGrants, "recruitment:manage")).toBe(true);
      expect(hasPermission(adminGrants, "system:manage")).toBe(false); // only Super Admin
      expect(primaryRoleLabel(adminGrants)).toBe("Admin");
      expect(homePath(adminGrants)).toBe("/staff");
    });

    it("preserves HR (N4 Section) permissions", () => {
      expect(isHrOfficer(hrGrants)).toBe(true);
      expect(isAdmin(hrGrants)).toBe(false);
      expect(hasPermission(hrGrants, "application:list")).toBe(true);
      expect(hasPermission(hrGrants, "application:export")).toBe(true);
      expect(hasPermission(hrGrants, "position:approve")).toBe(false); // needs Admin
      expect(primaryRoleLabel(hrGrants)).toBe("HR – N4 Section");
      expect(homePath(hrGrants)).toBe("/staff");
    });

    it("scopes HOD reviewers to assigned departments and routes to review dashboard", () => {
      expect(isHodReviewer(hodGrants)).toBe(true);
      expect(hodDepartments(hodGrants)).toEqual(["dept-cse-101"]);
      expect(hasPermission(hodGrants, "review:record")).toBe(true);
      expect(hasPermission(hodGrants, "application:export")).toBe(false); // HR/Admin only
      expect(primaryRoleLabel(hodGrants)).toBe("HOD");
      expect(homePath(hodGrants)).toBe("/staff/review");
    });

    it("limits Candidates to their own application and routes to account", () => {
      expect(hasPermission(candidateGrants, "application:own")).toBe(true);
      expect(hasPermission(candidateGrants, "application:list")).toBe(false);
      expect(primaryRoleLabel(candidateGrants)).toBe("Applicant");
      expect(homePath(candidateGrants)).toBe("/account");
    });

    it("evaluates staff application scope correctly for all institutional roles", () => {
      const mockUser = (grants: RoleGrant[], id = "user-1"): SessionUser => ({
        id,
        email: "test@psgtech.ac.in",
        emailVerified: true,
        displayName: "Test User",
        grants,
        sessionId: "sess-1",
      });

      // Super Admin (Tino) -> all submitted applications
      expect(staffApplicationScope(mockUser(superAdminGrants))).toEqual({ status: { not: "DRAFT" } });
      expect(hrScope(mockUser(superAdminGrants))).toEqual({ status: { not: "DRAFT" } });

      // Admin (Dean / Principal) -> all submitted applications
      expect(staffApplicationScope(mockUser(adminGrants))).toEqual({ status: { not: "DRAFT" } });
      expect(hrScope(mockUser(adminGrants))).toEqual({ status: { not: "DRAFT" } });

      // HR (N4 Section, unscoped cycleId) -> all submitted applications
      expect(staffApplicationScope(mockUser(hrGrants))).toEqual({ status: { not: "DRAFT" } });
      expect(hrScope(mockUser(hrGrants))).toEqual({ status: { not: "DRAFT" } });

      // HOD -> scoped to assigned department & id
      expect(staffApplicationScope(mockUser(hodGrants, "hod-user-1"))).toEqual({
        AND: [
          { status: { not: "DRAFT" } },
          { OR: [{ assignedHodId: "hod-user-1", vacancy: { departmentId: { in: ["dept-cse-101"] } } }] },
        ],
      });
      expect(hrScope(mockUser(hodGrants, "hod-user-1"))).toBeNull();

      // Candidate -> no staff scope
      expect(staffApplicationScope(mockUser(candidateGrants))).toBeNull();
      expect(hrScope(mockUser(candidateGrants))).toBeNull();
    });
  });

  describe("Session Security & Cookie Configuration", () => {
    it("uses __Host- prefix when COOKIE_SECURE is enabled", () => {
      process.env.COOKIE_SECURE = "true";
      resetEnvCacheForTesting();
      expect(cookieName()).toBe("__Host-srp_session");

      process.env.COOKIE_SECURE = "false";
      resetEnvCacheForTesting();
      expect(cookieName()).toBe("srp_session");
    });

    it("generates and verifies HMAC-based CSRF tokens bound to session", () => {
      const sessionId = "sess_abcdef123456";
      const token = csrfToken(sessionId);

      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);
      expect(verifyCsrf(sessionId, token)).toBe(true);
      expect(verifyCsrf("different_session", token)).toBe(false);
      expect(verifyCsrf(sessionId, "invalid_tampered_token")).toBe(false);
    });
  });

  describe("SMTP Health Check Endpoint (/healthz/smtp)", () => {
    it("returns 200 and safe diagnostic json without leaking sensitive credentials", async () => {
      process.env.EMAIL_PROVIDER = "test";
      resetEnvCacheForTesting();

      const response = await smtpHealthLoader();
      expect(response.status).toBe(200);

      const data = (await response.json()) as { status: string; provider: string; message: string };
      expect(data.status).toBe("ok");
      expect(data.provider).toBe("test");
      expect(data.message).toBeDefined();

      // Ensure no passwords or internal hostnames leaked
      const bodyString = JSON.stringify(data);
      expect(bodyString).not.toContain("password");
      expect(bodyString).not.toContain("pass");
      expect(bodyString).not.toContain("secret");
    });
  });

  describe("CORS & Origin Validation Controls", () => {
    it("allows requests from the configured APP_ORIGIN", async () => {
      process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
      resetEnvCacheForTesting();

      const { isOriginAllowed } = await import("~/lib/origin.server");
      const req = new Request("https://recruitments.psgtech.ac.in/login", {
        headers: { host: "recruitments.psgtech.ac.in" },
      });
      expect(isOriginAllowed("https://recruitments.psgtech.ac.in", req)).toBe(true);
    });

    it("allows requests from localhost / loopback during local development or demo", async () => {
      process.env.APP_ORIGIN = "http://localhost:6969";
      resetEnvCacheForTesting();

      const { isOriginAllowed } = await import("~/lib/origin.server");
      const req1 = new Request("http://localhost:6969/login", {
        headers: { host: "localhost:6969" },
      });
      expect(isOriginAllowed("http://localhost:6969", req1)).toBe(true);

      // Equivalence between 127.0.0.1 and localhost
      const req2 = new Request("http://localhost:6969/login", {
        headers: { host: "localhost:6969" },
      });
      expect(isOriginAllowed("http://127.0.0.1:6969", req2)).toBe(true);
    });

    it("allows loopback demo access even if APP_ORIGIN is production", async () => {
      process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
      process.env.NODE_ENV = "development";
      resetEnvCacheForTesting();

      const { isOriginAllowed } = await import("~/lib/origin.server");
      const req = new Request("http://localhost:6969/login", {
        headers: { host: "localhost:6969" },
      });
      expect(isOriginAllowed("http://localhost:6969", req)).toBe(true);
      expect(isOriginAllowed("http://127.0.0.1:6969", req)).toBe(true);
    });

    it("allows explicitly configured ALLOWED_ORIGINS", async () => {
      process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
      process.env.ALLOWED_ORIGINS = "https://demo.psgtech.ac.in,http://localhost:3000";
      resetEnvCacheForTesting();

      const { isOriginAllowed } = await import("~/lib/origin.server");
      const req = new Request("https://demo.psgtech.ac.in/login", {
        headers: { host: "demo.psgtech.ac.in" },
      });
      expect(isOriginAllowed("https://demo.psgtech.ac.in", req)).toBe(true);
      expect(isOriginAllowed("http://localhost:3000", req)).toBe(true);
    });

    it("strictly blocks malicious cross-origin forgery attacks", async () => {
      process.env.APP_ORIGIN = "https://recruitments.psgtech.ac.in";
      resetEnvCacheForTesting();

      const { isOriginAllowed } = await import("~/lib/origin.server");
      const req = new Request("https://recruitments.psgtech.ac.in/login", {
        headers: { host: "recruitments.psgtech.ac.in" },
      });
      expect(isOriginAllowed("https://evil.attacker.com", req)).toBe(false);
      expect(isOriginAllowed("https://phishing-psgtech.ac.in.attacker.org", req)).toBe(false);
    });
  });
});
