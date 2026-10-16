import { defineConfig } from "@playwright/test";

// E2E tests run against a running instance (default: host dev server). Seed demo data first:
//   SEED_DEMO=true npm run db:seed
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
});
