import type { Prisma, SupportPriority, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hasPermission, isSuperAdmin } from "~/modules/auth/permissions";
import { requirePermission } from "~/modules/auth/policy.server";
import { rateLimit } from "~/modules/auth/rate-limit.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma, type Tx } from "~/modules/core/db.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { redis } from "~/modules/core/redis.server";
import { notify } from "~/modules/notifications/outbox.server";
import { attachmentFiles, storeAttachments, type StoredAttachment } from "./attachments.server";
import { getHelpdeskConfig, isSupportStaff, supportStaff } from "./config.server";
import {
  CANDIDATE_URGENCY,
  CATEGORY_KEYS,
  categoryLabel,
  NEEDS_SUMMARY,
  PRIORITIES,
  PRIORITY_LABEL,
  type Priority,
  REOPEN_DAYS,
  STAFF_STATUS_LABEL,
  STAFF_TRANSITIONS,
  STATUS_LABEL,
  TICKET_CATEGORIES,
  TICKET_LIMITS,
  TICKET_STATUSES,
  STAFF_VIEWS,
  type StaffView,
  type TicketCategory,
  type TicketStatus,
} from "./definitions";
export { STAFF_VIEWS, type StaffView };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 15;

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[]>;

/** Only candidates open tickets; staff use the staff workspace. */
function requireCandidate(user: SessionUser | null): SessionUser {
  if (!user) throw new ForbiddenError();
  if (!user.grants.some((g) => g.role === "CANDIDATE"))
    throw new ForbiddenError("The help desk is for candidates. Staff use the staff help desk.");
  return user;
}

const requireSupport = (user: SessionUser | null) => requirePermission(user, "helpdesk:handle");

/** Next "PSGHD-<year>-<000001>" reference: one atomic upsert per ticket, unique under concurrency. */
async function nextReference(tx: Tx): Promise<string> {
  const year = new Date(Date.now() + 330 * 60_000).getUTCFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO support_counters (year, value) VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET value = support_counters.value + 1
    RETURNING value`;
  return `PSGHD-${year}-${String(rows[0]!.value).padStart(6, "0")}`;
}

const personName = (u: { email: string; profile: { fullName: string } | null } | null) =>
  u ? u.profile?.fullName?.trim() || u.email : null;

async function event(
  tx: Tx,
  ticketId: string,
  actorId: string | null,
  type: string,
  from?: string | null,
  to?: string | null,
  reason?: string | null,
) {
  return tx.supportTicketEvent.create({
    data: { ticketId, actorId, type, fromValue: from ?? null, toValue: to ?? null, reason: reason ?? null },
  });
}

async function saveAttachments(
  tx: Tx,
  ticketId: string,
  messageId: string,
  userId: string,
  files: StoredAttachment[],
) {
  for (const f of files)
    await tx.supportAttachment.create({ data: { ...f, ticketId, messageId, uploadedById: userId } });
}

// ------------------------------------------------------------------------------------------------
// Candidate
// ------------------------------------------------------------------------------------------------

const createSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(
      TICKET_LIMITS.subject.min,
      `Describe the problem in at least ${TICKET_LIMITS.subject.min} characters`,
    )
    .max(TICKET_LIMITS.subject.max),
  category: z.enum(CATEGORY_KEYS as [TicketCategory, ...TicketCategory[]], { message: "Choose a category" }),
  subcategory: z.string().trim().max(80).optional(),
  urgency: z.enum(CANDIDATE_URGENCY).optional(),
  description: z
    .string()
    .trim()
    .min(TICKET_LIMITS.body.min, `Give a few more details (at least ${TICKET_LIMITS.body.min} characters)`)
    .max(TICKET_LIMITS.body.max, `Keep it under ${TICKET_LIMITS.body.max} characters`),
  applicationId: z.string().regex(UUID).optional(),
  articleSlug: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  requestId: z.string().regex(UUID, "Reload the page and try again"),
});

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : undefined);

/** The candidate's own submitted applications, for linking a ticket. */
export function myApplicationsForTickets(user: SessionUser) {
  return prisma.application.findMany({
    where: { candidateId: user.id, status: { not: "DRAFT" }, referenceNo: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 50,
    select: {
      id: true,
      referenceNo: true,
      appliedPosition: true,
      vacancy: {
        select: {
          title: true,
          position: true,
          department: { select: { name: true } },
          researchSpecialisation: { select: { name: true } },
        },
      },
    },
  });
}

export async function createTicket(
  user: SessionUser | null,
  form: FormData,
): Promise<{ id: string; referenceNo: string }> {
  const u = requireCandidate(user);
  const p = createSchema.safeParse({
    subject: form.get("subject") ?? "",
    category: form.get("category") ?? "",
    subcategory: blank(form.get("subcategory")),
    urgency: blank(form.get("urgency")),
    description: form.get("description") ?? "",
    applicationId: blank(form.get("applicationId")),
    articleSlug: blank(form.get("articleSlug")),
    requestId: form.get("requestId") ?? "",
  });
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const d = p.data;
  const subs = TICKET_CATEGORIES[d.category].subs as readonly string[];
  if (d.subcategory && !subs.includes(d.subcategory))
    throw new ValidationError("Please correct the highlighted fields", {
      subcategory: ["Choose from the list"],
    });

  // A double click or network retry with the same form returns the ticket already created.
  const idemKey = `hd:create:${u.id}:${d.requestId}`;
  const existing = await redis().get(idemKey);
  if (existing) {
    const t = await prisma.supportTicket.findFirst({ where: { id: existing, createdById: u.id } });
    if (t) return { id: t.id, referenceNo: t.referenceNo };
  }
  await rateLimit("helpdesk-create", u.id, 10, 3600);

  if (d.applicationId) {
    const own = await prisma.application.count({ where: { id: d.applicationId, candidateId: u.id } });
    if (!own)
      throw new ValidationError("Please correct the highlighted fields", {
        applicationId: ["Choose one of your own applications"],
      });
  }
  const files = await storeAttachments(attachmentFiles(form));
  const cfg = await getHelpdeskConfig();

  const ticket = await prisma.$transaction(async (tx) => {
    const referenceNo = await nextReference(tx);
    const t = await tx.supportTicket.create({
      data: {
        referenceNo,
        createdById: u.id,
        subject: d.subject,
        category: d.category,
        subcategory: d.subcategory ?? null,
        candidateUrgency: d.urgency ?? null,
        applicationId: d.applicationId ?? null,
        articleSlug: d.articleSlug ?? null,
        assigneeId: cfg.defaultAssigneeId,
        lastCandidateReplyAt: new Date(),
      },
    });
    const m = await tx.supportMessage.create({
      data: { ticketId: t.id, authorId: u.id, body: d.description, kind: "PUBLIC", fromStaff: false },
    });
    await saveAttachments(tx, t.id, m.id, u.id, files);
    await event(tx, t.id, u.id, "created", null, "OPEN");
    if (cfg.defaultAssigneeId)
      await event(tx, t.id, null, "assigned", null, cfg.defaultAssigneeId, "Default assignment");
    await audit(
      {
        actorId: u.id,
        action: "helpdesk.ticket_created",
        entityType: "support_ticket",
        entityId: t.id,
        metadata: { referenceNo, category: d.category, attachments: files.length },
      },
      tx,
    );
    await notify(
      tx,
      u.id,
      "helpdesk.created",
      `Support request received — ${referenceNo}`,
      `We have received your support request.\n\nTicket: ${referenceNo}\nSubject: ${d.subject}\nCategory: ${categoryLabel(d.category)}\n\nThe recruitment office will reply on the help desk. Sign in and open “Help desk” to follow the conversation.`,
      { dedupeKey: `ticket:${t.id}:created` },
    );
    for (const s of await supportStaff())
      await notify(
        tx,
        s.id,
        "helpdesk.staff.new",
        `New support ticket ${referenceNo}`,
        `${categoryLabel(d.category)}: ${d.subject}`,
        { dedupeKey: `ticket:${t.id}:new`, email: cfg.emailStaffOnNewTicket },
      );
    return t;
  });
  await redis()
    .set(idemKey, ticket.id, "EX", 3600)
    .catch(() => undefined);
  return { id: ticket.id, referenceNo: ticket.referenceNo };
}

export const ticketListSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(TICKET_STATUSES).optional().catch(undefined),
  category: z
    .enum(CATEGORY_KEYS as [TicketCategory, ...TicketCategory[]])
    .optional()
    .catch(undefined),
  sort: z.enum(["updated", "created", "oldest"]).default("updated").catch("updated"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type TicketListQuery = z.infer<typeof ticketListSchema>;

const orderOf = (sort: string): Prisma.SupportTicketOrderByWithRelationInput =>
  sort === "created"
    ? { createdAt: "desc" }
    : sort === "oldest"
      ? { createdAt: "asc" }
      : { lastActivityAt: "desc" };

/** The candidate's own tickets with real counts per status. */
export async function myTickets(user: SessionUser | null, q: TicketListQuery) {
  const u = requireCandidate(user);
  const base: Prisma.SupportTicketWhereInput = { createdById: u.id };
  const where: Prisma.SupportTicketWhereInput = {
    AND: [
      base,
      q.status ? { status: q.status } : {},
      q.category ? { category: q.category } : {},
      q.q
        ? {
            OR: [
              { referenceNo: { contains: q.q, mode: "insensitive" } },
              { subject: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [total, rows, groups] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: orderOf(q.sort),
      skip: (q.page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        referenceNo: true,
        subject: true,
        category: true,
        status: true,
        createdAt: true,
        lastActivityAt: true,
        lastStaffReplyAt: true,
        lastCandidateReplyAt: true,
        application: { select: { referenceNo: true } },
      },
    }),
    prisma.supportTicket.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const g of groups) counts[g.status as TicketStatus] = g._count._all;
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    counts,
    rows: rows.map((r) => ({
      ...r,
      // The team replied after the candidate's latest message.
      teamReplied:
        !!r.lastStaffReplyAt && (!r.lastCandidateReplyAt || r.lastStaffReplyAt > r.lastCandidateReplyAt),
    })),
  };
}

const candidateTicketSelect = {
  id: true,
  referenceNo: true,
  subject: true,
  category: true,
  subcategory: true,
  candidateUrgency: true,
  status: true,
  createdAt: true,
  lastActivityAt: true,
  resolvedAt: true,
  closedAt: true,
  resolutionSummary: true,
  application: { select: { referenceNo: true, vacancy: { select: { title: true } } } },
} satisfies Prisma.SupportTicketSelect;

/** One of the candidate's own tickets: public messages and their attachments only. */
export async function myTicket(user: SessionUser | null, id: string) {
  const u = requireCandidate(user);
  if (!UUID.test(id)) throw new NotFoundError("Ticket");
  const t = await prisma.supportTicket.findFirst({
    where: { id, createdById: u.id },
    select: candidateTicketSelect,
  });
  if (!t) throw new NotFoundError("Ticket");
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: id, kind: "PUBLIC" },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      body: true,
      fromStaff: true,
      createdAt: true,
      author: { select: { email: true, profile: { select: { fullName: true } } } },
      attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  });
  return {
    ticket: t,
    // Staff are shown as "Recruitment office" to candidates; individual names stay internal.
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      fromStaff: m.fromStaff,
      author: m.fromStaff ? "Recruitment office" : (personName(m.author) ?? "You"),
      attachments: m.attachments,
    })),
    canReply:
      t.status !== "CLOSED" &&
      (t.status !== "RESOLVED" ||
        (t.resolvedAt && Date.now() - t.resolvedAt.getTime() < REOPEN_DAYS * 86_400_000)),
  };
}

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(TICKET_LIMITS.reply.min, "Write a message")
    .max(TICKET_LIMITS.reply.max, `Keep it under ${TICKET_LIMITS.reply.max} characters`),
});

/** Candidate reply. Returns the ticket to the team; a resolved ticket is reopened. */
export async function candidateReply(user: SessionUser | null, id: string, form: FormData) {
  const u = requireCandidate(user);
  const p = replySchema.safeParse({ body: form.get("body") ?? "" });
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const t = await prisma.supportTicket.findFirst({ where: { id, createdById: u.id } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.status === "CLOSED") throw new ConflictError("This ticket is closed. Please open a new ticket.");
  if (
    t.status === "RESOLVED" &&
    (!t.resolvedAt || Date.now() - t.resolvedAt.getTime() >= REOPEN_DAYS * 86_400_000)
  )
    throw new ConflictError(
      `Resolved tickets can be reopened for ${REOPEN_DAYS} days. Please open a new ticket.`,
    );
  await rateLimit("helpdesk-reply", u.id, 30, 3600);
  const files = await storeAttachments(attachmentFiles(form));
  const next: SupportTicketStatus =
    t.status === "AWAITING_CANDIDATE" || t.status === "RESOLVED"
      ? t.assigneeId
        ? "IN_PROGRESS"
        : "OPEN"
      : t.status;
  await prisma.$transaction(async (tx) => {
    const res = await tx.supportTicket.updateMany({
      where: { id, status: t.status },
      data: {
        status: next,
        lastActivityAt: new Date(),
        lastCandidateReplyAt: new Date(),
        ...(t.status === "RESOLVED" ? { resolvedAt: null } : {}),
      },
    });
    if (res.count !== 1) throw new ConflictError("The ticket changed meanwhile. Reload and try again.");
    const m = await tx.supportMessage.create({
      data: { ticketId: id, authorId: u.id, body: p.data.body, kind: "PUBLIC", fromStaff: false },
    });
    await saveAttachments(tx, id, m.id, u.id, files);
    if (next !== t.status)
      await event(tx, id, u.id, t.status === "RESOLVED" ? "reopened" : "status", t.status, next);
    await audit(
      {
        actorId: u.id,
        action: t.status === "RESOLVED" ? "helpdesk.ticket_reopened" : "helpdesk.candidate_replied",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo, attachments: files.length },
      },
      tx,
    );
    if (t.assigneeId)
      await notify(
        tx,
        t.assigneeId,
        "helpdesk.staff.reply",
        `Candidate replied — ${t.referenceNo}`,
        t.subject,
        { dedupeKey: `ticket:${id}:msg:${m.id}`, email: false },
      );
  });
}

// ------------------------------------------------------------------------------------------------
// Attachments (both sides)
// ------------------------------------------------------------------------------------------------

/** Authorises a download: the ticket's candidate (public messages only) or support staff. */
export async function authorizeAttachment(user: SessionUser, id: string) {
  if (!UUID.test(id)) throw new NotFoundError("File");
  const a = await prisma.supportAttachment.findUnique({
    where: { id },
    include: {
      ticket: { select: { createdById: true, referenceNo: true } },
      message: { select: { kind: true } },
    },
  });
  if (!a) throw new NotFoundError("File");
  if (hasPermission(user.grants, "helpdesk:handle")) return a;
  if (a.ticket.createdById === user.id && a.message?.kind !== "INTERNAL") return a;
  throw new NotFoundError("File");
}

// ------------------------------------------------------------------------------------------------
// Staff
// ------------------------------------------------------------------------------------------------

export const staffListSchema = ticketListSchema.extend({
  view: z
    .enum(Object.keys(STAFF_VIEWS) as [StaffView, ...StaffView[]])
    .default("open")
    .catch("open"),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  assignee: z.string().regex(UUID).optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  sort: z.enum(["updated", "created", "oldest", "priority"]).default("updated").catch("updated"),
});
export type StaffListQuery = z.infer<typeof staffListSchema>;

const ACTIVE: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "AWAITING_CANDIDATE"];

function viewWhere(view: StaffView, userId: string): Prisma.SupportTicketWhereInput {
  switch (view) {
    case "open":
      return { status: { in: ["OPEN", "IN_PROGRESS"] } };
    case "unassigned":
      return { assigneeId: null, status: { in: ACTIVE } };
    case "mine":
      return { assigneeId: userId, status: { in: ACTIVE } };
    case "awaiting":
      return { status: "AWAITING_CANDIDATE" };
    case "escalated":
      return { escalated: true, status: { in: ACTIVE } };
    case "resolved":
      return { status: "RESOLVED" };
    case "closed":
      return { status: "CLOSED" };
    default:
      return {};
  }
}

export async function staffTickets(user: SessionUser | null, q: StaffListQuery) {
  const u = requireSupport(user);
  const ist = (d: string, end: boolean) => new Date(`${d}T${end ? "23:59:59.999" : "00:00:00"}+05:30`);
  const where: Prisma.SupportTicketWhereInput = {
    AND: [
      viewWhere(q.view, u.id),
      q.status ? { status: q.status } : {},
      q.priority ? { priority: q.priority } : {},
      q.category ? { category: q.category } : {},
      q.assignee ? { assigneeId: q.assignee } : {},
      q.from ? { createdAt: { gte: ist(q.from, false) } } : {},
      q.to ? { createdAt: { lte: ist(q.to, true) } } : {},
      q.q
        ? {
            OR: [
              { referenceNo: { contains: q.q, mode: "insensitive" } },
              { subject: { contains: q.q, mode: "insensitive" } },
              { application: { referenceNo: { contains: q.q, mode: "insensitive" } } },
              { createdBy: { email: { contains: q.q.toLowerCase() } } },
              { createdBy: { profile: { fullName: { contains: q.q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };
  const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] =
    q.sort === "priority" ? [{ priority: "desc" }, { lastActivityAt: "desc" }] : [orderOf(q.sort)];
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        referenceNo: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        escalated: true,
        createdAt: true,
        lastActivityAt: true,
        lastStaffReplyAt: true,
        lastCandidateReplyAt: true,
        createdBy: { select: { email: true, profile: { select: { fullName: true } } } },
        assignee: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        application: { select: { referenceNo: true } },
      },
    }),
  ]);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    rows: rows.map((r) => ({
      ...r,
      candidate: personName(r.createdBy),
      assigneeName: personName(r.assignee),
      waitingOnTeam:
        r.status !== "RESOLVED" &&
        r.status !== "CLOSED" &&
        !!r.lastCandidateReplyAt &&
        (!r.lastStaffReplyAt || r.lastCandidateReplyAt > r.lastStaffReplyAt),
    })),
  };
}

/** Real counts for the staff overview (database, not the current page). */
export async function staffCounts(user: SessionUser | null) {
  const u = requireSupport(user);
  const [byStatus, unassigned, mine, high, escalated] = await Promise.all([
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supportTicket.count({ where: { assigneeId: null, status: { in: ACTIVE } } }),
    prisma.supportTicket.count({ where: { assigneeId: u.id, status: { in: ACTIVE } } }),
    prisma.supportTicket.count({ where: { priority: { in: ["HIGH", "URGENT"] }, status: { in: ACTIVE } } }),
    prisma.supportTicket.count({ where: { escalated: true, status: { in: ACTIVE } } }),
  ]);
  const status = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const g of byStatus) status[g.status as TicketStatus] = g._count._all;
  return { status, unassigned, mine, high, escalated };
}

export async function staffTicket(user: SessionUser | null, id: string) {
  requireSupport(user);
  if (!UUID.test(id)) throw new NotFoundError("Ticket");
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, email: true, profile: { select: { fullName: true, phone: true } } } },
      assignee: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      application: {
        select: {
          id: true,
          referenceNo: true,
          status: true,
          vacancy: { select: { title: true, department: { select: { name: true } } } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 500,
        include: {
          author: { select: { email: true, profile: { select: { fullName: true } } } },
          attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        take: 300,
        include: { actor: { select: { email: true, profile: { select: { fullName: true } } } } },
      },
    },
  });
  if (!t) throw new NotFoundError("Ticket");
  const staff = await supportStaff();
  const nameOf = (id: string | null) => {
    const s = staff.find((x) => x.id === id);
    return s ? personName(s) : id ? "Former staff member" : "Unassigned";
  };
  return {
    ticket: t,
    candidate: { ...t.createdBy, name: personName(t.createdBy) },
    staff: staff.map((s) => ({ id: s.id, name: personName(s)! })),
    events: t.events.map((e) => ({
      ...e,
      actorName: personName(e.actor) ?? "System",
      fromLabel: e.type === "assigned" ? nameOf(e.fromValue) : labelOf(e.fromValue),
      toLabel: e.type === "assigned" ? nameOf(e.toValue) : labelOf(e.toValue),
    })),
  };
}

function labelOf(v: string | null): string | null {
  if (!v) return null;
  if (v in STAFF_STATUS_LABEL) return STAFF_STATUS_LABEL[v as TicketStatus];
  if (v in PRIORITY_LABEL) return PRIORITY_LABEL[v as Priority];
  if (v === "SUPER_ADMIN") return "Super Admin";
  return v;
}

const staffReplySchema = replySchema.extend({
  kind: z.enum(["PUBLIC", "INTERNAL", "REQUEST_INFO"]),
});

/** Staff reply: public answer, request for information (→ awaiting candidate) or internal note. */
export async function staffReply(user: SessionUser | null, id: string, form: FormData) {
  const u = requireSupport(user);
  const p = staffReplySchema.safeParse({ body: form.get("body") ?? "", kind: form.get("kind") ?? "PUBLIC" });
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.status === "CLOSED" && p.data.kind !== "INTERNAL")
    throw new ConflictError("Reopen the ticket (set it to In progress) before replying to the candidate.");
  await rateLimit("helpdesk-staff-reply", u.id, 300, 3600);
  const files = await storeAttachments(attachmentFiles(form));
  const internal = p.data.kind === "INTERNAL";
  const next: SupportTicketStatus = internal
    ? t.status
    : p.data.kind === "REQUEST_INFO"
      ? "AWAITING_CANDIDATE"
      : t.status === "OPEN" || t.status === "AWAITING_CANDIDATE"
        ? "IN_PROGRESS"
        : t.status === "RESOLVED"
          ? "RESOLVED"
          : t.status;
  await prisma.$transaction(async (tx) => {
    const res = await tx.supportTicket.updateMany({
      where: { id, status: t.status },
      data: {
        status: next,
        lastActivityAt: new Date(),
        ...(internal ? {} : { lastStaffReplyAt: new Date() }),
        // Whoever answers an unassigned ticket takes it.
        ...(!t.assigneeId && !internal ? { assigneeId: u.id } : {}),
      },
    });
    if (res.count !== 1) throw new ConflictError("The ticket changed meanwhile. Reload and try again.");
    const m = await tx.supportMessage.create({
      data: {
        ticketId: id,
        authorId: u.id,
        body: p.data.body,
        kind: internal ? "INTERNAL" : "PUBLIC",
        fromStaff: true,
      },
    });
    await saveAttachments(tx, id, m.id, u.id, files);
    if (next !== t.status) await event(tx, id, u.id, "status", t.status, next);
    if (!t.assigneeId && !internal)
      await event(tx, id, u.id, "assigned", null, u.id, "Took the ticket by replying");
    await audit(
      {
        actorId: u.id,
        action: internal
          ? "helpdesk.internal_note"
          : p.data.kind === "REQUEST_INFO"
            ? "helpdesk.info_requested"
            : "helpdesk.staff_replied",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo, attachments: files.length },
      },
      tx,
    );
    // Internal notes never reach the candidate, in the app or by e-mail.
    if (!internal)
      await notify(
        tx,
        t.createdById,
        p.data.kind === "REQUEST_INFO" ? "helpdesk.info_requested" : "helpdesk.reply",
        p.data.kind === "REQUEST_INFO"
          ? `More information needed — ${t.referenceNo}`
          : `Reply to your support request — ${t.referenceNo}`,
        `The recruitment office has ${p.data.kind === "REQUEST_INFO" ? "asked for more information on" : "replied to"} your support request ${t.referenceNo} (“${t.subject}”).\n\nSign in and open “Help desk” to read it and reply.`,
        { dedupeKey: `ticket:${id}:msg:${m.id}` },
      );
  });
}

const statusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  summary: z.string().trim().max(2000).optional(),
});

/** Status change with the allowed-transition table; resolving or closing needs a summary. */
export async function setTicketStatus(user: SessionUser | null, id: string, input: unknown) {
  const u = requireSupport(user);
  const p = statusSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Choose a status");
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Ticket");
  const to = p.data.status;
  if (!STAFF_TRANSITIONS[t.status as TicketStatus].includes(to))
    throw new ConflictError(
      `A ${STAFF_STATUS_LABEL[t.status as TicketStatus]} ticket cannot be set to ${STAFF_STATUS_LABEL[to]}.`,
    );
  if (t.status === "CLOSED" && !isSuperAdmin(u.grants))
    throw new ForbiddenError("Only the Super Admin can reopen a closed ticket.");
  const summary = p.data.summary?.trim();
  if (NEEDS_SUMMARY.includes(to) && (!summary || summary.length < 10))
    throw new ValidationError("Please correct the highlighted fields", {
      summary: ["Write a short resolution summary (at least 10 characters)"],
    });
  await prisma.$transaction(async (tx) => {
    const res = await tx.supportTicket.updateMany({
      where: { id, status: t.status },
      data: {
        status: to,
        lastActivityAt: new Date(),
        ...(NEEDS_SUMMARY.includes(to) ? { resolutionSummary: summary } : {}),
        ...(to === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        ...(to === "CLOSED" ? { closedAt: new Date() } : {}),
        ...(to === "IN_PROGRESS" ? { resolvedAt: null, closedAt: null } : {}),
      },
    });
    if (res.count !== 1) throw new ConflictError("The ticket changed meanwhile. Reload and try again.");
    const e = await event(tx, id, u.id, "status", t.status, to, summary);
    await audit(
      {
        actorId: u.id,
        action:
          to === "RESOLVED"
            ? "helpdesk.resolved"
            : to === "CLOSED"
              ? "helpdesk.closed"
              : "helpdesk.status_changed",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo, from: t.status, to },
      },
      tx,
    );
    if (to === "RESOLVED" || to === "CLOSED")
      await notify(
        tx,
        t.createdById,
        to === "RESOLVED" ? "helpdesk.resolved" : "helpdesk.closed",
        `Support request ${to === "RESOLVED" ? "resolved" : "closed"} — ${t.referenceNo}`,
        `${summary}\n\n${to === "RESOLVED" ? `If the problem is not solved, reply on the ticket within ${REOPEN_DAYS} days to reopen it.` : "If you need more help, open a new ticket on the help desk."}`,
        // Resolution is e-mailed; closing is shown in the app only.
        { dedupeKey: `ticket:${id}:status:${e.id}`, email: to === "RESOLVED" },
      );
  });
}

/** Assign or unassign; only to active support staff. */
export async function assignTicket(
  user: SessionUser | null,
  id: string,
  assigneeId: string | null,
  reason?: string,
) {
  const u = requireSupport(user);
  if (assigneeId !== null && (!UUID.test(assigneeId) || !(await isSupportStaff(assigneeId))))
    throw new ValidationError("Choose an active HR – N4 Section or Super Admin account");
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.assigneeId === assigneeId) return;
  await prisma.$transaction(async (tx) => {
    const res = await tx.supportTicket.updateMany({
      where: { id, assigneeId: t.assigneeId },
      data: { assigneeId, lastActivityAt: new Date() },
    });
    if (res.count !== 1)
      throw new ConflictError("The ticket was reassigned meanwhile. Reload and try again.");
    const e = await event(
      tx,
      id,
      u.id,
      "assigned",
      t.assigneeId,
      assigneeId,
      reason?.trim().slice(0, 500) || null,
    );
    await audit(
      {
        actorId: u.id,
        action: "helpdesk.assigned",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo, from: t.assigneeId, to: assigneeId },
      },
      tx,
    );
    if (assigneeId && assigneeId !== u.id)
      await notify(
        tx,
        assigneeId,
        "helpdesk.staff.assigned",
        `Support ticket assigned to you — ${t.referenceNo}`,
        `${categoryLabel(t.category)}: ${t.subject}`,
        { dedupeKey: `ticket:${id}:assigned:${e.id}` },
      );
  });
}

export async function setTicketPriority(user: SessionUser | null, id: string, priority: unknown) {
  const u = requireSupport(user);
  const p = z.enum(PRIORITIES).safeParse(priority);
  if (!p.success) throw new ValidationError("Choose a priority");
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.priority === p.data) return;
  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id }, data: { priority: p.data as SupportPriority } });
    await event(tx, id, u.id, "priority", t.priority, p.data);
    await audit(
      {
        actorId: u.id,
        action: "helpdesk.priority_changed",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo, from: t.priority, to: p.data },
      },
      tx,
    );
  });
}

/** Escalation to the Super Admin, with a reason. Keeps the ticket's history and creator. */
export async function escalateTicket(user: SessionUser | null, id: string, reason: string) {
  const u = requireSupport(user);
  const r = reason.trim();
  if (r.length < 10)
    throw new ValidationError("Please correct the highlighted fields", {
      reason: ["Explain why (at least 10 characters)"],
    });
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.escalated) throw new ConflictError("This ticket is already escalated.");
  if (t.status === "RESOLVED" || t.status === "CLOSED")
    throw new ConflictError("Reopen the ticket before escalating it.");
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id },
      data: {
        escalated: true,
        escalatedAt: new Date(),
        lastActivityAt: new Date(),
        priority: t.priority === "LOW" || t.priority === "NORMAL" ? "HIGH" : t.priority,
      },
    });
    const e = await event(tx, id, u.id, "escalated", null, "SUPER_ADMIN", r.slice(0, 2000));
    await audit(
      {
        actorId: u.id,
        action: "helpdesk.escalated",
        entityType: "support_ticket",
        entityId: id,
        metadata: { referenceNo: t.referenceNo },
      },
      tx,
    );
    for (const a of admins)
      if (a.id !== u.id)
        await notify(
          tx,
          a.id,
          "helpdesk.staff.escalated",
          `Ticket escalated to you — ${t.referenceNo}`,
          `${t.subject}\n\nReason: ${r.slice(0, 500)}`,
          {
            dedupeKey: `ticket:${id}:escalated:${e.id}`,
          },
        );
  });
}

/** Bulk assign / status for selected tickets. Each ticket is checked on its own; the result lists failures. */
export async function bulkUpdate(user: SessionUser | null, form: FormData) {
  const u = requireSupport(user);
  const ids = form
    .getAll("ticketId")
    .map(String)
    .filter((x) => UUID.test(x))
    .slice(0, 200);
  if (!ids.length) throw new ValidationError("Select at least one ticket");
  const action = String(form.get("bulk") ?? "");
  const done: string[] = [];
  const failed: { ref: string; reason: string }[] = [];
  const refs = new Map(
    (
      await prisma.supportTicket.findMany({
        where: { id: { in: ids } },
        select: { id: true, referenceNo: true },
      })
    ).map((t) => [t.id, t.referenceNo]),
  );
  for (const id of ids) {
    try {
      if (action === "assign") {
        const to = String(form.get("assigneeId") ?? "");
        await assignTicket(u, id, to === "none" ? null : to, "Bulk assignment");
      } else if (action === "status") {
        await setTicketStatus(u, id, {
          status: form.get("status"),
          summary: form.get("summary") ?? undefined,
        });
      } else throw new ValidationError("Choose an action");
      done.push(id);
    } catch (e) {
      failed.push({ ref: refs.get(id) ?? id.slice(0, 8), reason: (e as Error).message });
    }
  }
  return { updated: done.length, failed };
}

export { STATUS_LABEL };
