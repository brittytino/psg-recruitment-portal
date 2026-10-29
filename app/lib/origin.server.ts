import { env } from "~/modules/core/env.server";

/**
 * Validates request origin against configured and expected origins.
 * Supports production, staging, demo, and local development environments.
 */
export function isOriginAllowed(origin: string | null, request: Request): boolean {
  if (!origin) {
    const sameSite = request.headers.get("sec-fetch-site");
    if (sameSite === "cross-site") return false;

    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        return isOriginAllowed(refOrigin, request);
      } catch {
        return false;
      }
    }
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const originNormalized = originUrl.origin.toLowerCase();

    // 1. Configured APP_ORIGIN
    const configuredOrigin = new URL(env().APP_ORIGIN).origin.toLowerCase();
    if (originNormalized === configuredOrigin) return true;

    // 2. Request's own URL origin (self-origin)
    const requestUrl = new URL(request.url);
    if (originNormalized === requestUrl.origin.toLowerCase()) return true;

    // 3. Host / X-Forwarded-Host matching
    const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (hostHeader) {
      const hostOnly = (hostHeader.split(",")[0] ?? "").trim().toLowerCase();
      if (originUrl.host.toLowerCase() === hostOnly) return true;

      const proto = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
      const hostOrigin = `${proto}://${hostOnly}`.toLowerCase();
      if (originNormalized === hostOrigin) return true;
    }

    // 4. Localhost / Loopback equivalence (for local dev, demo, and test environments)
    const isLoopback = (host: string) => {
      const h = (host.toLowerCase().split(":")[0] ?? "").trim();
      return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
    };

    if (isLoopback(originUrl.hostname)) {
      if (
        isLoopback(requestUrl.hostname) ||
        (hostHeader && isLoopback(hostHeader)) ||
        process.env.NODE_ENV !== "production" ||
        env().APP_ORIGIN.includes("localhost") ||
        env().APP_ORIGIN.includes("127.0.0.1")
      ) {
        return true;
      }
    }

    // 5. Configured ALLOWED_ORIGINS (comma-separated, for demo environments / staging)
    const allowedEnv = env().ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "";
    if (allowedEnv) {
      const extra = allowedEnv.split(",").map((s) => s.trim().toLowerCase());
      for (const allowed of extra) {
        if (!allowed) continue;
        if (originNormalized === allowed || originUrl.host.toLowerCase() === allowed) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }

  return false;
}
