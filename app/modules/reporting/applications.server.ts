import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { isAdmin, isHrOfficer } from "~/modules/auth/permissions";
import { requirePermission, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ForbiddenError } from "~/modules/core/errors";
import { APPLICATION_STATUSES, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { POSITION_LABELS } from "~/lib/labels";
import { academicYearOf } from "~/modules/applications/reference";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";
import { experiencePeriods } from "~/modules/forms/validation";
import { totalDuration } from "~/modules/forms/experience";
import type { Answers, TableRow } from "~/modules/forms/types";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, type ExportColumnKey } from "./columns";

import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./constants";
import { YEAR_PATTERN, yearOfVacancy, yearRange } from "./years";
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
  /** Recruitment (academic) year, e.g. "2026-27". */
  year: z.string().regex(YEAR_PATTERN).optional().catch(undefined),
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
  /**
   * Mode of study (summary sheet check boxes), comma separated: "full" = every degree and the
   * Ph.D. full-time; "part" / "distance" = at least one degree or the Ph.D. in that mode.
   */
  mode: z
    .string()
    .optional()
    .transform((v) => {
      const m = (v ?? "").split(",").filter((x): x is StudyMode => STUDY_MODES.includes(x as StudyMode));
      return m.length ? [...new Set(m)] : undefined;
    })
    .catch(undefined),
  from: optionalDate,
  to: optionalDate,
  sort: z.enum(SORTS).default("-submittedAt").catch("-submittedAt"),
  page: z.coerce.number().int().min(1).max(100000).default(1).catch(1),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(DEFAULT_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(url: URL): ListQuery {
  const entries = Object.fromEntries([...url.searchParams].filter(([, v]) => v !== ""));
  // Check boxes send the same name several times.
  const modes = url.searchParams.getAll("mode").filter(Boolean);
  if (modes.length) entries.mode = modes.join(",");
  return listQuerySchema.parse(entries);
}

export const STUDY_MODES = ["full", "part", "distance"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];
const MODE_VALUE: Record<StudyMode, string> = {
  full: "Full-time",
  part: "Part-time",
  distance: "Distance Education",
};

const PHD_STATUS: Record<string, string> = {
  awarded: "Awarded",
  submitted: "Thesis submitted",
  pursuing: "Pursuing",
};

/** Applications whose vacancy belongs to this recruitment year (stored or derived from opening date). */
export function yearWhere(year: string): Prisma.ApplicationWhereInput {
  const { from, to } = yearRange(year);
  return {
    OR: [
      { vacancy: { academicYear: year } },
      { vacancy: { academicYear: null, opensAt: { gte: from, lt: to } } },
    ],
  };
}

function filterWhere(q: ListQuery): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  if (q.year) and.push(yearWhere(q.year));
  if (q.recruitmentCategory) and.push({ recruitmentCategory: q.recruitmentCategory });
  if (q.researchSpecialisationId)
    and.push({ vacancy: { researchSpecialisationId: q.researchSpecialisationId } });
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
  if (q.mode?.length)
    and.push({
      OR: q.mode.map((m): Prisma.ApplicationWhereInput =>
        m === "full"
          ? {
              currentRevision: {
                qualifications: {
                  some: { category: "COLLEGE" },
                  none: { category: "COLLEGE", modeOfStudy: { not: MODE_VALUE.full } },
                },
              },
            }
          : {
              currentRevision: {
                qualifications: { some: { category: "COLLEGE", modeOfStudy: MODE_VALUE[m] } },
              },
            },
      ),
    });
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
        hodRating: true,
        finalDecision: true,
        finalRating: true,
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
export async function dashboardCounts(user: SessionUser | null) {
  const u = requirePermission(user, "application:list");
  const scope = staffApplicationScope(u);
  if (!scope) throw new ForbiddenError();
  const byStatus = await prisma.application.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });
  const failed = await prisma.application.count({
    where: { AND: [scope, { processingStatus: "FAILED" }] },
  });
  const count = (...s: string[]) =>
    byStatus.filter((b) => s.includes(b.status)).reduce((n, b) => n + b._count._all, 0);
  let drafts: number | null = null;
  if (isAdmin(u.grants) || isHrOfficer(u.grants))
    drafts = await prisma.application.count({ where: { status: "DRAFT" } });
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
      q.position ? { vacancy: { position: q.position } } : {},
      q.departmentId ? { departmentId: q.departmentId } : {},
      q.year ? yearWhere(q.year) : {},
      q.recruitmentCategory ? { recruitmentCategory: q.recruitmentCategory } : {},
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
  // Active HODs per department, so bulk assignment shows who will receive the applications.
  const hodRoles = await prisma.userRole.findMany({
    where: { role: "HOD", departmentId: { in: departments.map((d) => d.id) }, user: { status: "ACTIVE" } },
    select: {
      departmentId: true,
      user: { select: { email: true, profile: { select: { fullName: true } } } },
    },
    take: 1000,
  });
  return departments.map((d) => {
    const hods = hodRoles
      .filter((r) => r.departmentId === d.id)
      .map((r) => r.user.profile?.fullName || r.user.email);
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
      hods,
    };
  });
}

export async function filterOptions() {
  const [departments, vacancies, exams, researchSpecialisations] = await Promise.all([
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
  return { departments, vacancies, exams: examNames, specialisations: researchSpecialisations };
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
      academicYear: true,
      opensAt: true,
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
    case "academicYear":
      return r.vacancy.academicYear ?? academicYearOf(r.vacancy.opensAt);
    case "sslc":
      return s(a.sslcMarks);
    case "hsc":
      return a.hscRoute === "DIPLOMA" ? "Diploma (no HSC)" : s(a.hscMarks);
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

/** Recruitment years that have vacancies, newest first, with vacancy and application counts. */
export async function recruitmentYears() {
  const vacancies = await prisma.vacancy.findMany({
    select: {
      academicYear: true,
      opensAt: true,
      _count: { select: { applications: { where: { status: { not: "DRAFT" } } } } },
    },
  });
  const years = new Map<string, { year: string; vacancies: number; applications: number }>();
  for (const v of vacancies) {
    const y = yearOfVacancy(v);
    const e = years.get(y) ?? { year: y, vacancies: 0, applications: 0 };
    e.vacancies += 1;
    e.applications += v._count.applications;
    years.set(y, e);
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}

/**
 * Report figures for the summary page: pipeline by status, position mix, stream, Dean / Principal
 * decisions, average ratings and submissions per week — all within the user's scope and filters.
 */
export async function reportStats(user: SessionUser | null, q: ListQuery) {
  const u = requirePermission(user, "application:list");
  const where = scopedWhere(u, q);
  const [byStatus, byPosition, byCategory, byFinal, ratings, submitted] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["appliedPosition"], where, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["recruitmentCategory"], where, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["finalDecision"], where, _count: { _all: true } }),
    prisma.application.aggregate({ where, _avg: { hodRating: true, finalRating: true } }),
    prisma.application.findMany({
      where: { AND: [where, { submittedAt: { not: null } }] },
      select: { submittedAt: true },
      take: 20000,
    }),
  ]);
  const n = (...st: string[]) =>
    byStatus.filter((b) => st.includes(b.status)).reduce((t, b) => t + b._count._all, 0);
  // Submissions per week (IST), last 12 weeks that have data.
  const week = (d: Date) => {
    const ist = new Date(d.getTime() + 330 * 60_000);
    const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
    ist.setUTCDate(ist.getUTCDate() - day);
    return ist.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, number>();
  for (const a of submitted) weeks.set(week(a.submittedAt!), (weeks.get(week(a.submittedAt!)) ?? 0) + 1);
  // Continuous weeks (empty weeks show as zero) up to the latest one with submissions; last 12.
  const keys = [...weeks.keys()].sort();
  const trend: [string, number][] = [];
  if (keys.length) {
    const end = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 7 * 86400_000).toISOString().slice(0, 10);
      if (d >= keys[0]! || trend.length) trend.push([d, weeks.get(d) ?? 0]);
    }
  }
  return {
    total: byStatus.reduce((t, b) => t + b._count._all, 0),
    pipeline: [
      {
        key: "new",
        label: "Not yet with HOD",
        value: n("SUBMITTED", "UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW"),
      },
      { key: "hod", label: "With HOD", value: n("ASSIGNED_TO_HOD") },
      { key: "accepted", label: "HOD accepted", value: n("HOD_ACCEPTED") },
      { key: "changed", label: "Position change", value: n("HOD_RECOMMENDED_CHANGE") },
      { key: "rejected", label: "Rejected", value: n("HOD_REJECTED", "REJECTED") },
      { key: "shortlisted", label: "Shortlisted / approved", value: n("SHORTLISTED", "APPROVED") },
      { key: "other", label: "Clarification / withdrawn", value: n("NEEDS_CLARIFICATION", "WITHDRAWN") },
    ],
    positions: byPosition
      .map((p) => ({
        label: p.appliedPosition ? (POSITION_LABELS[p.appliedPosition] ?? p.appliedPosition) : "Research",
        value: p._count._all,
      }))
      .sort((a, b) => b.value - a.value),
    categories: byCategory.map((c) => ({
      label: c.recruitmentCategory === "RESEARCH" ? "Research" : "Faculty",
      value: c._count._all,
    })),
    final: {
      accepted: byFinal.find((f) => f.finalDecision === "ACCEPT")?._count._all ?? 0,
      rejected: byFinal.find((f) => f.finalDecision === "REJECT")?._count._all ?? 0,
    },
    avgHodRating: ratings._avg.hodRating,
    avgFinalRating: ratings._avg.finalRating,
    trend: trend.map(([weekOf, value]) => ({ weekOf, value })),
  };
}
