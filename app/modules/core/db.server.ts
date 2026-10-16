import { PrismaClient } from "@prisma/client";

declare global {
  var __srpPrisma: PrismaClient | undefined;
}

/** Single Prisma client per process (re-used across dev HMR reloads). */
export const prisma: PrismaClient = globalThis.__srpPrisma ?? new PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production") globalThis.__srpPrisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
