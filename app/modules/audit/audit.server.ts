import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "~/modules/core/db.server";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Small, non-sensitive context only: ids, statuses, counts. Never answers, tokens or file bytes. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

const FORBIDDEN_KEYS = /pass|token|secret|answers|content|cookie/i;

function sanitize(meta: Record<string, unknown> = {}): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v.slice(0, 500) : (v as Prisma.InputJsonValue | null);
  }
  return out;
}

/** Records an audit event. Pass `tx` to make the event part of the same transaction as the change. */
export async function audit(e: AuditInput, tx: Tx = prisma): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      metadata: sanitize(e.metadata),
      ip: e.ip ?? null,
    },
  });
}
