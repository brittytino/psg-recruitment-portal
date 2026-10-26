// Integration tests run on the host against the dev Compose services
// (docker compose -f compose.yaml -f compose.dev.yaml up -d db redis converter clamav mailpit).
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://srp_app:PsgTech_DbApp_2026!@localhost:6543/srportal_test?schema=public",
  REDIS_URL: "redis://localhost:63879",
  SESSION_SECRET: "integration-test-secret-at-least-32-characters",
  STORAGE_DIR: "./storage-test",
  CONVERTER_URL: "http://localhost:63100",
  CONVERTER_TOKEN: "psg_conv_sec_token_98234710293847",
  MALWARE_SCAN: "clamav",
  CLAMAV_HOST: "localhost",
  CLAMAV_PORT: "63310",
  SMTP_HOST: "localhost",
  SMTP_PORT: "2525",
  MAIL_FROM: "Test <test@localhost>",
  LOG_LEVEL: "warn",
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
