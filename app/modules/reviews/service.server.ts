import type { Position, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hodDepartments, isAdmin, isHrOfficer } from "~/modules/auth/permissions";
import { hrScope, requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma, type Tx } from "~/modules/core/db.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";
import { getSetting } from "~/modules/settings/service.server";
import { POSITION_LABELS } from "~/lib/labels";
import { academicYearOf, ACADEMIC_YEAR } from "~/modules/applications/reference";
import { ASSIGNABLE, HOD_STAGE, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { isAllowedChange } from "./position-policy";

const fieldErrors = (e: z.ZodError) => z.flattenError(e).fieldErrors;

/** Academic year of a vacancy: its own value when set, otherwise derived from the opening date. */
export const vacancyYear = (v: { academicYear: string | null; opensAt: Date }) =>
  v.academicYear && ACADEMIC_YEAR.test(v.academicYear) ? v.academicYear : academicYearOf(v.opensAt);

async function history(
  tx: Tx,
  applicationId: string,
  from: AppStatus,
  to: AppStatus,
  actorId: string,
  reason: string | null,
) {
  await tx.applicationStatusHistory.create({
    data: { applicationId, fromStatus: from, toStatus: to, actorId, reason },
  });
}

// ------------------------------------------------------------------------------------------------
// Assignment to HODs (Admin and HR)
// ------------------------------------------------------------------------------------------------

const assignSchema = z.object({
  hodId: z.string().uuid("Choose a HOD"),
  applicationIds: z.array(z.string().uuid()).min(1, "Select at least one application").max(500),
});

/**
 * Moves applications of one department to a HOD of that department, in one transaction. Each
 * application gets a status-history entry and an audit event; the HOD receives one e-mail.
 */
export async function assignToHod(user: SessionUser | null, input: unknown, ip?: string) {
  const u = requirePermission(user, "application:assign");
  const p = assignSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const { hodId, applicationIds } = p.data;
  const scope = hrScope(u);
  if (!scope) throw new ForbiddenError();
  const hod = await prisma.user.findFirst({
    where: { id: hodId, status: "ACTIVE", roles: { some: { role: "HOD" } } },
    include: { roles: true },
  });
  if (!hod) throw new ValidationError("This person is not an active HOD");
  const hodDepts = new Set(hod.roles.filter((r) => r.role === "HOD").map((r) => r.departmentId));
  const apps = await prisma.application.findMany({
    where: { AND: [{ id: { in: applicationIds } }, scope] },
    include: { vacancy: { select: { departmentId: true, recruitmentCategory: true } } },
  });
  if (apps.length !== applicationIds.length) throw new NotFoundError("Application");
  for (const a of apps) {
    if (
      a.vacancy.recruitmentCategory === "RESEARCH" ||
      !a.vacancy.departmentId ||
      !hodDepts.has(a.vacancy.departmentId)
    )
      throw new ValidationError(
        `${a.referenceNo} is a research application or belongs to a department this HOD does not review`,
      );
    if (!ASSIGNABLE.includes(a.status as AppStatus))
      throw new ConflictError(
        `${a.referenceNo} is “${STATUS_LABELS[a.status as AppStatus]}” and cannot be moved to a HOD`,
      );
  }
  await prisma.$transaction(async (tx) => {
    for (const a of apps) {
      const res = await tx.application.updateMany({
        where: { id: a.id, status: a.status },
        data: {
          status: "ASSIGNED_TO_HOD",
          assignedHodId: hodId,
          assignedAt: new Date(),
          hodDecision: null,
          hodDecisionReason: null,
          hodRemarks: null,
          hodDecidedAt: null,
        },
      });
      if (res.count !== 1)
        throw new ConflictError(`${a.referenceNo} changed meanwhile. Reload and try again.`);
      await tx.reviewAssignment.upsert({
        where: {
          applicationId_reviewerId_stage: { applicationId: a.id, reviewerId: hodId, stage: "DEPARTMENT" },
        },
        create: { applicationId: a.id, reviewerId: hodId, stage: "DEPARTMENT", assignedById: u.id },
        update: { completedAt: null },
      });
      await history(tx, a.id, a.status as AppStatus, "ASSIGNED_TO_HOD", u.id, null);
      await audit(
        {
          actorId: u.id,
          action: "application.assigned_to_hod",
          entityType: "application",
          entityId: a.id,
          ip,
          metadata: { hodId },
        },
        tx,
      );
    }
    await notify(
      tx,
      hodId,
      "review.assigned",
      `${apps.length} application${apps.length === 1 ? "" : "s"} assigned for your review`,
      `${apps.length} application${apps.length === 1 ? " has" : "s have"} been assigned to you for department review on the PSG Tech Staff Recruitment Portal.\n\nSign in to review them: accept, recommend a position change or reject, then generate and approve your department summary sheet.`,
    );
  });
  return apps.length;
}

/** Takes an application back from its HOD (before the HOD decides or after Admin reopens). */
export async function unassign(user: SessionUser | null, applicationId: string, reason: string, ip?: string) {
  const u = requirePermission(user, "application:assign");
  if (reason.trim().length < 5) throw new ValidationError("Give a reason (at least 5 characters)");
  const scope = hrScope(u);
  const app =
    scope && (await prisma.application.findFirst({ where: { AND: [{ id: applicationId }, scope] } }));
  if (!app) throw new NotFoundError("Application");
  if (app.status !== "ASSIGNED_TO_HOD")
    throw new ConflictError("Only applications awaiting the HOD can be taken back");
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: { status: "SUBMITTED", assignedHodId: null, assignedAt: null },
    });
    await history(tx, app.id, "ASSIGNED_TO_HOD", "SUBMITTED", u.id, reason.trim());
    await audit(
      { actorId: u.id, action: "application.unassigned", entityType: "application", entityId: app.id, ip },
      tx,
    );
  });
}

// ------------------------------------------------------------------------------------------------
// HOD decisions
// ------------------------------------------------------------------------------------------------

/** Applications a HOD can see: assigned to them and in one of their departments. */
export function hodScope(user: SessionUser): Prisma.ApplicationWhereInput {
  return {
    assignedHodId: user.id,
    vacancy: { departmentId: { in: hodDepartments(user.grants) } },
    status: { in: [...HOD_STAGE, "SHORTLISTED", "REJECTED", "APPROVED", "WITHDRAWN"] },
  };
}

const decisionSchema = z
  .object({
    decision: z.enum(["ACCEPT", "RECOMMEND_CHANGE", "REJECT"], { error: "Choose a decision" }),
    toPosition: z
      .enum(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"])
      .optional()
      .or(z.literal("").transform(() => undefined)),
    reason: z.string().trim().max(3000).default(""),
    remarks: z.string().trim().max(3000).default(""),
  })
  .refine((d) => d.decision === "ACCEPT" || d.reason.length >= 10, {
    path: ["reason"],
    message: "Give the reason (at least 10 characters)",
  })
  .refine((d) => d.decision !== "RECOMMEND_CHANGE" || !!d.toPosition, {
    path: ["toPosition"],
    message: "Choose the recommended position",
  });

/** True when the application is part of the department's current approved summary sheet. */
async function lockedBySummary(tx: Tx, applicationId: string, departmentId: string | null) {
  if (!departmentId) return false;
  const sheet = await tx.summarySheet.findFirst({
    where: { departmentId, status: "APPROVED" },
    orderBy: { version: "desc" },
    select: { rows: true },
  });
  return (
    !!sheet && (sheet.rows as { applicationId: string }[]).some((r) => r.applicationId === applicationId)
  );
}

export async function recordHodDecision(
  user: SessionUser | null,
  applicationId: string,
  input: unknown,
  ip?: string,
) {
  const u = requirePermission(user, "review:record");
  const p = decisionSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", fieldErrors(p.error));
  const d = p.data;
  const app = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, hodScope(u)] },
    include: { vacancy: true },
  });
  if (!app) throw new NotFoundError("Application");
  if (!HOD_STAGE.includes(app.status as AppStatus))
    throw new ConflictError("This application is no longer with the department for review");
  const applied = (app.appliedPosition ?? app.vacancy.position) as Position;
  if (d.decision === "RECOMMEND_CHANGE" && !isAllowedChange(applied, d.toPosition!))
    throw new ValidationError(
      `A ${POSITION_LABELS[applied]} application can only be recommended for a lower position`,
      { toPosition: ["Not allowed by the recruitment policy"] },
    );
  const to: AppStatus =
    d.decision === "ACCEPT"
      ? "HOD_ACCEPTED"
      : d.decision === "REJECT"
        ? "HOD_REJECTED"
        : "HOD_RECOMMENDED_CHANGE";
  await prisma.$transaction(async (tx) => {
    if (await lockedBySummary(tx, app.id, app.vacancy.departmentId))
      throw new ConflictError(
        "Your approved summary sheet includes this application. Ask the Admin to reopen the sheet before changing the decision.",
      );
    const res = await tx.application.updateMany({
      where: { id: app.id, status: app.status },
      data: {
        status: to,
        hodDecision: d.decision,
        hodDecisionReason: d.reason || null,
        hodRemarks: d.remarks || null,
        hodDecidedAt: new Date(),
      },
    });
    if (res.count !== 1) throw new ConflictError("The application changed meanwhile. Reload and try again.");
    // Any earlier open recommendation is closed by the new decision.
    await tx.positionChangeRequest.updateMany({
      where: { applicationId: app.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: u.id,
        decidedAt: new Date(),
        decisionNote: "Superseded by a new HOD decision",
      },
    });
    if (d.decision === "RECOMMEND_CHANGE")
      await tx.positionChangeRequest.create({
        data: {
          applicationId: app.id,
          fromPosition: applied,
          toPosition: d.toPosition!,
          reason: d.reason,
          requestedById: u.id,
        },
      });
    await tx.review.create({
      data: {
        applicationId: app.id,
        reviewerId: u.id,
        stage: "DEPARTMENT",
        recommendation: d.decision === "REJECT" ? "REJECT" : d.decision === "ACCEPT" ? "APPROVE" : "HOLD",
        comments:
          [
            d.decision === "RECOMMEND_CHANGE"
              ? `Recommended for ${POSITION_LABELS[d.toPosition!]} instead of ${POSITION_LABELS[applied]}.`
              : d.decision === "ACCEPT"
                ? `Accepted as applied (${POSITION_LABELS[applied]}).`
                : "Rejected.",
            d.reason,
            d.remarks,
          ]
            .filter(Boolean)
            .join("\n") || "—",
      },
    });
    await tx.reviewAssignment.updateMany({
      where: { applicationId: app.id, reviewerId: u.id, stage: "DEPARTMENT" },
      data: { completedAt: new Date() },
    });
    await history(tx, app.id, app.status as AppStatus, to, u.id, d.reason || null);
    await audit(
      {
        actorId: u.id,
        action: "review.hod_decision",
        entityType: "application",
        entityId: app.id,
        ip,
        metadata: { decision: d.decision, toPosition: d.toPosition },
      },
      tx,
    );
  });
}

// ------------------------------------------------------------------------------------------------
// Position-change approval (Admin; HR when enabled in Settings)
// ------------------------------------------------------------------------------------------------

export async function canApprovePositionChange(user: SessionUser): Promise<boolean> {
  if (isAdmin(user.grants)) return true;
  return isHrOfficer(user.grants) && (await getSetting("hrCanApprovePositionChange"));
}

export async function decidePositionChange(
  user: SessionUser | null,
  requestId: string,
  approve: boolean,
  note: string,
  ip?: string,
) {
  if (!user || !(await canApprovePositionChange(user))) throw new ForbiddenError();
  const req = await prisma.positionChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError("Recommendation");
  if (req.status !== "PENDING") throw new ConflictError("This recommendation has already been decided");
  if (!approve && note.trim().length < 5) throw new ValidationError("Give a reason for not approving");
  await prisma.$transaction(async (tx) => {
    const res = await tx.positionChangeRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note.trim() || null,
      },
    });
    if (res.count !== 1) throw new ConflictError("This recommendation has already been decided");
    await tx.application.update({
      where: { id: req.applicationId },
      data: { effectivePosition: approve ? req.toPosition : null },
    });
    await audit(
      {
        actorId: user.id,
        action: approve ? "position_change.approved" : "position_change.rejected",
        entityType: "application",
        entityId: req.applicationId,
        ip,
        metadata: { from: req.fromPosition, to: req.toPosition },
      },
      tx,
    );
  });
}

export async function pendingPositionChanges(user: SessionUser | null) {
  if (!user || !(await canApprovePositionChange(user))) return [];
  return prisma.positionChangeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      application: {
        select: {
          id: true,
          referenceNo: true,
          currentRevision: { select: { candidateName: true } },
          vacancy: { select: { department: { select: { name: true, code: true } } } },
        },
      },
    },
  });
}

// ------------------------------------------------------------------------------------------------
// Department summary sheets
// ------------------------------------------------------------------------------------------------

export interface SummaryRow {
  sNo: number;
  applicationId: string;
  referenceNo: string;
  candidateName: string;
  department: string;
  appliedFor: string;
  recommendedFor: string;
  decision: string;
  reason: string;
  status: string;
}

const DECISION_LABEL: Record<string, string> = {
  ACCEPT: "Accepted as applied",
  RECOMMEND_CHANGE: "Recommended position change",
  REJECT: "Rejected",
};

/** Live summary of a department's assigned applications (preview before approval). */
export async function departmentSummary(departmentId: string) {
  const apps = await prisma.application.findMany({
    where: { departmentId, assignedHodId: { not: null }, status: { not: "DRAFT" } },
    orderBy: [{ referenceNo: "asc" }],
    include: {
      department: { select: { name: true } },
      vacancy: { select: { position: true, academicYear: true, opensAt: true } },
      currentRevision: { select: { candidateName: true } },
      positionChanges: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const pending = apps.filter((a) => a.status === "ASSIGNED_TO_HOD");
  const rows: SummaryRow[] = apps.map((a, i) => {
    const applied = (a.appliedPosition ?? a.vacancy.position) as string;
    const pc = a.positionChanges[0];
    return {
      sNo: i + 1,
      applicationId: a.id,
      referenceNo: a.referenceNo ?? "",
      candidateName: a.currentRevision?.candidateName ?? "",
      department: a.department?.name ?? "",
      appliedFor: POSITION_LABELS[applied] ?? applied,
      recommendedFor:
        a.hodDecision === "RECOMMEND_CHANGE" && pc
          ? `${POSITION_LABELS[pc.toPosition]}${pc.status === "PENDING" ? " (awaiting approval)" : pc.status === "APPROVED" ? " (approved)" : " (not approved)"}`
          : a.hodDecision === "ACCEPT"
            ? (POSITION_LABELS[applied] ?? applied)
            : "—",
      decision: a.hodDecision ? DECISION_LABEL[a.hodDecision]! : "Pending",
      reason: [a.hodDecisionReason, a.hodRemarks].filter(Boolean).join(" — "),
      status: STATUS_LABELS[a.status as AppStatus],
    };
  });
  const years = [...new Set(apps.map((a) => vacancyYear(a.vacancy)))];
  return {
    rows,
    pending: pending.map((a) => a.referenceNo ?? a.id),
    academicYear: years.sort().pop() ?? academicYearOf(new Date()),
  };
}

/** The HOD generates the department summary from their decisions and approves it in one step. */
export async function approveSummarySheet(user: SessionUser | null, departmentId: string, ip?: string) {
  const u = requirePermission(user, "summary:generate");
  if (!hodDepartments(u.grants).includes(departmentId)) throw new ForbiddenError();
  const { rows, pending, academicYear } = await departmentSummary(departmentId);
  if (!rows.length) throw new ConflictError("No applications have been assigned to your department yet");
  if (pending.length)
    throw new ConflictError(`Decide every application first. Still pending: ${pending.join(", ")}`, {
      pending,
    });
  const sheet = await prisma.$transaction(async (tx) => {
    const last = await tx.summarySheet.findFirst({
      where: { departmentId, academicYear },
      orderBy: { version: "desc" },
    });
    await tx.summarySheet.updateMany({
      where: { departmentId, academicYear, status: "APPROVED" },
      data: { status: "SUPERSEDED" },
    });
    const s = await tx.summarySheet.create({
      data: {
        departmentId,
        academicYear,
        version: (last?.version ?? 0) + 1,
        rows: rows as unknown as Prisma.InputJsonArray,
        approvedById: u.id,
      },
      include: { department: true },
    });
    const recipients = await tx.user.findMany({
      where: { status: "ACTIVE", roles: { some: { role: { in: ["ADMIN", "SUPER_ADMIN", "HR"] } } } },
      select: { id: true },
    });
    for (const r of recipients)
      await notify(
        tx,
        r.id,
        "summary.approved",
        `Summary sheet approved — ${s.department.name} (${academicYear})`,
        `The HOD has approved the summary sheet (version ${s.version}) for ${s.department.name}, ${rows.length} application${rows.length === 1 ? "" : "s"}.\n\nSign in to the recruitment portal to view it and export the details.`,
      );
    await audit(
      {
        actorId: u.id,
        action: "summary.approved",
        entityType: "summary_sheet",
        entityId: s.id,
        ip,
        metadata: { departmentId, academicYear, version: s.version, rows: rows.length },
      },
      tx,
    );
    return s;
  });
  return sheet;
}

/** Admin reopens a department's approved sheet so the HOD can change decisions. */
export async function reopenSummarySheet(
  user: SessionUser | null,
  sheetId: string,
  reason: string,
  ip?: string,
) {
  const u = requirePermission(user, "summary:reopen");
  if (reason.trim().length < 5) throw new ValidationError("Give a reason (at least 5 characters)");
  const sheet = await prisma.summarySheet.findUnique({ where: { id: sheetId } });
  if (!sheet || sheet.status !== "APPROVED") throw new NotFoundError("Approved summary sheet");
  await prisma.$transaction(async (tx) => {
    await tx.summarySheet.update({ where: { id: sheetId }, data: { status: "SUPERSEDED" } });
    await audit(
      {
        actorId: u.id,
        action: "summary.reopened",
        entityType: "summary_sheet",
        entityId: sheetId,
        ip,
        metadata: { reason: reason.trim() },
      },
      tx,
    );
  });
}

export async function listSummarySheets(user: SessionUser | null, departmentId?: string) {
  const u = requirePermission(user, "application:list");
  const hodDepts = hodDepartments(u.grants);
  const fullAccess = isAdmin(u.grants) || isHrOfficer(u.grants);
  if (!fullAccess && !hodDepts.length) throw new ForbiddenError();
  return prisma.summarySheet.findMany({
    where: {
      ...(departmentId ? { departmentId } : {}),
      ...(fullAccess ? {} : { departmentId: { in: hodDepts } }),
    },
    orderBy: [{ approvedAt: "desc" }],
    include: { department: { select: { id: true, name: true, code: true } } },
  });
}
