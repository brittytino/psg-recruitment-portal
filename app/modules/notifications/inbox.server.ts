import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";

/**
 * In-app notifications (bell icon). Every notification is listed here, whether or not it was also
 * e-mailed, so routine updates stay visible when e-mail is skipped to save the daily quota.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Where a notification leads, from its type (no link column is needed). */
function linkFor(type: string, dedupeKey: string | null, staff: boolean): string | null {
  const ticket = dedupeKey?.startsWith("ticket:") ? UUID.exec(dedupeKey)?.[0] : undefined;
  if (type.startsWith("helpdesk.") && ticket)
    return type.startsWith("helpdesk.staff.") ? `/staff/help-desk/${ticket}` : `/help-desk/tickets/${ticket}`;
  if (type.startsWith("application.")) return staff ? "/staff" : "/account";
  if (type === "review.assigned") return "/staff/review";
  if (type === "summary.approved") return "/staff/summary";
  return null;
}

export async function unreadCount(user: SessionUser): Promise<number> {
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

export async function inbox(user: SessionUser, staff: boolean) {
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      subject: true,
      body: true,
      createdAt: true,
      readAt: true,
      dedupeKey: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    // A short preview only; never the full e-mail body.
    preview:
      r.body
        .split("\n")
        .find((l) => l.trim())
        ?.slice(0, 160) ?? "",
    createdAt: r.createdAt.toISOString(),
    unread: !r.readAt,
    href: linkFor(r.type, r.dedupeKey, staff),
  }));
}

export async function markRead(user: SessionUser, id: string | null) {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}
