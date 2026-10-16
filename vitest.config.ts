import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          sequence: { concurrent: false },
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30000,
          setupFiles: ["tests/integration/setup.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
        },
      },
      { extends: true, test: { name: "pdf", include: ["tests/pdf-regression/**/*.test.ts"], environment: "node", testTimeout: 180000 } },
    ],
  },
});
