import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hashPassword } from "~/modules/auth/password.server";
import { hasPermission, ROLES, type RoleName } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { hashToken } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { notify } from "~/modules/notifications/outbox.server";

/** Which roles the acting user may grant or revoke. */
export function grantableRoles(user: SessionUser): RoleName[] {
  if (hasPermission(user.grants, "user:manage"))
    return ["SUPER_ADMIN", "HR_OFFICER", "DEPARTMENT_REVIEWER"];
  if (hasPermission(user.grants, "recruitment:manage")) return ["DEPARTMENT_REVIEWER"];
  return [];
}

function requireUserAdmin(user: SessionUser | null): SessionUser {
  if (!user || grantableRoles(user).length === 0) throw new ForbiddenError();
  return user;
}

export async function listUsers(actor: SessionUser | null, q: string | undefined) {
  requireUserAdmin(actor);
  return prisma.user.findMany({
    where: {
      roles: { some: { role: { not: "CANDIDATE" } } },
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
    take: 200,
    include: { roles: { include: { department: true, cycle: true } }, profile: true },
  });
}

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  fullName: z.string().trim().min(2).max(120),
});

/**
 * Creates a staff account with an unusable random password and e-mails a password-setup link
 * (password-reset token valid for 72 hours). No password is ever shared.
 */
export async function createStaffUser(actor: SessionUser | null, input: unknown) {
  const a = requireUserAdmin(actor);
  if (!hasPermission(a.grants, "user:manage"))
    throw new ForbiddenError("Only a Super Admin can create staff accounts");
  const p = staffSchema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  if (await prisma.user.findUnique({ where: { email: p.data.email } }))
    throw new ConflictError("An account with this e-mail already exists");
  const token = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: p.data.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: {
          create: { fullName: p.data.fullName, privacyVersion: "staff", privacyAcceptedAt: new Date() },
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
      "Your PSG Tech recruitment staff account",
      `A staff account has been created for you on the PSG Tech Staff Recruitment Portal.\n\nSet your password within 72 hours:\n${env().APP_ORIGIN}/reset-password?token=${token}`,
    );
    await audit({ actorId: a.id, action: "user.staff_created", entityType: "user", entityId: u.id }, tx);
  });
}

const grantSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
  departmentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  cycleId: z
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
  if (!grantableRoles(a).includes(g.role)) throw new ForbiddenError("You cannot grant this role");
  if (g.role === "DEPARTMENT_REVIEWER" && !g.departmentId)
    throw new ValidationError("A department reviewer must be assigned to a department");
  const target = await prisma.user.findUnique({ where: { id: g.userId }, include: { roles: true } });
  if (!target) throw new NotFoundError("User");
  if (target.roles.some((r) => r.role === "CANDIDATE"))
    throw new ConflictError(
      "Candidate accounts cannot be given staff roles; create a separate staff account",
    );
  if (
    target.roles.some(
      (r) =>
        r.role === g.role && r.departmentId === (g.departmentId ?? null) && r.cycleId === (g.cycleId ?? null),
    )
  )
    throw new ConflictError("This role is already assigned");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.create({
      data: {
        userId: g.userId,
        role: g.role,
        departmentId: g.role === "DEPARTMENT_REVIEWER" ? g.departmentId! : null,
        cycleId: g.role === "HR_OFFICER" ? (g.cycleId ?? null) : null,
        grantedById: a.id,
      },
    });
    await audit(
      {
        actorId: a.id,
        action: "user.role_granted",
        entityType: "user",
        entityId: g.userId,
        metadata: { role: g.role, departmentId: g.departmentId, cycleId: g.cycleId },
      },
      tx,
    );
  });
}

export async function revokeRole(actor: SessionUser | null, roleId: string) {
  const a = requireUserAdmin(actor);
  const r = await prisma.userRole.findUnique({ where: { id: roleId } });
  if (!r) throw new NotFoundError("Role assignment");
  if (!grantableRoles(a).includes(r.role as RoleName) && r.role !== "RECRUITMENT_ADMIN")
    throw new ForbiddenError("You cannot revoke this role");
  if (r.userId === a.id && (r.role === "SUPER_ADMIN" || r.role === "RECRUITMENT_ADMIN"))
    throw new ConflictError("You cannot remove your own Admin role");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.delete({ where: { id: roleId } });
    await audit(
      {
        actorId: a.id,
        action: "user.role_revoked",
        entityType: "user",
        entityId: r.userId,
        metadata: { role: r.role },
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
  if (!hasPermission(a.grants, "user:manage")) throw new ForbiddenError();
  if (userId === a.id) throw new ConflictError("You cannot disable your own account");
  await prisma.$transaction(async (tx) => {
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
