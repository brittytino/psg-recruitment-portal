import pino from "pino";

/**
 * Structured JSON logger. Sensitive fields are redacted by key wherever they appear; callers must
 * still never pass application answers, document contents, passwords or tokens to the logger.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.ROLE ?? "web", version: process.env.GIT_SHA ?? "dev" },
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
});
