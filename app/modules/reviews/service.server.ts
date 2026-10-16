import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hasPermission } from "~/modules/auth/permissions";
import { hrScope, requirePermission, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";

/** Reviewers eligible for an application's department (for the assignment picker). */
export async function eligibleReviewers(departmentId: string) {
  return prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "DEPARTMENT_REVIEWER", departmentId } } },
    select: { id: true, email: true, profile: { select: { fullName: true } } },
    orderBy: { email: "asc" },
  });
}

/** HR assigns a department reviewer. The reviewer must hold the reviewer role for that department. */
export async function assignReviewer(user: SessionUser | null, applicationId: string, reviewerId: string, ip?: string) {
  const u = requirePermission(user, "application:assign");
  const scope = hrScope(u);
  if (!scope) throw new ForbiddenError();
  const app = await prisma.application.findFirst({ where: { AND: [{ id: applicationId }, scope] }, include: { vacancy: true } });
  if (!app) throw new NotFoundError("Application");
  if (!["UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW"].includes(app.status))
    throw new ConflictError("Reviewers can be assigned during HR screening or department review");
  const eligible = await prisma.userRole.count({ where: { userId: reviewerId, role: "DEPARTMENT_REVIEWER", departmentId: app.vacancy.departmentId, user: { status: "ACTIVE" } } });
  if (!eligible) throw new ValidationError("This person is not a reviewer for the application's department");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reviewAssignment.create({ data: { applicationId, reviewerId, stage: "DEPARTMENT", assignedById: u.id } });
      await audit({ actorId: u.id, action: "review.assigned", entityType: "application", entityId: applicationId, ip, metadata: { reviewerId } }, tx);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictError("This reviewer is already assigned");
    throw e;
  }
}

const reviewSchema = z.object({
  recommendation: z.enum(["SHORTLIST", "REJECT", "HOLD", "NEEDS_CLARIFICATION", "APPROVE"]),
  score: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).transform((v) => (v === "" ? null : v)),
  comments: z.string().trim().min(10, "Please give at least a short justification (10+ characters)").max(5000),
});

/**
 * Records a review. Department reviewers may review only applications assigned to them that are
 * under department review; HR officers record HR-stage screening notes on applications in scope.
 */
export async function recordReview(user: SessionUser | null, applicationId: string, input: unknown, ip?: string) {
  if (!user) throw new ForbiddenError();
  const p = reviewSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const scope = staffApplicationScope(user);
  const app = scope && (await prisma.application.findFirst({ where: { AND: [{ id: applicationId }, scope] }, include: { assignments: true } }));
  if (!app) throw new NotFoundError("Application");

  let stage: "HR" | "DEPARTMENT";
  let assignmentId: string | null = null;
  const assignment = app.assignments.find((a) => a.reviewerId === user.id && a.stage === "DEPARTMENT");
  if (hasPermission(user.grants, "review:record") && assignment) {
    if (app.status !== "UNDER_DEPARTMENT_REVIEW") throw new ConflictError("Department reviews can be recorded only while the application is under department review");
    stage = "DEPARTMENT";
    assignmentId = assignment.id;
  } else if (hrScope(user) && hasPermission(user.grants, "application:transition")) {
    if (app.status !== "UNDER_HR_REVIEW") throw new ConflictError("HR screening notes can be recorded only during HR screening");
    stage = "HR";
  } else throw new ForbiddenError();

  await prisma.$transaction(async (tx) => {
    await tx.review.create({ data: { applicationId, reviewerId: user.id, assignmentId, stage, ...p.data } });
    if (assignmentId) await tx.reviewAssignment.update({ where: { id: assignmentId }, data: { completedAt: new Date() } });
    await audit({ actorId: user.id, action: "review.recorded", entityType: "application", entityId: applicationId, ip, metadata: { stage, recommendation: p.data.recommendation } }, tx);
  });
}
