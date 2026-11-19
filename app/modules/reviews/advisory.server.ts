import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { advisoryApplicationScope, requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { NotFoundError, ValidationError } from "~/modules/core/errors";

/**
 * External advisor opinion. Advisors read every applicant whose HOD review is complete and record
 * one advisory opinion per application. The opinion is advisory only: it never changes the
 * application status, which stays with the Dean / Principal.
 */

import { ADVISORY_RECOMMENDATIONS } from "./advisory-labels";

const advisorySchema = z.object({
  /** Optional 1–5 star rating, as for the HOD ("" = not rated). */
  rating: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars").optional(),
  ),
  recommendation: z.enum(ADVISORY_RECOMMENDATIONS, { error: "Choose a recommendation" }),
  comments: z
    .string()
    .trim()
    .min(10, "Give your comments (at least 10 characters)")
    .max(3000, "Keep the comments under 3000 characters"),
});

/** Applications in the advisor's scope, with the advisor's own opinion if already recorded. */
export async function advisoryApplicationList(user: SessionUser) {
  requirePermission(user, "advisory:review");
  const apps = await prisma.application.findMany({
    where: advisoryApplicationScope(),
    orderBy: [{ submittedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      submittedAt: true,
      vacancy: {
        select: {
          title: true,
          position: true,
          researchPositionTitle: true,
          department: { select: { name: true, code: true } },
          researchSpecialisation: { select: { name: true } },
        },
      },
      reviews: {
        where: { stage: "ADVISORY", reviewerId: user.id },
        select: { recommendation: true, createdAt: true },
        take: 1,
      },
    },
  });
  return apps.map((a) => ({
    id: a.id,
    referenceNo: a.referenceNo,
    status: a.status,
    submittedAt: a.submittedAt,
    appliedPosition: a.appliedPosition ?? a.vacancy.position ?? null,
    vacancyTitle: a.vacancy.title,
    department: a.vacancy.department?.name ?? a.vacancy.researchSpecialisation?.name ?? "Research",
    myOpinion: a.reviews[0]
      ? { recommendation: a.reviews[0].recommendation, recordedAt: a.reviews[0].createdAt }
      : null,
  }));
}

/** One application for the advisor: its HOD decision and the advisor's own opinion. */
export async function advisoryApplicationDetail(user: SessionUser, applicationId: string) {
  requirePermission(user, "advisory:review");
  const app = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, advisoryApplicationScope()] },
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      submittedAt: true,
      hodDecision: true,
      hodRemarks: true,
      hodRating: true,
      hodDecidedAt: true,
      vacancy: {
        select: {
          title: true,
          position: true,
          researchPositionTitle: true,
          department: { select: { name: true, code: true } },
          researchSpecialisation: { select: { name: true } },
        },
      },
      reviews: {
        where: { stage: "ADVISORY", reviewerId: user.id },
        select: { recommendation: true, comments: true, score: true, createdAt: true },
        take: 1,
      },
    },
  });
  if (!app) throw new NotFoundError("Application");
  return {
    id: app.id,
    referenceNo: app.referenceNo,
    status: app.status,
    submittedAt: app.submittedAt,
    appliedPosition: app.appliedPosition ?? app.vacancy.position ?? null,
    vacancyTitle: app.vacancy.title,
    department: app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research",
    hod: {
      decision: app.hodDecision,
      remarks: app.hodRemarks,
      rating: app.hodRating,
      decidedAt: app.hodDecidedAt,
    },
    myOpinion: app.reviews[0]
      ? {
          recommendation: app.reviews[0].recommendation,
          comments: app.reviews[0].comments,
          rating: app.reviews[0].score,
          recordedAt: app.reviews[0].createdAt,
        }
      : null,
  };
}

/** Records or replaces the advisor's own opinion on an application in scope. Status is unchanged. */
export async function recordAdvisoryReview(
  user: SessionUser | null,
  applicationId: string,
  input: unknown,
  ip?: string,
) {
  const u = requirePermission(user, "advisory:review");
  const p = advisorySchema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const app = await prisma.application.findFirst({
    where: { AND: [{ id: applicationId }, advisoryApplicationScope()] },
    select: { id: true },
  });
  if (!app) throw new NotFoundError("Application");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.review.findFirst({
      where: { applicationId: app.id, reviewerId: u.id, stage: "ADVISORY" },
      select: { id: true },
    });
    if (existing) {
      await tx.review.update({
        where: { id: existing.id },
        data: {
          recommendation: p.data.recommendation,
          comments: p.data.comments,
          score: p.data.rating ?? null,
        },
      });
    } else {
      await tx.review.create({
        data: {
          applicationId: app.id,
          reviewerId: u.id,
          stage: "ADVISORY",
          recommendation: p.data.recommendation,
          comments: p.data.comments,
          score: p.data.rating ?? null,
        },
      });
    }
    await audit(
      {
        actorId: u.id,
        action: "application.advisory_review_recorded",
        entityType: "application",
        entityId: app.id,
        ip,
        metadata: { recommendation: p.data.recommendation, replaced: !!existing },
      },
      tx,
    );
  });
}

/** Advisory opinions on an application, for the recruitment office (Dean / Principal, HR). Read only. */
export async function advisoryOpinionsFor(applicationId: string) {
  const rows = await prisma.review.findMany({
    where: { applicationId, stage: "ADVISORY" },
    orderBy: { createdAt: "asc" },
    select: {
      recommendation: true,
      score: true,
      comments: true,
      createdAt: true,
      reviewer: { select: { email: true, profile: { select: { fullName: true } } } },
    },
  });
  return rows.map((r) => ({
    advisor: r.reviewer.profile?.fullName ?? r.reviewer.email,
    recommendation: r.recommendation,
    rating: r.score,
    comments: r.comments,
    recordedAt: r.createdAt,
  }));
}
