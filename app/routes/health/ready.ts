import { prisma } from "~/modules/core/db.server";
import { redis } from "~/modules/core/redis.server";
import { storageWritable } from "~/modules/documents/storage.server";

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Readiness: the instance can serve traffic (database, Redis and storage reachable). Used by Docker
 * health checks and the blue-green switch. Returns only pass/fail per dependency and the build
 * version — never connection strings, hosts or error details.
 */
export async function loader() {
  const checks = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`, 3000),
    withTimeout(redis().ping(), 3000),
    withTimeout(
      storageWritable().then((ok) => (ok ? ok : Promise.reject(new Error("storage")))),
      3000,
    ),
  ]);
  const [db, cache, storage] = checks.map((c) => c.status === "fulfilled");
  const ok = db && cache && storage;
  return Response.json(
    {
      status: ok ? "ready" : "unavailable",
      version: process.env.GIT_SHA ?? "dev",
      checks: { database: db, redis: cache, storage },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
