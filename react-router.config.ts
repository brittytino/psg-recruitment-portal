import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  future: {
    // Route middleware (used by app/root.tsx for session resolution and Origin checks).
    v8_middleware: true,
  },
} satisfies Config;
