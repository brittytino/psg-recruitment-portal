import { Redis } from "ioredis";

declare global {
  var __srpRedis: Redis | undefined;
}

export function redis(): Redis {
  if (!globalThis.__srpRedis) {
    globalThis.__srpRedis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return globalThis.__srpRedis;
}

/** Separate connections for BullMQ (it requires its own blocking connections). */
export function newRedisConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
}
