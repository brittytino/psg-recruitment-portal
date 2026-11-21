import type { Position, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { advisoryApplicationScope, requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { NotFoundError, ValidationError } from "~/modules/core/errors";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "~/modules/reporting/constants";

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

export type AdvisoryTab = "awaiting" | "reviewed" | "all";
const TABS: readonly AdvisoryTab[] = ["awaiting", "reviewed", "all"];

export interface AdvisoryListFilters {
  tab?: AdvisoryTab;
  departmentId?: string;
  position?: string;
  search?: string;
}

export interface AdvisoryListQuery extends Required<AdvisoryListFilters> {
  page: number;
  size: number;
}

/** Reads the list/detail filter query params the same way everywhere (list page, detail page, export). */
export function parseAdvisoryFilters(params: URLSearchParams): AdvisoryListQuery {
  const rawTab = params.get("tab")?.trim() ?? "";
  const page = Math.max(1, Math.trunc(Number(params.get("page")) || 1));
  const rawSize = Number(params.get("size"));
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  return {
    tab: (TABS as readonly string[]).includes(rawTab) ? (rawTab as AdvisoryTab) : "awaiting",
    departmentId: params.get("department")?.trim() ?? "",
    position: params.get("position")?.trim() ?? "",
    search: params.get("q")?.trim() ?? "",
    page,
    size,
  };
}

const notYetReviewed = (reviewerId: string): Prisma.ApplicationWhereInput => ({
  reviews: { none: { stage: "ADVISORY", reviewerId } },
});
const alreadyReviewed = (reviewerId: string): Prisma.ApplicationWhereInput => ({
  reviews: { some: { stage: "ADVISORY", reviewerId } },
});

/** The filtered `where` clause shared by the list, the queue (prev/next) and the counts. */
function advisoryWhere(reviewerId: string, filters: AdvisoryListFilters): Prisma.ApplicationWhereInput {
  const andClauses: Prisma.ApplicationWhereInput[] = [advisoryApplicationScope()];
  const tab = filters.tab ?? "awaiting";
  if (tab === "awaiting") andClauses.push(notYetReviewed(reviewerId));
  else if (tab === "reviewed") andClauses.push(alreadyReviewed(reviewerId));

  if (filters.departmentId) andClauses.push({ departmentId: filters.departmentId });

  if (
    filters.position &&
    (filters.position === "ASSISTANT_PROFESSOR" ||
      filters.position === "ASSOCIATE_PROFESSOR" ||
      filters.position === "PROFESSOR")
  ) {
    const positionEnum = filters.position as Position;
    andClauses.push({
      OR: [{ appliedPosition: positionEnum }, { appliedPosition: null, vacancy: { position: positionEnum } }],
    });
  }

  if (filters.search) {
    const search = filters.search;
    andClauses.push({
      OR: [
        { referenceNo: { contains: search, mode: "insensitive" } },
        { currentRevision: { candidateName: { contains: search, mode: "insensitive" } } },
        {
          currentRevision: {
            qualifications: { some: { degree: { contains: search, mode: "insensitive" } } },
          },
        },
      ],
    });
  }

  return { AND: andClauses };
}

/** Oldest-first while clearing the queue (nothing goes stale); newest-first once it's a record. */
function advisoryOrderBy(tab: AdvisoryTab | undefined): Prisma.ApplicationOrderByWithRelationInput[] {
  return tab === "awaiting" ? [{ submittedAt: "asc" }] : [{ submittedAt: "desc" }];
}

/**
 * Applications in the advisor's scope (every HOD-reviewed applicant, every department), filtered
 * and searched like the HOD's own review list, with summary counts and the department list for the
 * filter form.
 */
export async function advisoryApplicationList(
  user: SessionUser,
  filters: AdvisoryListFilters = {},
  page = 1,
  size: number = DEFAULT_PAGE_SIZE,
) {
  const u = requirePermission(user, "advisory:review");
  const baseScope = advisoryApplicationScope();
  const where = advisoryWhere(u.id, filters);

  const [total, awaiting, reviewed, filteredTotal, departmentRecords] = await Promise.all([
    prisma.application.count({ where: baseScope }),
    prisma.application.count({ where: { AND: [baseScope, notYetReviewed(u.id)] } }),
    prisma.application.count({ where: { AND: [baseScope, alreadyReviewed(u.id)] } }),
    // Matches the department / position / search filters too, for correct pagination math.
    prisma.application.count({ where }),
    prisma.department.findMany({
      where: { applications: { some: baseScope } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(filteredTotal / size));
  const safePage = Math.min(page, pages);

  const apps = await prisma.application.findMany({
    where,
    orderBy: advisoryOrderBy(filters.tab),
    skip: (safePage - 1) * size,
    take: size,
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      submittedAt: true,
      hodDecision: true,
      hodRating: true,
      vacancy: {
        select: {
          position: true,
          researchPositionTitle: true,
          department: { select: { id: true, name: true } },
          researchSpecialisation: { select: { name: true } },
        },
      },
      currentRevision: {
        select: {
          candidateName: true,
          phdStatus: true,
          totalExperienceMonths: true,
          journalCount: true,
          hIndex: true,
          qualifications: {
            where: { category: "COLLEGE" },
            orderBy: { sortOrder: "desc" },
            take: 1,
            select: { degree: true },
          },
        },
      },
      reviews: {
        where: { stage: "ADVISORY", reviewerId: u.id },
        select: { recommendation: true, score: true, createdAt: true },
        take: 1,
      },
    },
  });

  return {
    apps: apps.map((a) => {
      const r = a.currentRevision;
      return {
        id: a.id,
        referenceNo: a.referenceNo,
        status: a.status,
        submittedAt: a.submittedAt,
        appliedPosition: a.appliedPosition ?? a.vacancy.position ?? null,
        departmentId: a.vacancy.department?.id ?? null,
        department: a.vacancy.department?.name ?? a.vacancy.researchSpecialisation?.name ?? "Research",
        hodDecision: a.hodDecision,
        hodRating: a.hodRating,
        candidateName: r?.candidateName ?? null,
        phdStatus: r?.phdStatus ?? null,
        degree: r?.qualifications[0]?.degree ?? null,
        experienceMonths: r?.totalExperienceMonths ?? null,
        journalCount: r?.journalCount ?? null,
        hIndex: r?.hIndex ?? null,
        myOpinion: a.reviews[0]
          ? {
              recommendation: a.reviews[0].recommendation,
              rating: a.reviews[0].score,
              recordedAt: a.reviews[0].createdAt,
            }
          : null,
      };
    }),
    departments: departmentRecords,
    counts: { total, awaiting, reviewed },
    pagination: { page: safePage, size, total: filteredTotal, pages },
  };
}

/**
 * The same filtered, ordered id list as the list page, for "N of M in this queue" and the
 * previous / next buttons on the detail page. Kept in exact sync with advisoryApplicationList's
 * where clause and ordering.
 */
export async function advisoryQueueIds(
  user: SessionUser,
  filters: AdvisoryListFilters = {},
): Promise<string[]> {
  const u = requirePermission(user, "advisory:review");
  const rows = await prisma.application.findMany({
    where: advisoryWhere(u.id, filters),
    orderBy: advisoryOrderBy(filters.tab),
    take: 500,
    select: { id: true },
  });
  return rows.map((r) => r.id);
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

/** Every opinion this advisor has recorded, for her own CSV export (a report she can submit). */
export async function advisoryMyReviews(user: SessionUser) {
  const u = requirePermission(user, "advisory:review");
  const rows = await prisma.review.findMany({
    where: { stage: "ADVISORY", reviewerId: u.id },
    orderBy: { createdAt: "desc" },
    select: {
      recommendation: true,
      score: true,
      comments: true,
      createdAt: true,
      application: {
        select: {
          referenceNo: true,
          appliedPosition: true,
          status: true,
          hodDecision: true,
          hodRating: true,
          vacancy: {
            select: {
              position: true,
              department: { select: { name: true } },
              researchSpecialisation: { select: { name: true } },
            },
          },
          currentRevision: { select: { candidateName: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    referenceNo: r.application.referenceNo,
    candidateName: r.application.currentRevision?.candidateName ?? "",
    department:
      r.application.vacancy.department?.name ??
      r.application.vacancy.researchSpecialisation?.name ??
      "Research",
    appliedPosition: r.application.appliedPosition ?? r.application.vacancy.position ?? null,
    status: r.application.status,
    hodDecision: r.application.hodDecision,
    hodRating: r.application.hodRating,
    recommendation: r.recommendation,
    rating: r.score,
    comments: r.comments,
    recordedAt: r.createdAt,
  }));
}
