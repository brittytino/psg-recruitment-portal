import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hasPermission } from "~/modules/auth/permissions";
import { hrScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";
import { POSITION_LABELS } from "~/lib/labels";
import type { AppStatus } from "./workflow";

/**
 * Interview call (HR – N4 Section). Faculty applications come back to HR after the HOD's decision
 * (accepted, or position change decided); research applications are screened by HR directly.
 * Sending the call shortlists the application, stores the schedule and e-mails the candidate.
 * Sending again (from Shortlisted) reschedules and e-mails the updated details.
 */
export const INTERVIEW_FROM: readonly AppStatus[] = [
  "HOD_ACCEPTED",
  "HOD_RECOMMENDED_CHANGE",
  "UNDER_HR_REVIEW",
  "SHORTLISTED",
];

const schema = z.object({
  interviewAt: z
    .string()
    .min(1, "Choose the interview date and time")
    .transform((s, ctx) => {
      const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}+05:30` : s);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Invalid date" });
        return z.NEVER;
      }
      if (d.getTime() < Date.now()) {
        ctx.addIssue({ code: "custom", message: "The interview must be in the future" });
        return z.NEVER;
      }
      return d;
    }),
  interviewVenue: z.string().trim().min(3, "Enter the venue or online meeting link").max(300),
  interviewNotes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
});

const ist = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(d) + " (IST)";

export async function inviteForInterview(user: SessionUser, id: string, input: unknown, ip?: string) {
  if (!hasPermission(user.grants, "application:transition")) throw new ForbiddenError();
  const scope = hrScope(user);
  if (!scope) throw new ForbiddenError();
  const p = schema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the interview details", z.flattenError(p.error).fieldErrors);
  const app = await prisma.application.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      vacancy: { include: { department: true, researchSpecialisation: true } },
      positionChanges: { select: { status: true } },
      currentRevision: { select: { candidateName: true } },
    },
  });
  if (!app) throw new NotFoundError("Application");
  const status = app.status as AppStatus;
  if (!INTERVIEW_FROM.includes(status))
    throw new ConflictError(
      app.recruitmentCategory === "FACULTY"
        ? "The interview call is sent after the HOD has accepted the application"
        : "Start HR screening before calling the candidate for interview",
    );
  if (status === "UNDER_HR_REVIEW" && app.recruitmentCategory !== "RESEARCH")
    throw new ConflictError("Faculty applications need the HOD's decision before the interview call");
  if (app.positionChanges.some((c) => c.status === "PENDING"))
    throw new ConflictError("Approve or reject the HOD's position-change recommendation first");

  const v = p.data;
  const position = app.effectivePosition ?? app.appliedPosition;
  const post =
    app.vacancy.researchPositionTitle ?? (position ? POSITION_LABELS[position] : app.vacancy.title);
  const where = app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "";
  const rescheduled = !!app.interviewInvitedAt;
  const body = [
    `Dear ${app.currentRevision?.candidateName ?? "Candidate"},`,
    "",
    rescheduled
      ? `The interview schedule for your application ${app.referenceNo} has been updated.`
      : `We are pleased to inform you that your application ${app.referenceNo} for the post of ${post}${where ? `, ${where}` : ""}, has been shortlisted. You are invited for an interview.`,
    "",
    `Date and time: ${ist(v.interviewAt)}`,
    `Venue / link: ${v.interviewVenue}`,
    ...(v.interviewNotes ? ["", "Instructions:", v.interviewNotes] : []),
    "",
    "Please bring the originals of all certificates and a printed copy of your application.",
    `You can also see these details by signing in at ${env().APP_ORIGIN}/account`,
    "",
    "HR – N4 Section",
    "PSG College of Technology, Coimbatore",
  ].join("\n");

  await prisma.$transaction(async (tx) => {
    const res = await tx.application.updateMany({
      where: { id, status: app.status },
      data: {
        status: "SHORTLISTED",
        interviewAt: v.interviewAt,
        interviewVenue: v.interviewVenue,
        interviewNotes: v.interviewNotes,
        interviewInvitedAt: new Date(),
        interviewInvitedById: user.id,
      },
    });
    if (res.count !== 1) throw new ConflictError("The application status changed. Please reload.");
    if (status !== "SHORTLISTED")
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: app.status,
          toStatus: "SHORTLISTED",
          actorId: user.id,
          reason: `Called for interview on ${ist(v.interviewAt)}`,
        },
      });
    await notify(
      tx,
      app.candidateId,
      "application.interview_call",
      rescheduled
        ? `Interview rescheduled – ${app.referenceNo} | PSG College of Technology`
        : `Call for interview – ${app.referenceNo} | PSG College of Technology`,
      body,
    );
    await audit(
      {
        actorId: user.id,
        action: rescheduled ? "application.interview_rescheduled" : "application.interview_called",
        entityType: "application",
        entityId: id,
        ip,
        metadata: { from: app.status, interviewAt: v.interviewAt.toISOString() },
      },
      tx,
    );
  });
}
