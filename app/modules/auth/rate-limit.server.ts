import { RateLimitedError } from "~/modules/core/errors";
import { redis } from "~/modules/core/redis.server";

/**
 * Fixed-window rate limiter in Redis. Keys must not contain raw personal data: callers pass a
 * hashed identifier (e.g. SHA-256 of the e-mail) or the client IP.
 */
export async function rateLimit(bucket: string, key: string, limit: number, windowSeconds: number): Promise<void> {
  const k = `rl:${bucket}:${key}`;
  const r = redis();
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSeconds);
  if (n > limit) {
    const ttl = await r.ttl(k);
    throw new RateLimitedError(ttl > 0 ? ttl : windowSeconds);
  }
}

/** Client IP as forwarded by Nginx (the application is never exposed directly in production). */
export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
