import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ConflictError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "~/modules/documents/policy";
import { academicYearOf } from "~/modules/applications/reference";

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
      cycle: { status: "PUBLISHED" },
      closesAt: { gt: now },
      opensAt: { lte: now },
      ...(filter.recruitmentCategory ? { recruitmentCategory: filter.recruitmentCategory } : {}),
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.researchSpecialisationId ? { researchSpecialisationId: filter.researchSpecialisationId } : {}),
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
    include: { department: true, discipline: true, cycle: true, researchSpecialisation: true },
    orderBy: [{ closesAt: "asc" }, { title: "asc" }],
  });
}

export async function getPublishedVacancy(code: string) {
  const v = await prisma.vacancy.findFirst({
    where: {
      code,
      status: { in: ["PUBLISHED", "CLOSED"] },
      cycle: { status: { in: ["PUBLISHED", "CLOSED"] } },
    },
    include: {
      department: true,
      discipline: true,
      cycle: true,
      formTemplate: true,
      researchSpecialisation: true,
      eligibility: { orderBy: { sortOrder: "asc" } },
      requiredDocuments: { orderBy: { sortOrder: "asc" } },
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
const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "2–8 capital letters or digits, e.g. CSE"),
  name: z.string().trim().min(3, "Enter the department name").max(150),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

/** Departments and HODs are set up by the Admin (Dean / Principal). */
export async function createDepartment(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "user:manage");
  const p = departmentSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  try {
    return await prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: p.data });
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
}

export async function addDiscipline(user: SessionUser | null, departmentId: string, nameRaw: unknown) {
  const u = requirePermission(user, "user:manage");
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

const cycleSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,30}$/, "4-30 letters, digits or hyphens"),
    title: z.string().trim().min(5).max(200),
    description: z
      .string()
      .trim()
      .max(5000)
      .optional()
      .transform((v) => v || null),
    academicYear: z
      .string()
      .trim()
      .regex(/^d{4}-d{2}$/, "Use the form 2026-27")
      .refine(
        (y) => (Number(y.slice(0, 4)) + 1) % 100 === Number(y.slice(5)),
        "The two years must be consecutive",
      )
      .optional()
      .or(z.literal("").transform(() => undefined)),
    opensAt: dateTime,
    closesAt: dateTime,
  })
  .refine((c) => c.closesAt > c.opensAt, {
    path: ["closesAt"],
    message: "Closing date must be after the opening date",
  });

export async function createCycle(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "recruitment:manage");
  const p = cycleSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.recruitmentCycle.create({
        data: {
          ...p.data,
          academicYear: p.data.academicYear ?? academicYearOf(p.data.opensAt),
          createdById: u.id,
        },
      });
      await audit(
        {
          actorId: u.id,
          action: "cycle.created",
          entityType: "cycle",
          entityId: c.id,
          metadata: { code: c.code },
        },
        tx,
      );
      return c;
    });
  } catch (e) {
    uniqueViolation(e, "A recruitment cycle with this code already exists");
  }
}

export async function setCycleStatus(
  user: SessionUser | null,
  id: string,
  status: "PUBLISHED" | "CLOSED" | "ARCHIVED",
) {
  const u = requirePermission(user, "recruitment:manage");
  const c = await prisma.recruitmentCycle.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("Recruitment cycle");
  const allowed: Record<string, string[]> = {
    DRAFT: ["PUBLISHED"],
    PUBLISHED: ["CLOSED"],
    CLOSED: ["ARCHIVED", "PUBLISHED"],
    ARCHIVED: [],
  };
  if (!allowed[c.status]!.includes(status))
    throw new ConflictError(`Cannot change a ${c.status.toLowerCase()} cycle to ${status.toLowerCase()}`);
  await prisma.$transaction(async (tx) => {
    await tx.recruitmentCycle.update({
      where: { id },
      data: { status, publishedAt: status === "PUBLISHED" ? (c.publishedAt ?? new Date()) : c.publishedAt },
    });
    await audit(
      {
        actorId: u.id,
        action: "cycle.status_changed",
        entityType: "cycle",
        entityId: id,
        metadata: { from: c.status, to: status },
      },
      tx,
    );
  });
}

const POSITION_FORM: Record<string, "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR"> = {
  ASSISTANT_PROFESSOR: "ASSISTANT_PROFESSOR",
  ASSOCIATE_PROFESSOR: "ASSOCIATE_PROFESSOR",
  // The Associate Professor form is headed "PROFESSOR / ASSOCIATE PROFESSOR".
  PROFESSOR: "ASSOCIATE_PROFESSOR",
};

const vacancySchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,40}$/, "4-40 letters, digits or hyphens"),
    cycleId: z.string().uuid("Choose a recruitment cycle"),
    departmentId: z.string().uuid("Choose a department"),
    disciplineId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    position: z.enum(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"]),
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(10).max(10000),
    numberOfPosts: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(500)])
      .transform((v) => (v === "" ? null : v)),
    opensAt: dateTime,
    closesAt: dateTime,
    eligibility: z.string().max(10000).default(""),
    requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).default([]),
  })
  .refine((v) => v.closesAt > v.opensAt, {
    path: ["closesAt"],
    message: "Closing date must be after the opening date",
  });

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
  if (v.disciplineId) {
    const d = await prisma.discipline.findUnique({ where: { id: v.disciplineId } });
    if (!d || d.departmentId !== v.departmentId)
      throw new ValidationError("The discipline does not belong to the selected department", {
        disciplineId: ["Invalid discipline"],
      });
  }
  const criteria = v.eligibility
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.vacancy.create({
        data: {
          code: v.code,
          cycleId: v.cycleId,
          departmentId: v.departmentId,
          disciplineId: v.disciplineId ?? null,
          position: v.position,
          formTemplateId: form.id,
          title: v.title,
          description: v.description,
          numberOfPosts: v.numberOfPosts,
          opensAt: v.opensAt,
          closesAt: v.closesAt,
          eligibility: { create: criteria.map((description, sortOrder) => ({ description, sortOrder })) },
          requiredDocuments: {
            create: [...new Set(v.requiredDocuments)]
              .filter((t) => t !== "PHOTOGRAPH" && t !== "SIGNATURE")
              .map((t, sortOrder) => ({
                documentType: t,
                label: DOCUMENT_TYPE_LABELS[t],
                required: true,
                sortOrder,
              })),
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
  const v = await prisma.vacancy.findUnique({ where: { id }, include: { cycle: true } });
  if (!v) throw new NotFoundError("Vacancy");
  if (status === "PUBLISHED") {
    if (v.status !== "DRAFT" && v.status !== "CLOSED")
      throw new ConflictError("Only draft or closed vacancies can be published");
    if (v.cycle.status !== "PUBLISHED") throw new ConflictError("Publish the recruitment cycle first");
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
  const u = requirePermission(user, "recruitment:manage");
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

export async function updateResearchSpecialisation(
  user: SessionUser | null,
  id: string,
  input: unknown,
) {
  const u = requirePermission(user, "recruitment:manage");
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
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,40}$/, "4-40 letters, digits or hyphens"),
    cycleId: z.string().uuid("Choose a recruitment cycle"),
    researchSpecialisationId: z.string().uuid("Choose a research specialisation"),
    positionTitle: z.string().trim().min(3).max(100).default("Research Assistant"),
    departmentId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(10).max(10000),
    numberOfPosts: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(500)])
      .transform((v) => (v === "" ? null : v)),
    opensAt: dateTime,
    closesAt: dateTime,
    eligibility: z.string().max(10000).default(""),
    requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).default([]),
  })
  .refine((v) => v.closesAt > v.opensAt, {
    path: ["closesAt"],
    message: "Closing date must be after the opening date",
  });

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
  if (!spec) throw new ValidationError("Selected research specialisation does not exist");

  const criteria = v.eligibility
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.vacancy.create({
        data: {
          code: v.code,
          cycleId: v.cycleId,
          recruitmentCategory: "RESEARCH",
          researchSpecialisationId: v.researchSpecialisationId,
          researchPositionTitle: v.positionTitle,
          departmentId: v.departmentId ?? null,
          position: null,
          formTemplateId: form.id,
          title: v.title,
          description: v.description,
          numberOfPosts: v.numberOfPosts,
          opensAt: v.opensAt,
          closesAt: v.closesAt,
          eligibility: { create: criteria.map((description, sortOrder) => ({ description, sortOrder })) },
          requiredDocuments: {
            create: [...new Set(v.requiredDocuments)]
              .filter((t) => t !== "PHOTOGRAPH" && t !== "SIGNATURE")
              .map((t, sortOrder) => ({
                documentType: t,
                label: DOCUMENT_TYPE_LABELS[t],
                required: true,
                sortOrder,
              })),
          },
        },
      });
      await audit(
        {
          actorId: u.id,
          action: "vacancy.created",
          entityType: "vacancy",
          entityId: created.id,
          metadata: { code: created.code, recruitmentCategory: "RESEARCH", formTemplate: `${form.code}@${form.version}` },
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
  const [departments, cycles, vacancies, templates, researchSpecialisations] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        disciplines: { orderBy: { name: "asc" } },
        _count: { select: { vacancies: true } },
        roles: {
          where: { role: "HOD", user: { status: "ACTIVE" } },
          select: { user: { select: { email: true, profile: { select: { fullName: true } } } } },
        },
      },
    }),
    prisma.recruitmentCycle.findMany({
      orderBy: { opensAt: "desc" },
      include: { _count: { select: { vacancies: true } } },
    }),
    prisma.vacancy.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        department: true,
        discipline: true,
        researchSpecialisation: true,
        cycle: true,
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
  return { departments, cycles, vacancies, templates, researchSpecialisations };
}

