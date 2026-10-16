import { execSync } from "node:child_process";

/** Creates (if needed) and migrates the isolated integration-test database, then registers templates. */
export default function setup() {
  const owner = process.env.TEST_OWNER_URL ?? "postgresql://srp_owner:change-me-owner@localhost:65432";
  const run = (cmd: string, env: Record<string, string> = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
  try {
    run(`docker compose exec -T db psql -U srp_owner -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='srportal_test'" | grep -q 1 || docker compose exec -T db psql -U srp_owner -d postgres -c "CREATE DATABASE srportal_test"`);
    run(`docker compose exec -T db psql -U srp_owner -d srportal_test -c "GRANT CONNECT ON DATABASE srportal_test TO srp_app; GRANT USAGE ON SCHEMA public TO srp_app; ALTER DEFAULT PRIVILEGES FOR ROLE srp_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO srp_app; ALTER DEFAULT PRIVILEGES FOR ROLE srp_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO srp_app;"`);
  } catch {
    throw new Error("Could not prepare srportal_test. Start the dev services: docker compose -f compose.yaml -f compose.dev.yaml up -d db redis converter clamav");
  }
  const url = `${owner}/srportal_test?schema=public`;
  run("npx prisma migrate deploy", { DATABASE_URL: url });
  run("npx tsx prisma/seed.ts", { DATABASE_URL: url });
}
