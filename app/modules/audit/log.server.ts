import type { Prisma } from "@prisma/client";
import { ROLE_LABELS, type RoleName } from "~/modules/auth/permissions";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { SETTINGS } from "~/modules/settings/definitions";
import { actionLabel, CATEGORY_PREFIXES, metaKeyLabel, type AuditCategory } from "./describe";

export interface AuditQuery {
  category?: AuditCategory;
  person?: string;
  action?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

/** IST day boundaries for the date filter (inputs are YYYY-MM-DD). */
const istDay = (d: string, end: boolean) => new Date(`${d}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);

function whereOf(q: AuditQuery): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [];
  if (q.category) and.push({ OR: CATEGORY_PREFIXES[q.category].map((p) => ({ action: { startsWith: p } })) });
  if (q.action) and.push({ action: { contains: q.action.toLowerCase() } });
  if (q.entityId) and.push({ entityId: q.entityId });
  if (q.person) {
    const t = q.person.trim();
    and.push({
      actor: {
        OR: [
          { email: { contains: t, mode: "insensitive" } },
          { profile: { fullName: { contains: t, mode: "insensitive" } } },
        ],
      },
    });
  }
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) and.push({ createdAt: { gte: istDay(q.from, false) } });
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) and.push({ createdAt: { lte: istDay(q.to, true) } });
  return and.length ? { AND: and } : {};
}

const personName = (u: { email: string; profile: { fullName: string } | null }) =>
  u.profile?.fullName?.trim() || u.email;

/**
 * Audit events with everything a reviewer needs to read them: who (name, e-mail, roles), what
 * (plain-English action), on what (application reference and candidate, person, job profile,
 * department …), details with ids replaced by names, IP address and time.
 */
export async function auditLogDetailed(user: SessionUser | null, q: AuditQuery) {
  requirePermission(user, "audit:read");
  const where = whereOf(q);
  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
            roles: { select: { role: true, department: { select: { code: true } } } },
          },
        },
      },
    }),
  ]);

  // Collect ids to resolve in one query per kind.
  const ids = (type: string) => [
    ...new Set(
      events
        .filter((e) => e.entityType === type && e.entityId && UUID.test(e.entityId))
        .map((e) => e.entityId!),
    ),
  ];
  const metaUserIds = new Set<string>();
  for (const e of events) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(m))
      if (typeof v === "string" && UUID.test(v) && /(hod|user|reviewer|actor|candidate)Id$/i.test(k))
        metaUserIds.add(v);
  }
  const tickets = await prisma.supportTicket.findMany({
    where: { id: { in: ids("support_ticket") } },
    select: { id: true, referenceNo: true, subject: true },
  });
  const [apps, users, vacancies, departments, sheets, notices, specs] = await Promise.all([
    prisma.application.findMany({
      where: { id: { in: ids("application") } },
      select: {
        id: true,
        referenceNo: true,
        candidate: { select: { email: true, profile: { select: { fullName: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: [...new Set([...ids("user"), ...metaUserIds])] } },
      select: { id: true, email: true, profile: { select: { fullName: true } } },
    }),
    prisma.vacancy.findMany({
      where: { id: { in: ids("vacancy") } },
      select: { id: true, code: true, title: true },
    }),
    prisma.department.findMany({
      where: { id: { in: ids("department") } },
      select: { id: true, name: true },
    }),
    prisma.summarySheet.findMany({
      where: { id: { in: ids("summary_sheet") } },
      select: { id: true, department: { select: { name: true } } },
    }),
    prisma.publicNotice.findMany({ where: { id: { in: ids("notice") } }, select: { id: true, title: true } }),
    prisma.researchSpecialisation.findMany({
      where: { id: { in: ids("research_specialisation") } },
      select: { id: true, name: true },
    }),
  ]);
  const userName = new Map(users.map((u) => [u.id, personName(u)]));

  const gone = (id: string) => `Removed record (${id.slice(0, 8)})`;
  const entity = (type: string, id: string | null): { kind: string; label: string; href?: string } => {
    if (!id) return { kind: type, label: "—" };
    switch (type) {
      case "application": {
        const a = apps.find((x) => x.id === id);
        return {
          kind: "Application",
          label: a ? `${a.referenceNo ?? "Draft"} · ${personName(a.candidate)}` : gone(id),
          href: a ? `/staff/applications/${id}` : undefined,
        };
      }
      case "user":
        return { kind: "Person", label: userName.get(id) ?? gone(id) };
      case "vacancy": {
        const v = vacancies.find((x) => x.id === id);
        return { kind: "Job profile", label: v ? `${v.code} · ${v.title}` : id.slice(0, 8) };
      }
      case "department":
        return { kind: "Department", label: departments.find((x) => x.id === id)?.name ?? gone(id) };
      case "summary_sheet":
        return {
          kind: "Summary sheet",
          label: sheets.find((x) => x.id === id)?.department.name ?? gone(id),
        };
      case "notice":
        return {
          kind: "Open-positions PDF",
          label: notices.find((x) => x.id === id)?.title ?? gone(id),
        };
      case "research_specialisation":
        return {
          kind: "Research specialisation",
          label: specs.find((x) => x.id === id)?.name ?? gone(id),
        };
      case "support_ticket": {
        const t = tickets.find((x) => x.id === id);
        return {
          kind: "Support ticket",
          label: t ? `${t.referenceNo} · ${t.subject}` : gone(id),
          href: t ? `/staff/help-desk/${id}` : undefined,
        };
      }
      case "setting":
        return { kind: "Setting", label: SETTINGS[id as keyof typeof SETTINGS]?.label ?? id };
      default:
        return { kind: type.replace(/_/g, " "), label: UUID.test(id) ? id.slice(0, 8) : id };
    }
  };

  const details = (meta: unknown): { label: string; value: string }[] => {
    if (!meta || typeof meta !== "object") return [];
    return Object.entries(meta as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .slice(0, 12)
      .map(([k, v]) => {
        let value: string;
        if (typeof v === "string" && UUID.test(v)) value = userName.get(v) ?? gone(v);
        else if (typeof v === "boolean") value = v ? "Yes" : "No";
        else if (typeof v === "number" && /size/i.test(k))
          value = v > 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(v / 1024)} KB`;
        else if (Array.isArray(v)) value = v.length > 5 ? `${v.length} items` : v.map(String).join(", ");
        else if (typeof v === "object") value = JSON.stringify(v).slice(0, 200);
        else value = String(v).replace(/_/g, " ");
        return { label: metaKeyLabel(k), value: value.slice(0, 300) };
      });
  };

  const rows = events.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    action: e.action,
    actionLabel: actionLabel(e.action),
    actor: e.actor
      ? {
          id: e.actor.id,
          name: personName(e.actor),
          email: e.actor.email,
          roles: e.actor.roles.map(
            (r) =>
              `${ROLE_LABELS[r.role as RoleName] ?? r.role}${r.department ? ` (${r.department.code})` : ""}`,
          ),
        }
      : null,
    entity: entity(e.entityType, e.entityId),
    entityId: e.entityId,
    details: details(e.metadata),
    ip: e.ip,
  }));
  return { total, rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE };
}
