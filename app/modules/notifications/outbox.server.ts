import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
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

/**
 * E-mails that matter for the recruitment itself; everything else is "routine" and is the first to
 * be shown in the app only when the daily e-mail budget runs low (see budget.server.ts).
 */
const CRITICAL_TYPES = new Set([
  "application.submitted",
  "application.interview_call",
  "account.verify",
  "account.reset",
  "account.staff_invite",
  "account.hod_invite",
]);

export interface NotifyOptions {
  /**
   * One notification per event: a second call with the same user, type and key (a retried request,
   * a double click) creates nothing and sends nothing.
   */
  dedupeKey?: string;
  /** false: in-app only (bell icon), never e-mailed. */
  email?: boolean;
}

/** Creates a notification (and, unless in-app only, its delivery event) in the caller's transaction. */
export async function notify(
  tx: Tx,
  userId: string,
  type: string,
  subject: string,
  body: string,
  opts: NotifyOptions = {},
): Promise<void> {
  const email = opts.email !== false;
  const priority = CRITICAL_TYPES.has(type) ? "critical" : "routine";
  const id = randomUUID();
  // ON CONFLICT DO NOTHING keeps the surrounding transaction valid when the event already exists.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO notifications (id, "userId", type, subject, body, status, priority, "dedupeKey")
    VALUES (${id}::uuid, ${userId}::uuid, ${type}, ${subject}, ${body},
            ${email ? "PENDING" : "IN_APP"}::"NotificationStatus", ${priority}, ${opts.dedupeKey ?? null})
    ON CONFLICT ("userId", type, "dedupeKey") DO NOTHING
    RETURNING id`;
  if (!rows.length || !email) return;
  await enqueueOutbox(tx, { type: "email.send", payload: { notificationId: rows[0]!.id } });
}
