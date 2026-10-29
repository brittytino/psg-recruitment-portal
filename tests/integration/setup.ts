import { readFileSync } from "node:fs";

// Credentials come from .env.development so the test defaults can never drift from the dev stack.
const devEnv = Object.fromEntries(
  readFileSync(".env.development", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

// Integration tests run on the host against the dev Compose services
// (docker compose -f compose.yaml -f compose.dev.yaml up -d db redis converter clamav mailpit).
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: `postgresql://srp_app:${devEnv.APP_DB_PASSWORD}@localhost:6543/srportal_test?schema=public`,
  REDIS_URL: "redis://localhost:63879",
  SESSION_SECRET: "integration-test-secret-at-least-32-characters",
  STORAGE_DIR: "./storage-test",
  CONVERTER_URL: "http://localhost:63100",
  CONVERTER_TOKEN: devEnv.CONVERTER_TOKEN ?? "",
  MALWARE_SCAN: "clamav",
  CLAMAV_HOST: "localhost",
  CLAMAV_PORT: "63310",
  SMTP_HOST: "localhost",
  SMTP_PORT: "2525",
  MAIL_FROM: "Test <test@localhost>",
  LOG_LEVEL: "warn",
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
