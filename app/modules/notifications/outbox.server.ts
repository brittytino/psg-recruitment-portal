import type { Prisma } from "@prisma/client";
import type { Tx } from "~/modules/core/db.server";

/**
 * Outbox event types. Events are written inside the business transaction and relayed to BullMQ
 * by the worker after commit, so a rolled-back change never sends an e-mail or starts a job, and a
 * committed change never loses one (ADR 0005).
 */
export type OutboxEventInput =
  | { type: "email.send"; payload: { notificationId: string } }
  | { type: "documents.generate"; payload: { generatedDocumentId: string } }
  | { type: "documents.scan"; payload: { documentId: string } };

export async function enqueueOutbox(tx: Tx, event: OutboxEventInput): Promise<void> {
  await tx.outboxEvent.create({
    data: { type: event.type, payload: event.payload as Prisma.InputJsonObject },
  });
}

/** Creates a notification and its delivery event in the caller's transaction. */
export async function notify(
  tx: Tx,
  userId: string,
  type: string,
  subject: string,
  body: string,
): Promise<void> {
  const n = await tx.notification.create({ data: { userId, type, subject, body } });
  await enqueueOutbox(tx, { type: "email.send", payload: { notificationId: n.id } });
}
