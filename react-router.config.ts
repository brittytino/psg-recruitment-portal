import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  allowedActionOrigins: [
    "recruitments.psgtech.ac.in",
    "*.psgtech.ac.in",
    "localhost:*",
    "127.0.0.1:*",
    "localhost",
    "127.0.0.1",
    "**",
  ],
  future: {
    // Route middleware (used by app/root.tsx for session resolution and Origin checks).
    v8_middleware: true,
  },
} satisfies Config;
