import { createHash } from "node:crypto";
import { Prisma, type Application, type ApplicationStatus } from "@prisma/client";
import { audit } from "~/modules/audit/audit.server";
import { hasRole } from "~/modules/auth/permissions";
import { hrScope, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma, type Tx } from "~/modules/core/db.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode, TableRow } from "~/modules/forms/types";
import { stripDerived, validateAnswers, withDerived, type FieldIssue } from "~/modules/forms/validation";
import { INLINE_ENTRY_DOC_TYPES } from "~/modules/documents/policy";
import { enqueueOutbox, notify } from "~/modules/notifications/outbox.server";
import { EDITABLE, findTransition, STATUS_LABELS, type AppStatus } from "./workflow";

const today = () => new Date().toISOString().slice(0, 10);

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
        data: { candidateId: user.id, vacancyId, formTemplateId: vacancy.formTemplateId, draftAnswers: {} },
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
          cycle: true,
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
    include: { vacancy: { include: { department: true } } },
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

/** Pre-submission check used by the review page and by submit(). */
export async function submissionIssues(
  app: Awaited<ReturnType<typeof getOwnApplication>>,
): Promise<{ field: FieldIssue[]; documents: string[] }> {
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  const answers = withDerived(def, app.draftAnswers as Answers, {
    department: app.vacancy.department.name,
    asOf: today(),
  });
  const field = validateAnswers(def, stripDerived(def, answers), "submit");
  const documents: string[] = [];
  const active = app.documents.filter((d) => !d.removedAt);
  if (!active.some((d) => d.documentType === "PHOTOGRAPH"))
    documents.push("Passport size photograph is required (it is printed on the application form)");
  for (const r of app.vacancy.requiredDocuments) {
    if ((INLINE_ENTRY_DOC_TYPES as readonly string[]).includes(r.documentType)) continue;
    if (r.required && !active.some((d) => d.documentType === r.documentType))
      documents.push(`${r.label} is required`);
  }
  for (const d of active)
    if (d.scanStatus === "INFECTED")
      documents.push(`"${d.originalName}" failed the malware scan. Remove it and upload a clean copy.`);
  return { field, documents };
}

function extractQualifications(code: FormCode, a: Answers) {
  const rows = (k: string) => (Array.isArray(a[k]) ? (a[k] as TableRow[]) : []);
  const s = (v: unknown) => (v == null || v === "" ? null : String(v));
  const numVal = (v: unknown) => (v == null || v === "" ? 1 : Number(v) || 1);
  if (code === "ASSISTANT_PROFESSOR")
    return rows("academicQualifications").map((r, i) => ({
      sortOrder: i,
      level: null,
      degree: String(r.degree ?? ""),
      university: s(r.university),
      institution: s(r.institution),
      passedOn: s(r.monthYearOfPassing),
      attempts: numVal(r.attempts),
    }));
  return rows("educationalQualifications").map((r, i) => ({
    sortOrder: i,
    level: s(r.level),
    degree: String(r.degree ?? ""),
    university: s(r.university),
    institution: s(r.college),
    passedOn: s(r.monthYear),
    attempts: numVal(r.attempts),
  }));
}

function extractEmployment(code: FormCode, a: Answers) {
  const rows = (k: string) => (Array.isArray(a[k]) ? (a[k] as TableRow[]) : []);
  const s = (v: unknown) => (v == null || v === "" ? null : String(v));
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

async function nextReference(tx: Tx): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO reference_counters (year, value) VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET value = reference_counters.value + 1
    RETURNING value`;
  return `PSGTECH-${year}-${String(rows[0]!.value).padStart(6, "0")}`;
}

/**
 * Submits the current draft as an immutable revision. All effects happen in one transaction:
 * revision + normalised extracts, reference number, status change + history, bundle-generation
 * job and receipt notification (via the outbox). The row is locked to serialise concurrent
 * submissions; the version check rejects submitting a stale view.
 */
export async function submit(user: SessionUser, id: string, expectedVersion: number) {
  const app = await getOwnApplication(user, id);
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
  const answers = withDerived(def, app.draftAnswers as Answers, {
    department: app.vacancy.department.name,
    asOf: today(),
  });
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
          qualifications: { create: extractQualifications(def.code, answers) },
          employment: { create: extractEmployment(def.code, answers) },
        },
      });
      const referenceNo = app.referenceNo ?? (await nextReference(tx));
      const updated = await tx.application.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          referenceNo,
          submittedAt: new Date(),
          currentRevisionId: revision.id,
          processingStatus: "QUEUED",
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
      await notify(
        tx,
        user.id,
        "application.submitted",
        `Application received — ${referenceNo}`,
        `Your application for ${app.vacancy.title} (${app.vacancy.department.name}) has been submitted.\n\nApplication reference: ${referenceNo}\nRevision: ${revisionNo}\nSubmitted: ${updated.submittedAt!.toISOString()}\n\nKeep this reference for any correspondence.`,
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
          cycle: true,
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
    include: { vacancy: true, reviews: { select: { stage: true } } },
  });
  if (!app) throw new NotFoundError("Application");
  const t = findTransition(app.status as AppStatus, to, "hr");
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
