import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "build-worker/**",
      ".react-router/**",
      "node_modules/**",
      "storage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true, allowShortCircuit: true }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  {
    files: ["scripts/**", "converter/**", "infrastructure/**", "prisma/seed.ts", "tests/**"],
    rules: { "no-console": "off" },
  },
);
