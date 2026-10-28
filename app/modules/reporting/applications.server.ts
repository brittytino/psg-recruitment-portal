import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasRole, isAdmin, isHrOfficer } from "~/modules/auth/permissions";
import { requirePermission, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ForbiddenError } from "~/modules/core/errors";
import { APPLICATION_STATUSES, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { POSITION_LABELS } from "~/lib/labels";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";
import { experiencePeriods } from "~/modules/forms/validation";
import { totalDuration } from "~/modules/forms/experience";
import type { Answers, TableRow } from "~/modules/forms/types";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, type ExportColumnKey } from "./columns";

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

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  cycleId: z.string().uuid().optional().catch(undefined),
  departmentId: z.string().uuid().optional().catch(undefined),
  disciplineId: z.string().uuid().optional().catch(undefined),
  vacancyId: z.string().uuid().optional().catch(undefined),
  recruitmentCategory: z.enum(["FACULTY", "RESEARCH"]).optional().catch(undefined),
  researchSpecialisationId: z.string().uuid().optional().catch(undefined),
  position: z.enum(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"]).optional().catch(undefined),
  status: z.enum(APPLICATION_STATUSES).optional().catch(undefined),
  processing: z.enum(["NOT_STARTED", "QUEUED", "PROCESSING", "READY", "FAILED"]).optional().catch(undefined),
  /** Ph.D.: awarded / submitted / pursuing / none / any (awarded, submitted or pursuing). */
  phd: z.enum(["awarded", "submitted", "pursuing", "any", "none"]).optional().catch(undefined),
  /** Competitive exam: any, none or a specific exam (GATE, UGC-NET, …). */
  exam: z.string().trim().max(40).optional().catch(undefined),
  minExp: z.coerce.number().int().min(0).max(50).optional().catch(undefined),
  hod: z.enum(["assigned", "unassigned"]).optional().catch(undefined),
  from: optionalDate,
  to: optionalDate,
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

const PHD_STATUS: Record<string, string> = {
  awarded: "Awarded",
  submitted: "Thesis submitted",
  pursuing: "Pursuing",
};

function filterWhere(q: ListQuery): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  if (q.recruitmentCategory) and.push({ recruitmentCategory: q.recruitmentCategory });
  if (q.researchSpecialisationId)
    and.push({ vacancy: { researchSpecialisationId: q.researchSpecialisationId } });
  if (q.cycleId) and.push({ vacancy: { cycleId: q.cycleId } });
  if (q.departmentId) and.push({ vacancy: { departmentId: q.departmentId } });
  if (q.disciplineId) and.push({ vacancy: { disciplineId: q.disciplineId } });
  if (q.vacancyId) and.push({ vacancyId: q.vacancyId });
  if (q.position) and.push({ vacancy: { position: q.position } });
  if (q.status) and.push({ status: q.status });
  if (q.processing) and.push({ processingStatus: q.processing });
  if (q.phd === "any") and.push({ currentRevision: { phdStatus: { in: Object.values(PHD_STATUS) } } });
  else if (q.phd === "none")
    and.push({
      OR: [
        { currentRevision: { phdStatus: null } },
        { currentRevision: { phdStatus: { notIn: Object.values(PHD_STATUS) } } },
      ],
    });
  else if (q.phd) and.push({ currentRevision: { phdStatus: PHD_STATUS[q.phd] } });
  if (q.exam === "any") and.push({ currentRevision: { NOT: { competitiveExams: { isEmpty: true } } } });
  else if (q.exam === "none") and.push({ currentRevision: { competitiveExams: { isEmpty: true } } });
  else if (q.exam) and.push({ currentRevision: { competitiveExams: { has: q.exam } } });
  if (q.minExp !== undefined)
    and.push({ currentRevision: { totalExperienceMonths: { gte: q.minExp * 12 } } });
  if (q.hod === "assigned") and.push({ assignedHodId: { not: null } });
  if (q.hod === "unassigned") and.push({ assignedHodId: null });
  if (q.from) and.push({ submittedAt: { gte: new Date(`${q.from}T00:00:00+05:30`) } });
  if (q.to)
    and.push({ submittedAt: { lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86400_000) } });
  if (q.q) {
    const term = q.q;
    and.push({
      OR: [
        { referenceNo: { contains: term, mode: "insensitive" } },
        { currentRevision: { candidateName: { contains: term.toUpperCase() } } },
        { candidate: { email: { contains: term.toLowerCase() } } },
        { vacancy: { researchPositionTitle: { contains: term, mode: "insensitive" } } },
        { vacancy: { researchSpecialisation: { name: { contains: term, mode: "insensitive" } } } },
        { internalNote: { contains: term, mode: "insensitive" } },
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

function scopedWhere(user: SessionUser, q: ListQuery): Prisma.ApplicationWhereInput {
  const scope = staffApplicationScope(user);
  if (!scope) throw new ForbiddenError();
  return { AND: [scope, filterWhere(q)] };
}

/** Server-side filtered, sorted, paginated application list within the user's record scope. */
export async function listApplications(user: SessionUser | null, q: ListQuery) {
  const u = requirePermission(user, "application:list");
  const where = scopedWhere(u, q);
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
        recruitmentCategory: true,
        internalNote: true,
        processingStatus: true,
        submittedAt: true,
        appliedPosition: true,
        effectivePosition: true,
        hodDecision: true,
        assignedHod: { select: { email: true, profile: { select: { fullName: true } } } },
        currentRevision: {
          select: {
            candidateName: true,
            revisionNo: true,
            phdStatus: true,
            competitiveExams: true,
            totalExperienceMonths: true,
            journalCount: true,
            hIndex: true,
          },
        },
        vacancy: {
          select: {
            code: true,
            title: true,
            position: true,
            recruitmentCategory: true,
            researchPositionTitle: true,
            researchSpecialisationId: true,
            researchSpecialisation: { select: { name: true } },
            departmentId: true,
            department: { select: { name: true, code: true } },
            discipline: { select: { name: true } },
          },
        },
        generated: {
          where: { status: "READY", kind: "CONSOLIDATED_BUNDLE" },
          select: { id: true, version: true, pageCount: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / q.size)) };
}

/** Ids of every application matching the filters (for "select all filtered" bulk actions). */
export async function filteredIds(user: SessionUser | null, q: ListQuery, limit = 500): Promise<string[]> {
  const u = requirePermission(user, "application:list");
  const rows = await prisma.application.findMany({
    where: scopedWhere(u, q),
    select: { id: true },
    orderBy: orderBy(q.sort),
    take: limit,
  });
  return rows.map((r) => r.id);
}

/** Dashboard counters, all computed from the database within scope. Draft counts are Admin/HR only. */
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
  const count = (...s: string[]) =>
    byStatus.filter((b) => s.includes(b.status)).reduce((n, b) => n + b._count._all, 0);
  let drafts: number | null = null;
  if (isAdmin(u.grants) || isHrOfficer(u.grants))
    drafts = await prisma.application.count({ where: { AND: [{ status: "DRAFT" }, cycle] } });
  return {
    total: byStatus.reduce((n, b) => n + b._count._all, 0),
    drafts,
    submitted: count("SUBMITTED", "UNDER_HR_REVIEW"),
    withHod: count("ASSIGNED_TO_HOD"),
    hodAccepted: count("HOD_ACCEPTED"),
    hodChanged: count("HOD_RECOMMENDED_CHANGE"),
    hodRejected: count("HOD_REJECTED"),
    clarification: count("NEEDS_CLARIFICATION"),
    shortlisted: count("SHORTLISTED"),
    rejected: count("REJECTED"),
    approved: count("APPROVED"),
    withdrawn: count("WITHDRAWN"),
    processingFailures: failed,
  };
}

/** Department-wise counts by stage (HR summary dashboard). */
export async function departmentCounts(user: SessionUser | null, q: Partial<ListQuery> = {}) {
  const u = requirePermission(user, "application:list");
  const scope = staffApplicationScope(u);
  if (!scope) throw new ForbiddenError();
  const where: Prisma.ApplicationWhereInput = {
    AND: [
      scope,
      q.cycleId ? { vacancy: { cycleId: q.cycleId } } : {},
      q.position ? { vacancy: { position: q.position } } : {},
      q.departmentId ? { departmentId: q.departmentId } : {},
    ],
  };
  const groups = await prisma.application.groupBy({
    by: ["departmentId", "status"],
    where,
    _count: { _all: true },
  });
  const departments = await prisma.department.findMany({
    where: { id: { in: [...new Set(groups.map((g) => g.departmentId).filter(Boolean) as string[])] } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return departments.map((d) => {
    const n = (...s: string[]) =>
      groups
        .filter((g) => g.departmentId === d.id && s.includes(g.status))
        .reduce((t, g) => t + g._count._all, 0);
    return {
      ...d,
      total: n(...APPLICATION_STATUSES),
      unassigned: n("SUBMITTED", "UNDER_HR_REVIEW"),
      withHod: n("ASSIGNED_TO_HOD"),
      accepted: n("HOD_ACCEPTED"),
      changed: n("HOD_RECOMMENDED_CHANGE"),
      rejected: n("HOD_REJECTED", "REJECTED"),
      shortlisted: n("SHORTLISTED", "APPROVED"),
    };
  });
}

export async function filterOptions() {
  const [cycles, departments, vacancies, exams, researchSpecialisations] = await Promise.all([
    prisma.recruitmentCycle.findMany({
      orderBy: { opensAt: "desc" },
      select: { id: true, code: true, title: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        disciplines: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.vacancy.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, title: true } }),
    prisma.$queryRaw<{ exam: string }[]>`
      SELECT DISTINCT unnest("competitiveExams") AS exam FROM application_revisions ORDER BY 1`,
    prisma.researchSpecialisation.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const examNames = [...new Set(["GATE", "UGC-NET", "CSIR-NET", "SET", "SLET", ...exams.map((e) => e.exam)])];
  return { cycles, departments, vacancies, exams: examNames, specialisations: researchSpecialisations };
}

// ------------------------------------------------------------------------------------------------
// CSV export with column selection
// ------------------------------------------------------------------------------------------------

const exportInclude = {
  vacancy: {
    select: {
      code: true,
      position: true,
      recruitmentCategory: true,
      researchPositionTitle: true,
      researchSpecialisation: { select: { name: true } },
      department: { select: { name: true, code: true } },
      cycle: { select: { title: true } },
    },
  },
  candidate: { select: { email: true } },
  assignedHod: { select: { email: true, profile: { select: { fullName: true } } } },
  currentRevision: true,
  positionChanges: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.ApplicationInclude;

export type ExportRecord = Prisma.ApplicationGetPayload<{ include: typeof exportInclude }>;

const IST_DATE = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const s = typeof d === "string" ? d : new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : s;
};

/** One value per export column for an application record. */
export function exportValue(key: ExportColumnKey, r: ExportRecord, sNo: number): string | number {
  const a = (r.currentRevision?.answers ?? {}) as Answers;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const rows = (k: string) => (Array.isArray(a[k]) ? (a[k] as TableRow[]) : []);
  const degree = (lvl: string) => {
    const q = rows("collegeQualifications").find((x) => x.level === lvl);
    return q ? `${s(q.degree)}${q.specialisation ? ` (${s(q.specialisation)})` : ""}` : "";
  };
  const score = (lvl: string) => {
    const q = rows("collegeQualifications").find((x) => x.level === lvl);
    return q ? `${s(q.score)}${String(q.scoreType ?? "").startsWith("CGPA") ? " CGPA" : "%"}` : "";
  };
  const pc = r.positionChanges[0];
  const months = r.currentRevision?.totalExperienceMonths;
  const nature = (n: string) =>
    formatYearsMonths(totalDuration(experiencePeriods(a, n), new Date().toISOString().slice(0, 10)));
  const current = rows("experience").find((x) => x.isCurrent === "Yes");
  switch (key) {
    case "sNo":
      return sNo;
    case "referenceNo":
      return s(r.referenceNo);
    case "candidateName":
      return s(r.currentRevision?.candidateName);
    case "gender":
      return a.gender === "M" ? "Male" : a.gender === "F" ? "Female" : s(a.gender);
    case "dateOfBirth":
      return IST_DATE(typeof a.dateOfBirth === "string" ? a.dateOfBirth : null);
    case "age":
      return s(a.age);
    case "community":
      return s(a.community ?? a.communityCategory);
    case "email":
      return s(a.email ?? r.candidate.email);
    case "mobile":
      return s(a.mobile ?? a.phone);
    case "city":
      return [a.presentCity, a.presentDistrict, a.presentState].filter(Boolean).join(", ");
    case "department":
      return r.vacancy.department?.name ?? r.vacancy.researchSpecialisation?.name ?? "Research";
    case "specialisation":
      return r.vacancy.researchSpecialisation?.name ?? "";
    case "internalNote":
      return s(r.internalNote);
    case "appliedFor":
      return r.appliedPosition
        ? (POSITION_LABELS[r.appliedPosition] ?? r.appliedPosition)
        : (r.vacancy.researchPositionTitle ??
            (r.vacancy.position
              ? (POSITION_LABELS[r.vacancy.position] ?? r.vacancy.position)
              : "Research Assistant"));
    case "effectivePosition":
      return r.effectivePosition ? POSITION_LABELS[r.effectivePosition]! : "";
    case "vacancyCode":
      return r.vacancy.code;
    case "cycle":
      return r.vacancy.cycle.title;
    case "sslc":
      return s(a.sslcMarks);
    case "hsc":
      return s(a.hscMarks);
    case "ugDegree":
      return degree("UG");
    case "ugScore":
      return score("UG");
    case "pgDegree":
      return degree("PG");
    case "pgScore":
      return score("PG");
    case "phdStatus":
      return s(r.currentRevision?.phdStatus);
    case "phdUniversity":
      return s(a.phdUniversity);
    case "arrears":
      return `UG ${s(a.ugArrearPapers || 0)} / PG ${s(a.pgArrearPapers || 0)}`;
    case "totalExperience":
      return months == null ? "" : formatYearsMonths(splitMonths(months));
    case "teachingExperience":
      return nature("Teaching");
    case "industryExperience":
      return nature("Industry");
    case "currentEmployer":
      return current ? `${s(current.designation)}, ${s(current.institution)}` : "";
    case "lastDrawnPay":
      return s(a.lastDrawnPay);
    case "expectedPay":
      return s(a.expectedPay);
    case "joiningTime":
      return s(a.joiningTime);
    case "journals":
      return r.currentRevision?.journalCount ?? "";
    case "conferences":
      return r.currentRevision?.conferenceCount ?? "";
    case "books":
      return rows("booksPublished").length || "";
    case "bookChapters":
      return rows("bookChapters").length || "";
    case "hIndex":
      return s(a.hIndex);
    case "i10Index":
      return s(a.i10Index);
    case "citations":
      return s(a.citations);
    case "projects":
      return rows("researchProjects").length || "";
    case "patents":
      return rows("patents").length || "";
    case "phdGuide":
      return a.phdGuide === "Yes" ? `Yes (${s(a.scholarsCompleted || 0)} completed)` : s(a.phdGuide);
    case "exams":
      return (r.currentRevision?.competitiveExams ?? []).join(", ");
    case "examDetails":
      return rows("competitiveExams")
        .map((e) => `${s(e.exam)} ${s(e.year)}${e.score ? ` score ${s(e.score)}` : ""}`)
        .join("; ");
    case "hod":
      return r.assignedHod ? (r.assignedHod.profile?.fullName ?? r.assignedHod.email) : "";
    case "hodDecision":
      return r.hodDecision === "ACCEPT"
        ? "Accepted"
        : r.hodDecision === "REJECT"
          ? "Rejected"
          : r.hodDecision === "RECOMMEND_CHANGE"
            ? "Position change recommended"
            : "";
    case "recommendedFor":
      return pc ? `${POSITION_LABELS[pc.toPosition]} (${pc.status.toLowerCase()})` : "";
    case "hodReason":
      return [r.hodDecisionReason, r.hodRemarks].filter(Boolean).join(" — ");
    case "status":
      return STATUS_LABELS[r.status as AppStatus];
    case "submittedAt":
      return IST_DATE(r.submittedAt);
  }
}

/** Excel-compatible CSV cell: RFC 4180 quoting and spreadsheet formula-injection protection. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function parseColumns(raw: string[] | null | undefined): ExportColumnKey[] {
  const valid = new Set(EXPORT_COLUMNS.map((c) => c.key));
  const cols = (raw ?? []).filter((k): k is ExportColumnKey => valid.has(k as ExportColumnKey));
  return cols.length ? cols : [...DEFAULT_EXPORT_COLUMNS];
}

/** Filtered rows (database data) as CSV with the chosen columns. Admin and HR only. */
export async function exportCsv(
  user: SessionUser | null,
  q: ListQuery,
  columns: ExportColumnKey[],
  selectedIds?: string[],
) {
  const u = requirePermission(user, "application:export");
  const baseWhere = scopedWhere(u, q);
  const where: Prisma.ApplicationWhereInput =
    selectedIds && selectedIds.length > 0 ? { AND: [baseWhere, { id: { in: selectedIds } }] } : baseWhere;
  const lines: string[] = [];
  const labels = new Map(EXPORT_COLUMNS.map((c) => [c.key, c.label]));
  lines.push(columns.map((c) => csvCell(labels.get(c))).join(","));
  let n = 0;
  for (let page = 0; ; page++) {
    const batch = await prisma.application.findMany({
      where,
      orderBy: [{ department: { name: "asc" } }, { referenceNo: "asc" }, { id: "asc" }],
      skip: page * 200,
      take: 200,
      include: exportInclude,
    });
    for (const r of batch) {
      n++;
      lines.push(columns.map((c) => csvCell(exportValue(c, r, n))).join(","));
    }
    if (batch.length < 200) break;
  }
  return { csv: "\uFEFF" + lines.join("\r\n") + "\r\n", rows: n };
}

/** Previews export rows from database with selected columns and filters. */
export async function previewExport(
  user: SessionUser | null,
  q: ListQuery,
  columns: ExportColumnKey[],
  selectedIds?: string[],
  limit = 5,
) {
  const u = requirePermission(user, "application:export");
  const baseWhere = scopedWhere(u, q);
  const where: Prisma.ApplicationWhereInput =
    selectedIds && selectedIds.length > 0 ? { AND: [baseWhere, { id: { in: selectedIds } }] } : baseWhere;
  const labels = new Map(EXPORT_COLUMNS.map((c) => [c.key, c.label]));
  const headers = columns.map((c) => labels.get(c) ?? c);
  const batch = await prisma.application.findMany({
    where,
    orderBy: [{ department: { name: "asc" } }, { referenceNo: "asc" }, { id: "asc" }],
    take: limit,
    include: exportInclude,
  });
  const rows = batch.map((r, i) => columns.map((c) => exportValue(c, r, i + 1)));
  const total = await prisma.application.count({ where });
  return { headers, rows, total };
}

export async function auditLog(
  user: SessionUser | null,
  params: { entityId?: string; action?: string; actor?: string; page: number },
) {
  requirePermission(user, "audit:read");
  const where: Prisma.AuditEventWhereInput = {
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.action ? { action: { startsWith: params.action } } : {}),
    ...(params.actor ? { actor: { email: { contains: params.actor.toLowerCase() } } } : {}),
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
