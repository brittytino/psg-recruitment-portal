import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hashPassword } from "~/modules/auth/password.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";

/**
 * External advisors, managed by the Super Admin and HR – N4 Section. An advisor signs in with the
 * usual e-mail code and can only read applications whose HOD review is complete and record an
 * advisory opinion. Nobody else's roles can be changed from here.
 */
const requireManager = (u: SessionUser | null) => requirePermission(u, "advisor:manage");

export async function listAdvisors(actor: SessionUser | null) {
  requireManager(actor);
  const rows = await prisma.user.findMany({
    where: { roles: { some: { role: "ADVISOR" } } },
    orderBy: { email: "asc" },
    take: 500,
    select: {
      id: true,
      email: true,
      status: true,
      lastLoginAt: true,
      profile: { select: { fullName: true } },
      roles: { select: { role: true, grantedById: true } },
    },
  });
  const granterIds = [
    ...new Set(rows.flatMap((r) => r.roles.map((x) => x.grantedById).filter((x): x is string => !!x))),
  ];
  const granters = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: granterIds } },
        select: { id: true, email: true, profile: { select: { fullName: true } } },
      })
    ).map((g) => [g.id, g.profile?.fullName ?? g.email]),
  );
  return rows.map((r) => {
    const grant = r.roles.find((x) => x.role === "ADVISOR");
    return {
      id: r.id,
      email: r.email,
      name: r.profile?.fullName ?? r.email,
      active: r.status === "ACTIVE",
      lastLoginAt: r.lastLoginAt,
      grantedBy: grant?.grantedById ? (granters.get(grant.grantedById) ?? null) : null,
    };
  });
}

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254),
  fullName: z.string().trim().min(2, "Enter the advisor's name").max(120),
});

export async function addAdvisor(actor: SessionUser | null, input: unknown) {
  const a = requireManager(actor);
  const p = addSchema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const { email, fullName } = p.data;
  const existing = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  if (existing?.roles.some((r) => r.role === "CANDIDATE"))
    throw new ConflictError(
      "This e-mail address belongs to a candidate. Use a different (official) address.",
    );
  if (existing?.roles.some((r) => r.role === "ADVISOR"))
    throw new ConflictError("This person is already an external advisor.");
  if (existing && existing.roles.length)
    throw new ConflictError(
      "This person already has a staff role. Advisor access is granted to external people only.",
    );

  await prisma.$transaction(async (tx) => {
    const u =
      existing ??
      (await tx.user.create({
        data: {
          email,
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
          emailVerifiedAt: new Date(),
          profile: { create: { fullName, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
        },
      }));
    if (existing && existing.status !== "ACTIVE")
      await tx.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
    await tx.userRole.create({ data: { userId: u.id, role: "ADVISOR", grantedById: a.id } });
    await notify(
      tx,
      u.id,
      "account.staff_invite",
      "Advisory access — PSG Tech Recruitment",
      `You have been invited as an external advisor on the PSG College of Technology recruitment office.\n\nAfter the HOD review, you read each applicant's application and documents and record an advisory opinion with a rating.\n\nSign in with this e-mail address:\n${env().APP_ORIGIN}/login\n\nA 6-digit code is sent to this address each time you sign in. No password is needed.`,
      { dedupeKey: `advisor:${u.id}:${Date.now()}` },
    );
    await audit(
      {
        actorId: a.id,
        action: "user.advisor_added",
        entityType: "user",
        entityId: u.id,
        metadata: { role: "ADVISOR" },
      },
      tx,
    );
  });
}

/** Removes advisory access and signs the person out everywhere. */
export async function removeAdvisor(actor: SessionUser | null, userId: string) {
  const a = requireManager(actor);
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError("Advisor");
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!u || !u.roles.some((r) => r.role === "ADVISOR")) throw new NotFoundError("Advisor");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId, role: "ADVISOR" } });
    // With no role left the account is disabled, so it cannot sign in at all.
    if (u.roles.length === 1) await tx.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(
      {
        actorId: a.id,
        action: "user.advisor_removed",
        entityType: "user",
        entityId: userId,
        metadata: { role: "ADVISOR" },
      },
      tx,
    );
  });
}
