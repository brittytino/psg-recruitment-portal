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
 * Read-only Viewer accounts, managed by the Super Admin and HR – N4 Section. A viewer signs in with
 * the usual e-mail code and can only list and open submitted applications and their documents.
 * Nobody else's roles can be changed from here.
 */
const requireManager = (u: SessionUser | null) => requirePermission(u, "viewer:manage");

export async function listViewers(actor: SessionUser | null) {
  requireManager(actor);
  const rows = await prisma.user.findMany({
    where: { roles: { some: { role: "VIEWER" } } },
    orderBy: { email: "asc" },
    take: 500,
    select: {
      id: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
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
    const grant = r.roles.find((x) => x.role === "VIEWER");
    return {
      id: r.id,
      email: r.email,
      name: r.profile?.fullName ?? r.email,
      active: r.status === "ACTIVE",
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
      // Viewers who also hold another staff role are managed on the Users & roles page.
      otherRoles: r.roles.filter((x) => x.role !== "VIEWER").map((x) => x.role),
      grantedBy: grant?.grantedById ? (granters.get(grant.grantedById) ?? null) : null,
    };
  });
}

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254),
  fullName: z.string().trim().min(2, "Enter the person's name").max(120),
});

export async function addViewer(actor: SessionUser | null, input: unknown) {
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
  if (existing?.roles.some((r) => r.role === "VIEWER"))
    throw new ConflictError("This person is already a viewer.");
  if (existing && existing.roles.length)
    throw new ConflictError("This person already has a staff role; they can already see applications.");

  await prisma.$transaction(async (tx) => {
    const u =
      existing ??
      (await tx.user.create({
        data: {
          email,
          // Sign-in is by e-mail code only; this password is random and never shared.
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
          emailVerifiedAt: new Date(),
          profile: { create: { fullName, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
        },
      }));
    if (existing && existing.status !== "ACTIVE")
      await tx.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
    await tx.userRole.create({ data: { userId: u.id, role: "VIEWER", grantedById: a.id } });
    await notify(
      tx,
      u.id,
      "account.staff_invite",
      "Read-only access — PSG Tech Recruitment",
      `You have been given read-only access to the applications on the PSG College of Technology recruitment site.\n\nSign in with this e-mail address:\n${env().APP_ORIGIN}/login\n\nA 6-digit code is sent to this address each time you sign in. No password is needed.`,
      { dedupeKey: `viewer:${u.id}:${Date.now()}` },
    );
    await audit(
      {
        actorId: a.id,
        action: "user.viewer_added",
        entityType: "user",
        entityId: u.id,
        metadata: { role: "VIEWER" },
      },
      tx,
    );
  });
}

/** Removes viewer access and signs the person out everywhere. */
export async function removeViewer(actor: SessionUser | null, userId: string) {
  const a = requireManager(actor);
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError("User");
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!u || !u.roles.some((r) => r.role === "VIEWER")) throw new NotFoundError("Viewer");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId, role: "VIEWER" } });
    // With no role left the account is disabled, so it cannot sign in at all.
    if (u.roles.length === 1) await tx.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(
      {
        actorId: a.id,
        action: "user.viewer_removed",
        entityType: "user",
        entityId: userId,
        metadata: { role: "VIEWER" },
      },
      tx,
    );
  });
}
