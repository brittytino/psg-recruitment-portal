import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ConflictError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { academicYearOf } from "~/modules/applications/reference";
import { POSITION_LABELS } from "~/lib/labels";
import { inviteHod } from "~/modules/users/service.server";

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors;
/** Accepts ISO strings; a value without a zone (from datetime-local inputs) is India Standard Time. */
const dateTime = z
  .string()
  .min(1, "Required")
  .transform((s, ctx) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s}+05:30` : s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

function uniqueViolation(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    throw new ConflictError(message);
  throw e;
}

// ------------------------------------------------------------------------------------------------
// Public queries
// ------------------------------------------------------------------------------------------------
export async function listPublishedVacancies(
  filter: {
    departmentId?: string;
    position?: string;
    recruitmentCategory?: "FACULTY" | "RESEARCH";
    researchSpecialisationId?: string;
    q?: string;
  } = {},
) {
  const now = new Date();
  return prisma.vacancy.findMany({
    where: {
      status: "PUBLISHED",
      closesAt: { gt: now },
      opensAt: { lte: now },
      ...(filter.recruitmentCategory ? { recruitmentCategory: filter.recruitmentCategory } : {}),
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.researchSpecialisationId
        ? { researchSpecialisationId: filter.researchSpecialisationId }
        : {}),
      ...(filter.position ? { position: filter.position as never } : {}),
      ...(filter.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: "insensitive" as const } },
              { code: { contains: filter.q, mode: "insensitive" as const } },
              { researchPositionTitle: { contains: filter.q, mode: "insensitive" as const } },
              { department: { name: { contains: filter.q, mode: "insensitive" as const } } },
              { discipline: { name: { contains: filter.q, mode: "insensitive" as const } } },
              { researchSpecialisation: { name: { contains: filter.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { department: true, discipline: true, researchSpecialisation: true },
    orderBy: [{ closesAt: "asc" }, { title: "asc" }],
  });
}

export async function getPublishedVacancy(code: string) {
  const v = await prisma.vacancy.findFirst({
    where: {
      code,
      status: { in: ["PUBLISHED", "CLOSED"] },
    },
    include: {
      department: true,
      discipline: true,
      formTemplate: true,
      researchSpecialisation: true,
      eligibility: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!v) throw new NotFoundError("Vacancy");
  return v;
}

export const listDepartments = (activeOnly = true) =>
  prisma.department.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { name: "asc" },
    include: { disciplines: { orderBy: { name: "asc" } } },
  });

export const listResearchSpecialisations = (activeOnly = true) =>
  prisma.researchSpecialisation.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

// ------------------------------------------------------------------------------------------------
// Administration (recruitment:manage)
// ------------------------------------------------------------------------------------------------
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "2–8 capital letters or digits, e.g. CSE"),
  name: z.string().trim().min(3, "Enter the department name").max(150),
  description: optionalText(1000),
  hodName: z.string().trim().min(2, "Enter the HOD's full name").max(120),
  hodEmail: z.string().trim().toLowerCase().email("Enter the HOD's official e-mail address").max(200),
});

/**
 * Departments are set up by HR – N4 Section. When a HOD name and e-mail are given, the HOD is
 * created (or the existing staff account gains the HOD role) and an invitation e-mail with the
 * sign-in link is sent.
 */
export async function createDepartment(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "department:manage");
  const p = departmentSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const { hodName, hodEmail, ...dept } = p.data;
  const taken = await prisma.user.findUnique({ where: { email: hodEmail }, include: { roles: true } });
  if (taken?.roles.some((r) => r.role === "CANDIDATE"))
    throw new ValidationError("This e-mail belongs to a candidate account", {
      hodEmail: ["Use the HOD's official institutional e-mail address"],
    });
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: dept });
      await audit(
        {
          actorId: u.id,
          action: "department.created",
          entityType: "department",
          entityId: d.id,
          metadata: { code: d.code },
        },
        tx,
      );
      return d;
    });
  } catch (e) {
    uniqueViolation(e, "A department with this code or name already exists");
  }
  await inviteHod(u, { departmentId: created.id, fullName: hodName, email: hodEmail });
  return created;
}

export async function addDiscipline(user: SessionUser | null, departmentId: string, nameRaw: unknown) {
  const u = requirePermission(user, "department:manage");
  const name = z.string().trim().min(2).max(150).safeParse(nameRaw);
  if (!name.success) throw new ValidationError("Enter a discipline name");
  try {
    return await prisma.$transaction(async (tx) => {
      const d = await tx.discipline.create({ data: { departmentId, name: name.data } });
      await audit(
        {
          actorId: u.id,
          action: "discipline.created",
          entityType: "department",
          entityId: departmentId,
          metadata: { disciplineId: d.id },
        },
        tx,
      );
      return d;
    });
  } catch (e) {
    uniqueViolation(e, "This discipline already exists in the department");
  }
}

const POSITION_FORM: Record<string, "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR"> = {
  ASSISTANT_PROFESSOR: "ASSISTANT_PROFESSOR",
  ASSOCIATE_PROFESSOR: "ASSOCIATE_PROFESSOR",
  // The Associate Professor form is headed "PROFESSOR / ASSOCIATE PROFESSOR".
  PROFESSOR: "ASSOCIATE_PROFESSOR",
};

const vacancyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{4,40}$/, "4–40 letters, digits or hyphens")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

const vacancyCommon = {
  code: vacancyCode,
  description: z.string().trim().min(10, "Describe the position in at least 10 characters").max(10000),
  numberOfPosts: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(500)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  opensAt: dateTime,
  closesAt: dateTime,
  eligibility: z.string().max(10000).default(""),
};

const closesAfterOpens = { path: ["closesAt"], message: "Closing date must be after the opening date" };

const vacancySchema = z
  .object({
    ...vacancyCommon,
    departmentId: z.string().uuid("Choose a department"),
    disciplineId: optionalUuid,
    position: z.enum(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"], {
      error: "Choose a position",
    }),
  })
  .refine((v) => v.closesAt > v.opensAt, closesAfterOpens);

const POSITION_CODE: Record<string, string> = {
  ASSISTANT_PROFESSOR: "AP",
  ASSOCIATE_PROFESSOR: "ASP",
  PROFESSOR: "PROF",
};

const criteriaOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

/** A free vacancy code built from the year and a short stem, e.g. "2026-CSE-AP" or "2026-CSE-AP-2". */
async function freeVacancyCode(stem: string, opensAt: Date): Promise<string> {
  const base = `${opensAt.getFullYear()}-${stem}`
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 34);
  for (let i = 1; i < 100; i++) {
    const code = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.vacancy.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new ConflictError("Could not generate a vacancy code; enter one manually");
}

export async function createVacancy(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "recruitment:manage");
  const p = vacancySchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const v = p.data;
  const form = await prisma.formTemplate.findFirst({
    where: { code: POSITION_FORM[v.position], active: true },
    orderBy: { version: "desc" },
  });
  if (!form) throw new ConflictError("No active official form template is registered for this position");
  const department = await prisma.department.findUnique({ where: { id: v.departmentId } });
  if (!department || !department.active)
    throw new ValidationError("Choose an active department", { departmentId: ["Invalid department"] });
  const discipline = v.disciplineId
    ? await prisma.discipline.findUnique({ where: { id: v.disciplineId } })
    : null;
  if (v.disciplineId && (!discipline || discipline.departmentId !== v.departmentId))
    throw new ValidationError("The discipline does not belong to the selected department", {
      disciplineId: ["Invalid discipline"],
    });
  const code =
    v.code ?? (await freeVacancyCode(`${department.code}-${POSITION_CODE[v.position]}`, v.opensAt));
  const title = `${POSITION_LABELS[v.position]} – ${discipline?.name ?? department.name}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.vacancy.create({
        data: {
          code,
          academicYear: academicYearOf(v.opensAt),
          departmentId: v.departmentId,
          disciplineId: v.disciplineId ?? null,
          position: v.position,
          formTemplateId: form.id,
          title,
          description: v.description,
          numberOfPosts: v.numberOfPosts,
          opensAt: v.opensAt,
          closesAt: v.closesAt,
          eligibility: {
            create: criteriaOf(v.eligibility).map((description, sortOrder) => ({ description, sortOrder })),
          },
        },
      });
      await audit(
        {
          actorId: u.id,
          action: "vacancy.created",
          entityType: "vacancy",
          entityId: created.id,
          metadata: { code: created.code, formTemplate: `${form.code}@${form.version}` },
        },
        tx,
      );
      return created;
    });
  } catch (e) {
    uniqueViolation(e, "A vacancy with this code already exists");
  }
}

export async function setVacancyStatus(user: SessionUser | null, id: string, status: "PUBLISHED" | "CLOSED") {
  const u = requirePermission(user, "recruitment:manage");
  const v = await prisma.vacancy.findUnique({ where: { id } });
  if (!v) throw new NotFoundError("Vacancy");
  if (status === "PUBLISHED") {
    if (v.status !== "DRAFT" && v.status !== "CLOSED")
      throw new ConflictError("Only draft or closed vacancies can be published");
    if (v.closesAt <= new Date()) throw new ConflictError("The closing date is in the past");
  }
  if (status === "CLOSED" && v.status !== "PUBLISHED")
    throw new ConflictError("Only published vacancies can be closed");
  await prisma.$transaction(async (tx) => {
    await tx.vacancy.update({
      where: { id },
      data: { status, publishedAt: status === "PUBLISHED" ? (v.publishedAt ?? new Date()) : v.publishedAt },
    });
    await audit(
      {
        actorId: u.id,
        action: "vacancy.status_changed",
        entityType: "vacancy",
        entityId: id,
        metadata: { from: v.status, to: status },
      },
      tx,
    );
  });
}

export const researchSpecialisationSchema = z.object({
  name: z.string().trim().min(3, "Enter the specialisation name").max(150),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export async function createResearchSpecialisation(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "department:manage");
  const p = researchSpecialisationSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.researchSpecialisation.create({ data: p.data });
      await audit(
        {
          actorId: u.id,
          action: "research_specialisation.created",
          entityType: "research_specialisation",
          entityId: s.id,
          metadata: { name: s.name },
        },
        tx,
      );
      return s;
    });
  } catch (e) {
    uniqueViolation(e, "A research specialisation with this name already exists");
  }
}

export async function updateResearchSpecialisation(user: SessionUser | null, id: string, input: unknown) {
  const u = requirePermission(user, "department:manage");
  const p = researchSpecialisationSchema.partial().safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.researchSpecialisation.update({ where: { id }, data: p.data });
      await audit(
        {
          actorId: u.id,
          action: "research_specialisation.updated",
          entityType: "research_specialisation",
          entityId: s.id,
          metadata: { name: s.name },
        },
        tx,
      );
      return s;
    });
  } catch (e) {
    uniqueViolation(e, "A research specialisation with this name already exists");
  }
}

const researchVacancySchema = z
  .object({
    ...vacancyCommon,
    researchSpecialisationId: z.string().uuid("Choose a research specialisation"),
    positionTitle: z.string().trim().min(3).max(100).default("Research Assistant"),
    departmentId: optionalUuid,
  })
  .refine((v) => v.closesAt > v.opensAt, closesAfterOpens);

export async function createResearchVacancy(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "recruitment:manage");
  const p = researchVacancySchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const v = p.data;
  const form = await prisma.formTemplate.findFirst({
    where: { code: "RESEARCH_APPLICATION", active: true },
    orderBy: { version: "desc" },
  });
  if (!form) throw new ConflictError("No active research application form template is registered");
  const spec = await prisma.researchSpecialisation.findUnique({ where: { id: v.researchSpecialisationId } });
  if (!spec || !spec.active)
    throw new ValidationError("Choose an active research specialisation", {
      researchSpecialisationId: ["Invalid specialisation"],
    });
  const initials = spec.name
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 2)
    .map((w) => w[0])
    .join("")
    .slice(0, 6);
  const code = v.code ?? (await freeVacancyCode(`RA-${initials || "GEN"}`, v.opensAt));
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.vacancy.create({
        data: {
          code,
          academicYear: academicYearOf(v.opensAt),
          recruitmentCategory: "RESEARCH",
          researchSpecialisationId: v.researchSpecialisationId,
          researchPositionTitle: v.positionTitle,
          departmentId: v.departmentId ?? null,
          position: null,
          formTemplateId: form.id,
          title: `${v.positionTitle} – ${spec.name}`,
          description: v.description,
          numberOfPosts: v.numberOfPosts,
          opensAt: v.opensAt,
          closesAt: v.closesAt,
          eligibility: {
            create: criteriaOf(v.eligibility).map((description, sortOrder) => ({ description, sortOrder })),
          },
        },
      });
      await audit(
        {
          actorId: u.id,
          action: "vacancy.created",
          entityType: "vacancy",
          entityId: created.id,
          metadata: {
            code: created.code,
            recruitmentCategory: "RESEARCH",
            formTemplate: `${form.code}@${form.version}`,
          },
        },
        tx,
      );
      return created;
    });
  } catch (e) {
    uniqueViolation(e, "A vacancy with this code already exists");
  }
}

export async function adminOverview(user: SessionUser | null) {
  requirePermission(user, "recruitment:manage");
  const [departments, vacancies, templates, researchSpecialisations] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        disciplines: { orderBy: { name: "asc" } },
        _count: { select: { vacancies: true } },
        roles: {
          where: { role: "HOD" },
          select: {
            id: true,
            user: {
              select: {
                id: true,
                email: true,
                status: true,
                lastLoginAt: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.vacancy.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        department: true,
        discipline: true,
        researchSpecialisation: true,
        formTemplate: true,
        _count: { select: { applications: true } },
      },
    }),
    prisma.formTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] }),
    prisma.researchSpecialisation.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { vacancies: true } } },
    }),
  ]);
  return { departments, vacancies, templates, researchSpecialisations };
}

// ------------------------------------------------------------------------------------------------
// Editing a job opening (HR – N4 Section / Admin)
// ------------------------------------------------------------------------------------------------
const vacancyEditSchema = z
  .object({
    description: vacancyCommon.description,
    numberOfPosts: vacancyCommon.numberOfPosts,
    opensAt: dateTime,
    closesAt: dateTime,
    eligibility: z.string().max(10000).default(""),
    disciplineId: optionalUuid,
    positionTitle: z.string().trim().min(3).max(100).optional(),
  })
  .refine((v) => v.closesAt > v.opensAt, closesAfterOpens);

export async function getVacancyForEdit(user: SessionUser | null, id: string) {
  requirePermission(user, "recruitment:manage");
  const v = await prisma.vacancy.findUnique({
    where: { id },
    include: {
      department: { include: { disciplines: { where: { active: true }, orderBy: { name: "asc" } } } },
      researchSpecialisation: true,
      eligibility: { orderBy: { sortOrder: "asc" } },
      _count: { select: { applications: true } },
    },
  });
  if (!v) throw new NotFoundError("Vacancy");
  return v;
}

/**
 * Updates the details candidates see. Position, department and form stay fixed once created so that
 * existing applications keep matching their official form; create a new opening to change those.
 */
export async function updateVacancy(user: SessionUser | null, id: string, input: unknown) {
  const u = requirePermission(user, "recruitment:manage");
  const p = vacancyEditSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const v = p.data;
  const current = await prisma.vacancy.findUnique({
    where: { id },
    include: { department: true, discipline: true, researchSpecialisation: true },
  });
  if (!current) throw new NotFoundError("Vacancy");
  let discipline = current.discipline;
  if (current.recruitmentCategory === "FACULTY" && v.disciplineId !== (current.disciplineId ?? undefined)) {
    discipline = v.disciplineId
      ? await prisma.discipline.findUnique({ where: { id: v.disciplineId } })
      : null;
    if (v.disciplineId && (!discipline || discipline.departmentId !== current.departmentId))
      throw new ValidationError("The specialisation does not belong to this department", {
        disciplineId: ["Invalid specialisation"],
      });
  }
  const researchTitle =
    current.recruitmentCategory === "RESEARCH" ? (v.positionTitle ?? current.researchPositionTitle) : null;
  const title =
    current.recruitmentCategory === "RESEARCH"
      ? `${researchTitle} – ${current.researchSpecialisation?.name ?? "Research"}`
      : `${POSITION_LABELS[current.position!]} – ${discipline?.name ?? current.department?.name ?? ""}`;
  await prisma.$transaction(async (tx) => {
    await tx.eligibilityCriterion.deleteMany({ where: { vacancyId: id } });
    await tx.vacancy.update({
      where: { id },
      data: {
        title,
        description: v.description,
        numberOfPosts: v.numberOfPosts,
        opensAt: v.opensAt,
        closesAt: v.closesAt,
        academicYear: current.academicYear ?? academicYearOf(v.opensAt),
        ...(current.recruitmentCategory === "FACULTY"
          ? { disciplineId: v.disciplineId ?? null }
          : { researchPositionTitle: researchTitle }),
        eligibility: {
          create: criteriaOf(v.eligibility).map((description, sortOrder) => ({ description, sortOrder })),
        },
      },
    });
    await audit(
      {
        actorId: u.id,
        action: "vacancy.updated",
        entityType: "vacancy",
        entityId: id,
        metadata: { code: current.code },
      },
      tx,
    );
  });
}

const extendSchema = z.object({
  closesAt: dateTime,
  reason: z.string().trim().max(500).default(""),
});

/**
 * Extends a vacancy's last date (HR – N4 Section, Admin, Dean / Principal). Works before or after
 * the old date has passed: the vacancy simply carries on, drafts already started can be finished
 * and submitted, and a closed vacancy is opened again. Nothing about existing applications changes.
 */
export async function extendDeadline(user: SessionUser | null, id: string, input: unknown) {
  const u = requirePermission(user, "recruitment:manage");
  const p = extendSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const v = await prisma.vacancy.findUnique({ where: { id } });
  if (!v) throw new NotFoundError("Vacancy");
  const to = p.data.closesAt;
  if (to <= new Date())
    throw new ValidationError("Choose a date in the future", { closesAt: ["Choose a date in the future"] });
  if (to <= v.closesAt)
    throw new ValidationError("The new last date must be later than the current one", {
      closesAt: ["Must be later than the current last date"],
    });
  if (to <= v.opensAt)
    throw new ValidationError("The last date must be after the opening date", {
      closesAt: ["Must be after the opening date"],
    });
  await prisma.$transaction(async (tx) => {
    await tx.vacancy.update({
      where: { id },
      data: { closesAt: to, ...(v.status === "CLOSED" ? { status: "PUBLISHED" as const } : {}) },
    });
    await audit(
      {
        actorId: u.id,
        action: "vacancy.deadline_extended",
        entityType: "vacancy",
        entityId: id,
        metadata: {
          code: v.code,
          from: v.closesAt.toISOString(),
          to: to.toISOString(),
          reopened: v.status === "CLOSED",
          reason: p.data.reason || undefined,
        },
      },
      tx,
    );
  });
  return { reopened: v.status === "CLOSED" };
}
