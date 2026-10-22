import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hashPassword } from "~/modules/auth/password.server";
import { hasPermission } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { hashToken } from "~/modules/auth/session.server";
import { prisma, type Tx } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";

import { STAFF_ROLES, type StaffRole } from "~/modules/auth/permissions";

export { STAFF_ROLES, type StaffRole };

function requireUserAdmin(user: SessionUser | null): SessionUser {
  if (!user || !hasPermission(user.grants, "user:manage")) throw new ForbiddenError();
  return user;
}

export async function listStaff(actor: SessionUser | null, q?: string, role?: StaffRole) {
  requireUserAdmin(actor);
  return prisma.user.findMany({
    where: {
      roles: { some: role ? { role } : { role: { not: "CANDIDATE" } } },
      ...(q
        ? {
            OR: [
              { email: { contains: q.toLowerCase() } },
              { profile: { fullName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { email: "asc" },
    take: 300,
    include: { roles: { include: { department: true } }, profile: true },
  });
}

async function activeAdminCount(tx: Tx, excludingUserId?: string) {
  return tx.user.count({
    where: {
      status: "ACTIVE",
      roles: { some: { role: "ADMIN" } },
      ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
    },
  });
}

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(200),
    fullName: z.string().trim().min(2, "Enter the full name").max(120),
    role: z.enum(STAFF_ROLES, { error: "Choose a role" }),
    departmentIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => v.role !== "HOD" || v.departmentIds.length > 0, {
    path: ["departmentIds"],
    message: "Choose the department(s) this HOD reviews",
  });

/**
 * Creates a staff account with an unusable random password and e-mails a password-setup link
 * (valid for 72 hours). No password is ever shared. HODs get one role row per department.
 */
export async function createStaffUser(actor: SessionUser | null, input: unknown) {
  const a = requireUserAdmin(actor);
  const p = createSchema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const v = p.data;
  if (await prisma.user.findUnique({ where: { email: v.email } }))
    throw new ConflictError("An account with this e-mail address already exists");
  if (v.role === "HOD") {
    const n = await prisma.department.count({ where: { id: { in: v.departmentIds }, active: true } });
    if (n !== v.departmentIds.length) throw new ValidationError("Choose active departments only");
  }
  const token = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: v.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: { create: { fullName: v.fullName, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
        roles: {
          create:
            v.role === "HOD"
              ? v.departmentIds.map((departmentId) => ({ role: v.role, departmentId, grantedById: a.id }))
              : [{ role: v.role, grantedById: a.id }],
        },
      },
    });
    await tx.authToken.create({
      data: {
        userId: u.id,
        type: "PASSWORD_RESET",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      },
    });
    await notify(
      tx,
      u.id,
      "account.staff_invite",
      "Your PSG Tech recruitment portal account",
      `An account has been created for you on the PSG College of Technology Staff Recruitment Portal.\n\nSet your password within 72 hours:\n${env().APP_ORIGIN}/reset-password?token=${token}\n\nAfter that, sign in with this e-mail address. A one-time code is sent to this mailbox at every sign-in.`,
    );
    await audit(
      {
        actorId: a.id,
        action: "user.staff_created",
        entityType: "user",
        entityId: u.id,
        metadata: { role: v.role, departmentIds: v.departmentIds },
      },
      tx,
    );
  });
}

const grantSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(STAFF_ROLES),
  departmentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function grantRole(actor: SessionUser | null, input: unknown) {
  const a = requireUserAdmin(actor);
  const p = grantSchema.safeParse(input);
  if (!p.success) throw new ValidationError("Invalid role assignment");
  const g = p.data;
  if (g.role === "HOD" && !g.departmentId) throw new ValidationError("Choose the HOD's department");
  const target = await prisma.user.findUnique({ where: { id: g.userId }, include: { roles: true } });
  if (!target) throw new NotFoundError("User");
  if (target.roles.some((r) => r.role === "CANDIDATE"))
    throw new ConflictError(
      "Candidate accounts cannot be given staff roles; create a separate staff account",
    );
  const departmentId = g.role === "HOD" ? g.departmentId! : null;
  if (target.roles.some((r) => r.role === g.role && r.departmentId === departmentId))
    throw new ConflictError("This role is already assigned");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.create({ data: { userId: g.userId, role: g.role, departmentId, grantedById: a.id } });
    await audit(
      {
        actorId: a.id,
        action: "user.role_granted",
        entityType: "user",
        entityId: g.userId,
        metadata: { role: g.role, departmentId },
      },
      tx,
    );
  });
}

export async function revokeRole(actor: SessionUser | null, roleId: string) {
  const a = requireUserAdmin(actor);
  const r = await prisma.userRole.findUnique({ where: { id: roleId } });
  if (!r || r.role === "CANDIDATE") throw new NotFoundError("Role assignment");
  await prisma.$transaction(async (tx) => {
    if (r.role === "ADMIN") {
      if (r.userId === a.id) throw new ConflictError("You cannot remove your own Admin role");
      const others = await tx.userRole.count({
        where: { role: "ADMIN", userId: { not: r.userId }, user: { status: "ACTIVE" } },
      });
      if (others === 0) throw new ConflictError("At least one active Admin must remain");
    }
    await tx.userRole.delete({ where: { id: roleId } });
    await audit(
      {
        actorId: a.id,
        action: "user.role_revoked",
        entityType: "user",
        entityId: r.userId,
        metadata: { role: r.role, departmentId: r.departmentId },
      },
      tx,
    );
  });
}

export async function setUserStatus(
  actor: SessionUser | null,
  userId: string,
  status: "ACTIVE" | "DISABLED",
) {
  const a = requireUserAdmin(actor);
  if (userId === a.id) throw new ConflictError("You cannot disable your own account");
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!target) throw new NotFoundError("User");
    if (
      status === "DISABLED" &&
      target.roles.some((r) => r.role === "ADMIN") &&
      (await activeAdminCount(tx, userId)) === 0
    )
      throw new ConflictError("At least one active Admin must remain");
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "DISABLED") await tx.session.deleteMany({ where: { userId } });
    await audit(
      {
        actorId: a.id,
        action: "user.status_changed",
        entityType: "user",
        entityId: userId,
        metadata: { status },
      },
      tx,
    );
  });
}

/** Re-sends a set-password link (e.g. the invitation expired). */
export async function resendInvite(actor: SessionUser | null, userId: string) {
  const a = requireUserAdmin(actor);
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!u || u.roles.every((r) => r.role === "CANDIDATE")) throw new NotFoundError("User");
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.authToken.create({
      data: {
        userId,
        type: "PASSWORD_RESET",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      },
    });
    await notify(
      tx,
      userId,
      "account.staff_invite",
      "Set your PSG Tech recruitment portal password",
      `Use this link within 72 hours to set your password:\n${env().APP_ORIGIN}/reset-password?token=${token}`,
    );
    await audit({ actorId: a.id, action: "user.invite_resent", entityType: "user", entityId: userId }, tx);
  });
}

/** HODs mapped to a department (active accounts only). */
export async function hodsForDepartment(departmentId: string) {
  return prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "HOD", departmentId } } },
    select: { id: true, email: true, profile: { select: { fullName: true } } },
    orderBy: { email: "asc" },
  });
}
