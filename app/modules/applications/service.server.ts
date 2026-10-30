import { getSetting } from "~/modules/settings/service.server";
import { todayIst } from "~/lib/dates";
import { createHash } from "node:crypto";
import { Prisma, type Application, type ApplicationStatus } from "@prisma/client";
import { audit } from "~/modules/audit/audit.server";
import { hasRole } from "~/modules/auth/permissions";
import { hrScope, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma, type Tx } from "~/modules/core/db.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { allFields, getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode, FormDefinition, TableRow } from "~/modules/forms/types";
import { periodDuration, totalDuration } from "~/modules/forms/experience";
import {
  experiencePeriods,
  stripDerived,
  uploadRequired,
  validateAnswers,
  withDerived,
  type DerivedContext,
  type FieldIssue,
} from "~/modules/forms/validation";
import { DOCUMENT_TYPE_LABELS, INLINE_ENTRY_DOC_TYPES } from "~/modules/documents/policy";
import { POSITION_LABELS } from "~/lib/labels";
import { academicYearOf, ACADEMIC_YEAR, formatReference, formatResearchReference } from "./reference";
import { enqueueOutbox, notify } from "~/modules/notifications/outbox.server";
import {
  EDITABLE,
  findTransition,
  STATUS_LABELS,
  type AppStatus,
  type RecruitmentCategory,
} from "./workflow";

const today = () => todayIst();

/** Deterministic JSON (sorted keys) so the answers hash is stable. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

function vacancyOpen(v: { status: string; opensAt: Date; closesAt: Date }, at = new Date()): boolean {
  return v.status === "PUBLISHED" && v.opensAt <= at && v.closesAt > at;
}

async function recordStatus(
  tx: Tx,
  app: Pick<Application, "id">,
  from: ApplicationStatus | null,
  to: ApplicationStatus,
  actorId: string,
  reason?: string | null,
) {
  await tx.applicationStatusHistory.create({
    data: { applicationId: app.id, fromStatus: from, toStatus: to, actorId, reason: reason ?? null },
  });
}

// ---------------------------------------------------------------------------------------------
// Candidate operations
// ---------------------------------------------------------------------------------------------

/** Creates (or returns the existing) draft for a vacancy. One application per candidate per vacancy. */
export async function createDraft(user: SessionUser, vacancyId: string): Promise<Application> {
  if (!hasRole(user.grants, "CANDIDATE")) throw new ForbiddenError("Only candidate accounts can apply");
  if (!user.emailVerified)
    throw new ForbiddenError("Please verify your e-mail address before starting an application");
  const vacancy = await prisma.vacancy.findUnique({
    where: { id: vacancyId },
    include: { formTemplate: true },
  });
  if (!vacancy) throw new NotFoundError("Vacancy");
  const existing = await prisma.application.findUnique({
    where: { candidateId_vacancyId: { candidateId: user.id, vacancyId } },
  });
  if (existing) return existing;
  if (!vacancyOpen(vacancy)) throw new ConflictError("This vacancy is not open for applications");
  try {
    return await prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          candidateId: user.id,
          vacancyId,
          formTemplateId: vacancy.formTemplateId,
          draftAnswers: {},
          recruitmentCategory: vacancy.recruitmentCategory,
          departmentId: vacancy.departmentId ?? null,
          appliedPosition: vacancy.position ?? null,
        },
      });
      await recordStatus(tx, app, null, "DRAFT", user.id);
      await audit(
        {
          actorId: user.id,
          action: "application.draft_created",
          entityType: "application",
          entityId: app.id,
          metadata: { vacancyId },
        },
        tx,
      );
      return app;
    });
  } catch (e) {
    // Concurrent double-click: the unique constraint guarantees a single draft.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return prisma.application.findUniqueOrThrow({
        where: { candidateId_vacancyId: { candidateId: user.id, vacancyId } },
      });
    throw e;
  }
}

export async function getOwnApplication(user: SessionUser, id: string) {
  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      vacancy: {
        include: {
          department: true,
          discipline: true,
          researchSpecialisation: true,
          requiredDocuments: { orderBy: { sortOrder: "asc" } },
        },
      },
      formTemplate: true,
      documents: { where: { removedAt: null }, orderBy: { uploadedAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      currentRevision: { select: { id: true, revisionNo: true, createdAt: true } },
    },
  });
  // Same response for "missing" and "not yours": no information about other candidates' records.
  if (!app || app.candidateId !== user.id) throw new NotFoundError("Application");
  return app;
}

export async function listOwnApplications(user: SessionUser) {
  return prisma.application.findMany({
    where: { candidateId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { vacancy: { include: { department: true, researchSpecialisation: true } } },
  });
}

export interface SaveResult {
  version: number;
  savedAt: Date;
  issues: FieldIssue[];
}

/**
 * Saves draft answers with optimistic concurrency: the caller sends the version it loaded; if
 * another tab saved in the meantime the update affects zero rows and a ConflictError is raised.
 */
export async function saveDraft(
  user: SessionUser,
  id: string,
  answers: unknown,
  expectedVersion: number,
): Promise<SaveResult> {
  const app = await getOwnApplication(user, id);
  if (!EDITABLE.includes(app.status as AppStatus))
    throw new ConflictError("This application has been submitted and can no longer be edited");
  if (app.status === "DRAFT" && !vacancyOpen(app.vacancy))
    throw new ConflictError("The closing date for this vacancy has passed");
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  const issues = validateAnswers(def, answers, "draft");
  const structural = issues.filter((i) => i.message.startsWith("Unknown field") || i.path === "");
  if (structural.length)
    throw new ValidationError("The submitted data does not match the application form", structural);
  if (issues.length) throw new ValidationError("Some answers are invalid", issues);
  const clean = stripDerived(def, answers as Answers);
  const savedAt = new Date();
  const res = await prisma.application.updateMany({
    where: { id, candidateId: user.id, draftVersion: expectedVersion, status: { in: [...EDITABLE] } },
    data: {
      draftAnswers: clean as Prisma.InputJsonObject,
      draftVersion: { increment: 1 },
      lastSavedAt: savedAt,
    },
  });
  if (res.count !== 1) {
    const current = await prisma.application.findUnique({
      where: { id },
      select: { draftVersion: true, lastSavedAt: true },
    });
    throw new ConflictError(
      "This application was changed in another window or tab. Reload to see the latest saved version before continuing.",
      { currentVersion: current?.draftVersion, lastSavedAt: current?.lastSavedAt },
    );
  }
  return { version: expectedVersion + 1, savedAt, issues: [] };
}

/** Context for derived values (department, post, age, experience totals). */
export function derivedContext(app: {
  vacancy: {
    department?: { name: string } | null;
    position?: string | null;
    researchPositionTitle?: string | null;
    researchSpecialisation?: { name: string } | null;
  };
}): DerivedContext {
  const dept = app.vacancy.department?.name ?? "";
  const spec = app.vacancy.researchSpecialisation?.name;
  const pos =
    app.vacancy.researchPositionTitle ??
    (app.vacancy.position
      ? (POSITION_LABELS[app.vacancy.position] ?? app.vacancy.position)
      : "Research Assistant");
  return {
    department: dept,
    position: pos,
    specialisation: spec,
    asOf: today(),
  };
}

/** Pre-submission check used by the review page and by submit(). */
export async function submissionIssues(
  app: Awaited<ReturnType<typeof getOwnApplication>>,
): Promise<{ field: FieldIssue[]; documents: string[] }> {
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  const answers = withDerived(def, app.draftAnswers as Answers, derivedContext(app));
  const field = validateAnswers(def, stripDerived(def, answers), "submit");
  const documents: string[] = [];
  const active = app.documents.filter((d) => !d.removedAt);
  if (def.uploads) {
    for (const g of def.uploads)
      if (
        uploadRequired(g, answers) &&
        !active.some((d) => (g.types as readonly string[]).includes(d.documentType))
      )
        documents.push(`${g.title} is required`);
    for (const t of ["PHOTOGRAPH", "SIGNATURE"] as const) {
      const d = active.find((x) => x.documentType === t);
      if (d?.scanStatus === "PENDING")
        documents.push(
          `${DOCUMENT_TYPE_LABELS[t]} is still being checked for malware. Wait a moment and reload this page.`,
        );
      if (d?.scanStatus === "FAILED")
        documents.push(
          `${DOCUMENT_TYPE_LABELS[t]} could not be checked for malware. Remove it and upload it again.`,
        );
    }
  } else if (!active.some((d) => d.documentType === "PHOTOGRAPH"))
    documents.push("Passport size photograph is required (it is printed on the application form)");
  for (const r of app.vacancy.requiredDocuments) {
    if ((INLINE_ENTRY_DOC_TYPES as readonly string[]).includes(r.documentType)) continue;
    if (r.required && !active.some((d) => d.documentType === r.documentType))
      documents.push(`${r.label} is required`);
  }
  for (const d of active)
    if (d.scanStatus === "INFECTED")
      documents.push(`"${d.originalName}" failed the malware scan. Remove it and upload a clean copy.`);
  return { field, documents: [...new Set(documents)] };
}

const rowsIn = (a: Answers, k: string) => (Array.isArray(a[k]) ? (a[k] as TableRow[]) : []);
const strOrNull = (v: unknown) => (v == null || v === "" ? null : String(v));

function extractQualifications(def: FormDefinition, a: Answers) {
  const code = def.code;
  const rows = (k: string) => rowsIn(a, k);
  const s = strOrNull;
  const numVal = (v: unknown) => (v == null || v === "" ? 1 : Number(v) || 1);
  if (def.version >= 2) {
    // Diploma-after-SSLC candidates have no HSC row; their Diploma is a college qualification.
    const levels = a.hscRoute === "DIPLOMA" ? (["sslc"] as const) : (["sslc", "hsc"] as const);
    const school = levels.map((p, i) => ({
      sortOrder: i,
      category: "SCHOOL",
      level: p.toUpperCase(),
      degree: p === "sslc" ? "SSLC" : `HSC${a.hscMajor ? ` (${String(a.hscMajor)})` : ""}`,
      university: s(a[`${p}Board`]),
      board: s(a[`${p}Board`]),
      institution: s(a[`${p}School`]),
      passedOn: s(a[`${p}Year`]),
      score: s(a[`${p}Marks`]),
      modeOfStudy: s(a[`${p}Mode`]),
      attempts: numVal(a[`${p}Attempts`]),
    }));
    const college = rows("collegeQualifications").map((r, i) => ({
      sortOrder: i + 2,
      category: "COLLEGE",
      level: s(r.level),
      degree: String(r.degree ?? ""),
      specialisation: s(r.specialisation),
      university: s(r.university),
      institution: s(r.college),
      passedOn: s(r.monthYear),
      score:
        r.score == null ? null : `${r.score}${String(r.scoreType ?? "").startsWith("CGPA") ? " CGPA" : "%"}`,
      classAwarded: s(r.classAwarded),
      modeOfStudy: s(r.mode),
      attempts: numVal(r.attempts),
    }));
    const phd = ["Awarded", "Thesis submitted", "Pursuing"].includes(String(a.phdStatus))
      ? [
          {
            sortOrder: college.length + 2,
            category: "COLLEGE",
            level: "PHD",
            degree: `Ph.D. (${String(a.phdStatus)})`,
            specialisation: s(a.phdSpecialisation),
            university: s(a.phdUniversity),
            institution: null,
            passedOn: s(a.phdAwardDate),
            modeOfStudy: s(a.phdMode),
            attempts: 1,
          },
        ]
      : [];
    return [...school, ...college, ...phd];
  }
  if (code === "ASSISTANT_PROFESSOR")
    return rows("academicQualifications").map((r, i) => ({
      sortOrder: i,
      level: null,
      degree: String(r.degree ?? ""),
      university: s(r.university),
      institution: s(r.institution),
      passedOn: s(r.monthYearOfPassing),
      class: s(r.class) ?? s(r.classOrMarks),
      cgpaOrMarks: s(r.cgpaOrMarks),
      modeOfStudy: s(r.modeOfStudy),
      attempts: numVal(r.attempts),
    }));
  return rows("educationalQualifications").map((r, i) => ({
    sortOrder: i,
    level: s(r.level),
    degree: String(r.degree ?? ""),
    university: s(r.university),
    institution: s(r.college),
    passedOn: s(r.monthYear),
    class: s(r.class) ?? s(r.classPercent),
    cgpaOrMarks: s(r.cgpaOrMarks),
    modeOfStudy: s(r.modeOfStudy),
    attempts: numVal(r.attempts),
  }));
}

function extractEmployment(def: FormDefinition, a: Answers) {
  const code = def.code;
  const rows = (k: string) => rowsIn(a, k);
  const s = strOrNull;
  if (def.version >= 2)
    return rows("experience").map((r, i) => {
      const current = r.isCurrent === "Yes";
      const d = periodDuration({ from: s(r.from) ?? undefined, to: current ? null : s(r.to) }, today());
      return {
        sortOrder: i,
        designation: String(r.designation ?? ""),
        organisation: String(r.institution ?? ""),
        fromDate: s(r.from),
        toDate: current ? null : s(r.to),
        nature: s(r.nature),
        isCurrent: current,
        scaleOfPay: s(r.scaleOfPay),
        grossSalary: s(r.grossSalary),
        durationMonths: d?.totalMonths ?? null,
      };
    });
  if (code === "ASSISTANT_PROFESSOR")
    return rows("experience").map((r, i) => ({
      sortOrder: i,
      designation: String(r.post ?? ""),
      organisation: String(r.employer ?? ""),
      fromDate: s(r.from),
      toDate: s(r.to),
      nature: s(r.nature),
    }));
  return rows("jobsHeld").map((r, i) => ({
    sortOrder: i,
    designation: String(r.designation ?? ""),
    organisation: String(r.organisation ?? ""),
    fromDate: s(r.from),
    toDate: s(r.to),
    nature: null,
  }));
}

/** Filter fields stored on the revision for the HR dashboard and exports. */
function revisionFilters(def: FormDefinition, a: Answers) {
  const exams = rowsIn(a, "competitiveExams")
    .map((r) => String(r.exam ?? "").trim())
    .filter(Boolean);
  const phdStatus = def.version >= 2 ? strOrNull(a.phdStatus) : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  return {
    phdStatus,
    hasPhd: phdStatus === "Awarded",
    competitiveExams: [...new Set(exams)],
    totalExperienceMonths: def.version >= 2 ? totalDuration(experiencePeriods(a), today()).totalMonths : null,
    journalCount: def.version >= 2 ? rowsIn(a, "journalPapers").length : null,
    conferenceCount: def.version >= 2 ? rowsIn(a, "conferencePapers").length : null,
    hIndex: num(a.hIndex),
  };
}

/** Allocates the next "PSGCT<year><DEPT>_<NNNN>" number inside the submission transaction. */
async function nextReference(tx: Tx, academicYear: string, deptCode: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO department_reference_counters ("academicYear", "departmentCode", value)
    VALUES (${academicYear}, ${deptCode}, 1)
    ON CONFLICT ("academicYear", "departmentCode")
    DO UPDATE SET value = department_reference_counters.value + 1
    RETURNING value`;
  return formatReference(academicYear, deptCode, rows[0]!.value);
}

/** Allocates the next "PSGCT<year>RA_<NNNN>" number for research appointments. */
async function nextResearchReference(tx: Tx, academicYear: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO research_reference_counters ("academicYear", value)
    VALUES (${academicYear}, 1)
    ON CONFLICT ("academicYear")
    DO UPDATE SET value = research_reference_counters.value + 1
    RETURNING value`;
  return formatResearchReference(academicYear, rows[0]!.value);
}

/**
 * Submits the current draft as an immutable revision. All effects happen in one transaction:
 * revision + normalised extracts, reference number, status change + history, bundle-generation
 * job and receipt notification (via the outbox). The row is locked to serialise concurrent
 * submissions; the version check rejects submitting a stale view.
 */
/** Key of the "Place" / "Station" field of the declaration, if the form has one. */
export function declarationPlaceKey(def: FormDefinition): "place" | "station" | null {
  const keys = new Set(allFields(def).map((f) => f.key));
  return keys.has("place") ? "place" : keys.has("station") ? "station" : null;
}

/**
 * Place and date of the declaration, fixed at submission: the place the candidate confirmed on the
 * review page and the date of submission (IST). Both are mandatory on the printed application.
 */
function applyDeclaration(def: FormDefinition, draft: Answers, place: string | undefined): Answers {
  const out: Answers = { ...draft };
  const key = declarationPlaceKey(def);
  if (key && place !== undefined) {
    const p = place.trim();
    if (p.length < 2 || p.length > 100)
      throw new ValidationError("Enter the place (city or town) where you are signing the declaration", {
        place: ["Enter the place, e.g. Coimbatore"],
      });
    out[key] = p;
  }
  const dateField = allFields(def).find((f) => f.key === "declarationDate");
  if (dateField && dateField.kind !== "derived") out.declarationDate = todayIst();
  return out;
}

export async function submit(
  user: SessionUser,
  id: string,
  expectedVersion: number,
  declaration: { place?: string } = {},
) {
  if (!(await getSetting("acceptSubmissions")))
    throw new ConflictError(
      "Submissions are paused by the recruitment office. Your draft is saved; please submit later.",
    );
  const loaded = await getOwnApplication(user, id);
  const declDef = getFormDefinition(loaded.formTemplate.code as FormCode, loaded.formTemplate.version);
  const app = {
    ...loaded,
    draftAnswers: applyDeclaration(declDef, loaded.draftAnswers as Answers, declaration.place),
  };
  const transition = findTransition(app.status as AppStatus, "SUBMITTED", "candidate");
  if (!transition)
    throw new ConflictError(
      `An application with status "${STATUS_LABELS[app.status as AppStatus]}" cannot be submitted`,
    );
  if (app.status === "DRAFT" && !vacancyOpen(app.vacancy))
    throw new ConflictError("The closing date for this vacancy has passed");
  if (app.draftVersion !== expectedVersion)
    throw new ConflictError(
      "Your application changed since you opened this page. Review the latest version before submitting.",
    );
  const problems = await submissionIssues(app);
  if (problems.field.length || problems.documents.length)
    throw new ValidationError("The application is incomplete", problems);

  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  const answers = withDerived(def, app.draftAnswers as Answers, derivedContext(app));
  const academicYear =
    app.vacancy.academicYear && ACADEMIC_YEAR.test(app.vacancy.academicYear)
      ? app.vacancy.academicYear
      : academicYearOf(app.vacancy.opensAt);
  const manifest = app.documents
    .filter((d) => !d.removedAt)
    .map((d) => ({
      documentId: d.id,
      documentType: d.documentType,
      sha256: d.sha256,
      sizeBytes: d.sizeBytes,
      originalName: d.originalName,
    }));

  const result = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; draftVersion: number }[]>`
        SELECT status, "draftVersion" FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
      const row = locked[0];
      if (!row || row.status !== app.status || row.draftVersion !== expectedVersion)
        throw new ConflictError("This application was changed or already submitted in another window.");
      const revisionNo = (await tx.applicationRevision.count({ where: { applicationId: id } })) + 1;
      const revision = await tx.applicationRevision.create({
        data: {
          applicationId: id,
          revisionNo,
          formCode: def.code,
          formVersion: def.version,
          answers: answers as Prisma.InputJsonObject,
          answersSha256: createHash("sha256").update(canonicalJson(answers)).digest("hex"),
          attachmentManifest: manifest,
          candidateName: String(answers.name ?? "").toUpperCase(),
          createdById: user.id,
          ...revisionFilters(def, answers),
          qualifications: { create: extractQualifications(def, answers) },
          employment: { create: extractEmployment(def, answers) },
        },
      });
      const isResearch = app.recruitmentCategory === "RESEARCH" || !app.vacancy.department;
      const referenceNo =
        app.referenceNo ??
        (isResearch
          ? await nextResearchReference(tx, academicYear)
          : await nextReference(tx, academicYear, app.vacancy.department!.code));
      const updated = await tx.application.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          referenceNo,
          submittedAt: new Date(),
          currentRevisionId: revision.id,
          processingStatus: "QUEUED",
          draftAnswers: app.draftAnswers as Prisma.InputJsonObject,
          draftVersion: { increment: 1 },
        },
      });
      await recordStatus(
        tx,
        app,
        app.status,
        "SUBMITTED",
        user.id,
        revisionNo > 1 ? `Resubmitted as revision ${revisionNo}` : null,
      );
      const gen = await tx.generatedDocument.create({
        data: {
          applicationId: id,
          revisionId: revision.id,
          kind: "CONSOLIDATED_BUNDLE",
          version: 1,
          status: "QUEUED",
          requestedById: user.id,
        },
      });
      await enqueueOutbox(tx, { type: "documents.generate", payload: { generatedDocumentId: gen.id } });
      const deptOrSpec =
        app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research Appointment";
      await notify(
        tx,
        user.id,
        "application.submitted",
        `Application received — ${referenceNo}`,
        `Your application for ${app.vacancy.title} (${deptOrSpec}) has been submitted.\n\nApplication reference: ${referenceNo}\nRevision: ${revisionNo}\nSubmitted: ${updated.submittedAt!.toISOString()}\n\nKeep this reference for any correspondence.`,
        { dedupeKey: `${id}:r${revisionNo}` },
      );
      await audit(
        {
          actorId: user.id,
          action: "application.submitted",
          entityType: "application",
          entityId: id,
          metadata: { revisionNo, referenceNo },
        },
        tx,
      );
      return { referenceNo, revisionNo, submittedAt: updated.submittedAt! };
    },
    { isolationLevel: "ReadCommitted", timeout: 20_000 },
  );
  return result;
}

export async function withdraw(user: SessionUser, id: string, reason: string | null) {
  const app = await getOwnApplication(user, id);
  const t = findTransition(app.status as AppStatus, "WITHDRAWN", "candidate");
  if (!t) throw new ConflictError("This application cannot be withdrawn in its current status");
  if (t.reasonRequired && !reason?.trim())
    throw new ValidationError("Please give a reason for withdrawing", { reason: ["Required"] });
  await prisma.$transaction(async (tx) => {
    const res = await tx.application.updateMany({
      where: { id, status: app.status },
      data: { status: "WITHDRAWN" },
    });
    if (res.count !== 1) throw new ConflictError("The application status changed. Please reload.");
    await recordStatus(tx, app, app.status, "WITHDRAWN", user.id, reason?.trim() || null);
    await audit(
      { actorId: user.id, action: "application.withdrawn", entityType: "application", entityId: id },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Staff operations
// ---------------------------------------------------------------------------------------------

/** Loads an application for a staff member, enforcing the record-level scope. */
export async function getStaffApplication(user: SessionUser, id: string) {
  const scope = staffApplicationScope(user);
  if (!scope) throw new ForbiddenError();
  const app = await prisma.application.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      vacancy: {
        include: {
          department: true,
          discipline: true,
          researchSpecialisation: true,
          requiredDocuments: { orderBy: { sortOrder: "asc" } },
        },
      },

      formTemplate: true,
      currentRevision: {
        include: {
          qualifications: { orderBy: { sortOrder: "asc" } },
          employment: { orderBy: { sortOrder: "asc" } },
        },
      },
      documents: { orderBy: { uploadedAt: "asc" } },
      generated: { orderBy: { createdAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      assignments: {
        include: { reviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } } },
      },
      assignedHod: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      positionChanges: { orderBy: { createdAt: "asc" } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: { reviewer: { select: { email: true, profile: { select: { fullName: true } } } } },
      },
    },
  });
  if (!app) throw new NotFoundError("Application");
  return app;
}

/** HR status transition with permission, scope, precondition and reason checks. */
export async function transition(
  user: SessionUser,
  id: string,
  to: AppStatus,
  reason: string | null,
  ip?: string,
) {
  const scope = hrScope(user);
  if (!scope) throw new ForbiddenError();
  const app = await prisma.application.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      vacancy: true,
      reviews: { select: { stage: true } },
      positionChanges: { select: { status: true } },
    },
  });
  if (!app) throw new NotFoundError("Application");
  const t = findTransition(app.status as AppStatus, to, "hr", app.recruitmentCategory as RecruitmentCategory);
  if (!t)
    throw new ConflictError(
      `Cannot move from "${STATUS_LABELS[app.status as AppStatus]}" to "${STATUS_LABELS[to]}"`,
    );
  if (t.reasonRequired && !reason?.trim())
    throw new ValidationError("A reason is required for this decision", { reason: ["Required"] });
  if (t.requires === "documentsReady" && app.processingStatus !== "READY")
    throw new ConflictError(
      "The consolidated PDF must be generated successfully before forwarding to the department",
    );
  if (t.requires === "departmentReview" && !app.reviews.some((r) => r.stage === "DEPARTMENT"))
    throw new ConflictError("At least one department review must be recorded first");
  if (t.requires === "positionDecided" && app.positionChanges.some((p) => p.status === "PENDING"))
    throw new ConflictError("Approve or reject the position-change recommendation first");
  await prisma.$transaction(async (tx) => {
    const res = await tx.application.updateMany({ where: { id, status: app.status }, data: { status: to } });
    if (res.count !== 1) throw new ConflictError("The application status changed. Please reload.");
    await recordStatus(tx, app, app.status, to, user.id, reason?.trim() || null);
    await audit(
      {
        actorId: user.id,
        action: "application.status_changed",
        entityType: "application",
        entityId: id,
        ip,
        metadata: { from: app.status, to },
      },
      tx,
    );
    if (["NEEDS_CLARIFICATION", "SHORTLISTED", "REJECTED", "APPROVED"].includes(to)) {
      const body =
        to === "NEEDS_CLARIFICATION"
          ? `The recruitment office has requested clarification on your application ${app.referenceNo}.\n\nMessage: ${reason?.trim()}\n\nSign in to update and resubmit your application.`
          : `The status of your application ${app.referenceNo} has been updated to: ${STATUS_LABELS[to]}.\n\nSign in to the recruitment portal for details.`;
      // Notification text never includes candidate details beyond the reference number.
      await notify(
        tx,
        app.candidateId,
        `application.${to.toLowerCase()}`,
        `Application ${app.referenceNo}: status update`,
        body,
      );
    }
    if (to === "NEEDS_CLARIFICATION") {
      // Re-open editing from the submitted revision; the revision itself stays immutable.
      const rev = await tx.applicationRevision.findUniqueOrThrow({ where: { id: app.currentRevisionId! } });
      await tx.application.update({
        where: { id },
        data: { draftAnswers: rev.answers as Prisma.InputJsonObject, draftVersion: { increment: 1 } },
      });
    }
  });
}

/** Update confidential internal review note recorded by HR (not visible to candidates). */
export async function updateInternalNote(
  user: SessionUser,
  id: string,
  internalNote: string | null,
  ip?: string,
) {
  const scope = hrScope(user);
  if (!scope) throw new ForbiddenError();
  const app = await prisma.application.findFirst({
    where: { AND: [{ id }, scope] },
  });
  if (!app) throw new NotFoundError("Application");
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: { internalNote: internalNote?.trim() || null },
    });
    await audit(
      {
        actorId: user.id,
        action: "application.note_updated",
        entityType: "application",
        entityId: id,
        ip,
        metadata: { hasNote: !!internalNote?.trim() },
      },
      tx,
    );
  });
}
