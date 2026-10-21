import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePermission, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ForbiddenError } from "~/modules/core/errors";
import { APPLICATION_STATUSES } from "~/modules/applications/workflow";

import { PAGE_SIZES } from "./constants";
export { PAGE_SIZES };
const SORTS = [
  "submittedAt",
  "-submittedAt",
  "referenceNo",
  "-referenceNo",
  "candidate",
  "-candidate",
  "status",
  "-status",
] as const;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  cycleId: z.string().uuid().optional().catch(undefined),
  departmentId: z.string().uuid().optional().catch(undefined),
  disciplineId: z.string().uuid().optional().catch(undefined),
  vacancyId: z.string().uuid().optional().catch(undefined),
  position: z.enum(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"]).optional().catch(undefined),
  status: z.enum(APPLICATION_STATUSES).optional().catch(undefined),
  processing: z.enum(["NOT_STARTED", "QUEUED", "PROCESSING", "READY", "FAILED"]).optional().catch(undefined),
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
  sort: z.enum(SORTS).default("-submittedAt").catch("-submittedAt"),
  page: z.coerce.number().int().min(1).max(100000).default(1).catch(1),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(25)
    .catch(25),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(url: URL): ListQuery {
  return listQuerySchema.parse(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== "")));
}

function filterWhere(q: ListQuery): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  if (q.cycleId) and.push({ vacancy: { cycleId: q.cycleId } });
  if (q.departmentId) and.push({ vacancy: { departmentId: q.departmentId } });
  if (q.disciplineId) and.push({ vacancy: { disciplineId: q.disciplineId } });
  if (q.vacancyId) and.push({ vacancyId: q.vacancyId });
  if (q.position) and.push({ vacancy: { position: q.position } });
  if (q.status) and.push({ status: q.status });
  if (q.processing) and.push({ processingStatus: q.processing });
  if (q.from) and.push({ submittedAt: { gte: new Date(`${q.from}T00:00:00Z`) } });
  if (q.to) and.push({ submittedAt: { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400_000) } });
  if (q.q) {
    const term = q.q;
    and.push({
      OR: [
        { referenceNo: { contains: term, mode: "insensitive" } },
        { currentRevision: { candidateName: { contains: term.toUpperCase() } } },
        { candidate: { email: { contains: term.toLowerCase() } } },
      ],
    });
  }
  return { AND: and };
}

function orderBy(sort: ListQuery["sort"]): Prisma.ApplicationOrderByWithRelationInput[] {
  const dir = sort.startsWith("-") ? "desc" : "asc";
  const key = sort.replace(/^-/, "");
  const primary: Prisma.ApplicationOrderByWithRelationInput =
    key === "candidate"
      ? { currentRevision: { candidateName: dir } }
      : key === "referenceNo"
        ? { referenceNo: dir }
        : key === "status"
          ? { status: dir }
          : { submittedAt: dir };
  return [primary, { id: "asc" }];
}

/** Server-side filtered, sorted, paginated application list within the user's record scope. */
export async function listApplications(user: SessionUser | null, q: ListQuery) {
  const u = requirePermission(user, "application:list");
  const scope = staffApplicationScope(u);
  if (!scope) throw new ForbiddenError();
  const where: Prisma.ApplicationWhereInput = { AND: [scope, filterWhere(q)] };
  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: orderBy(q.sort),
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: {
        id: true,
        referenceNo: true,
        status: true,
        processingStatus: true,
        submittedAt: true,
        currentRevision: { select: { candidateName: true, revisionNo: true } },
        vacancy: {
          select: {
            code: true,
            title: true,
            position: true,
            department: { select: { name: true, code: true } },
            discipline: { select: { name: true } },
          },
        },
        generated: {
          where: { status: "READY" },
          select: { id: true, version: true, pageCount: true },
          orderBy: { version: "desc" },
          take: 1,
        },
        _count: { select: { reviews: true } },
      },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / q.size)) };
}

/** Dashboard counters, all computed from the database within scope. Draft counts are HR-only. */
export async function dashboardCounts(user: SessionUser | null, cycleId?: string) {
  const u = requirePermission(user, "application:list");
  const scope = staffApplicationScope(u);
  if (!scope) throw new ForbiddenError();
  const cycle: Prisma.ApplicationWhereInput = cycleId ? { vacancy: { cycleId } } : {};
  const byStatus = await prisma.application.groupBy({
    by: ["status"],
    where: { AND: [scope, cycle] },
    _count: { _all: true },
  });
  const failed = await prisma.application.count({
    where: { AND: [scope, cycle, { processingStatus: "FAILED" }] },
  });
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const isHr = u.grants.some(
    (g) => g.role === "HR_OFFICER" || g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN",
  );
  let drafts: number | null = null;
  if (isHr) {
    const isFullAdmin = u.grants.some((g) => g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN");
    const hrCycles = u.grants.filter((g) => g.role === "HR_OFFICER").map((g) => g.cycleId);
    const all = isFullAdmin || hrCycles.includes(null);
    drafts = await prisma.application.count({
      where: {
        AND: [
          { status: "DRAFT" },
          cycle,
          all ? {} : { vacancy: { cycleId: { in: hrCycles.filter(Boolean) as string[] } } },
        ],
      },
    });
  }
  const total = byStatus.reduce((n, b) => n + b._count._all, 0);
  return {
    total,
    drafts,
    submitted: count("SUBMITTED"),
    pendingScreening: count("SUBMITTED") + count("UNDER_HR_REVIEW"),
    awaitingDepartment: count("UNDER_DEPARTMENT_REVIEW"),
    clarification: count("NEEDS_CLARIFICATION"),
    shortlisted: count("SHORTLISTED"),
    rejected: count("REJECTED"),
    approved: count("APPROVED"),
    withdrawn: count("WITHDRAWN"),
    processingFailures: failed,
  };
}

export async function filterOptions() {
  const [cycles, departments, vacancies] = await Promise.all([
    prisma.recruitmentCycle.findMany({
      orderBy: { opensAt: "desc" },
      select: { id: true, code: true, title: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        disciplines: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.vacancy.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, title: true } }),
  ]);
  return { cycles, departments, vacancies };
}

/** CSV export of authorised metadata only (no personal answers beyond name/reference). */
export async function exportCsv(user: SessionUser | null, q: ListQuery): Promise<string> {
  const u = requirePermission(user, "application:export");
  const all = await listApplications(u, { ...q, page: 1, size: 100 });
  const rows = [...all.rows];
  for (let page = 2; page <= all.pages && page <= 200; page++)
    rows.push(...(await listApplications(u, { ...q, page, size: 100 })).rows);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = [
    "Reference",
    "Candidate",
    "Vacancy",
    "Position",
    "Department",
    "Discipline",
    "Status",
    "PDF",
    "Submitted (UTC)",
    "Reviews",
  ];
  const lines = rows.map((r) =>
    [
      r.referenceNo,
      r.currentRevision?.candidateName,
      r.vacancy.code,
      r.vacancy.position,
      r.vacancy.department.name,
      r.vacancy.discipline?.name,
      r.status,
      r.processingStatus,
      r.submittedAt?.toISOString(),
      r._count.reviews,
    ]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\r\n");
}

export async function auditLog(
  user: SessionUser | null,
  params: { entityId?: string; action?: string; page: number },
) {
  requirePermission(user, "audit:read");
  const where: Prisma.AuditEventWhereInput = {
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.action ? { action: { startsWith: params.action } } : {}),
  };
  const size = 50;
  const [total, rows] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * size,
      take: size,
      include: { actor: { select: { email: true } } },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / size)) };
}
