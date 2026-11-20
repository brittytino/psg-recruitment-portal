import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { hashPassword } from "~/modules/auth/password.server";
import { hasPermission, grantableRoles, isSuperAdmin } from "~/modules/auth/permissions";
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

/**
 * Role hierarchy for user management: the Super Admin manages everyone; an Admin (MANAGER) manages
 * only people whose roles are all below Admin (HR, HOD, Viewer). Super Admin accounts do not exist
 * for anyone else ("not found").
 */
async function assertCanManage(actor: SessionUser, userId: string) {
  if (isSuperAdmin(actor.grants)) return;
  const roles = (await prisma.userRole.findMany({ where: { userId }, select: { role: true } })).map(
    (r) => r.role,
  );
  if (roles.includes("SUPER_ADMIN")) throw new NotFoundError("User");
  const allowed = grantableRoles(actor.grants) as readonly string[];
  if (!roles.every((r) => r === "CANDIDATE" || allowed.includes(r)))
    throw new ForbiddenError("Only the Super Admin can change this account");
}

function assertCanGrant(actor: SessionUser, role: string) {
  if (!(grantableRoles(actor.grants) as readonly string[]).includes(role))
    throw new ForbiddenError("You cannot give this role");
}

/**
 * Lists staff accounts, or candidate accounts when role = "CANDIDATE" (Super Admin manages every
 * user). "All staff" (role not given) also surfaces accounts with no role at all: an account whose
 * last role was removed (e.g. a viewer taken off) still needs to be findable so a new role can be
 * granted to it, instead of being invisible and blocking that e-mail address forever.
 */
export async function listStaff(actor: SessionUser | null, q?: string, role?: StaffRole | "CANDIDATE") {
  const a = requireUserAdmin(actor);
  const hideSuper = !isSuperAdmin(a.grants);
  if (hideSuper && role === "SUPER_ADMIN") return [];
  const clauses: Prisma.UserWhereInput[] = [
    role
      ? { roles: { some: { role } } }
      : { OR: [{ roles: { some: { role: { not: "CANDIDATE" } } } }, { roles: { none: {} } }] },
  ];
  if (hideSuper) clauses.push({ NOT: { roles: { some: { role: "SUPER_ADMIN" } } } });
  if (q)
    clauses.push({
      OR: [
        { email: { contains: q.toLowerCase() } },
        { profile: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    });
  return prisma.user.findMany({
    where: { AND: clauses },
    orderBy: { email: "asc" },
    take: 300,
    include: { roles: { include: { department: true } }, profile: true },
  });
}

/** Active Super Admins other than the given user. The system must always keep at least one. */
async function activeAdminCount(tx: Tx, excludingUserId?: string) {
  return tx.user.count({
    where: {
      status: "ACTIVE",
      roles: { some: { role: "SUPER_ADMIN" } },
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
  if (v.role === "HOD") throw new ConflictError("Add HODs from Departments & HODs, one per department");
  assertCanGrant(a, v.role);
  if (await prisma.user.findUnique({ where: { email: v.email } }))
    throw new ConflictError("An account with this e-mail address already exists");
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
      `An account has been created for you on the PSG College of Technology recruitment office.\n\nSign in directly using your email address:\n${env().APP_ORIGIN}/login\n\nA secure 6-digit one-time verification code (OTP) will be sent to this email address on every sign-in. No password is required.`,
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
  if (g.role === "HOD") throw new ConflictError("Add HODs from Departments & HODs, one per department");
  assertCanGrant(a, g.role);
  await assertCanManage(a, g.userId);
  const target = await prisma.user.findUnique({ where: { id: g.userId }, include: { roles: true } });
  if (!target) throw new NotFoundError("User");
  if (target.roles.some((r) => r.role === "CANDIDATE"))
    throw new ConflictError(
      "Candidate accounts cannot be given staff roles; create a separate staff account",
    );
  const departmentId = null;
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
  await assertCanManage(a, r.userId);
  assertCanGrant(a, r.role);
  await prisma.$transaction(async (tx) => {
    if (r.role === "SUPER_ADMIN") {
      if (r.userId === a.id) throw new ConflictError("You cannot remove your own Super Admin role");
      if ((await activeAdminCount(tx, r.userId)) === 0)
        throw new ConflictError("At least one active Super Admin must remain");
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
  await assertCanManage(a, userId);
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!target) throw new NotFoundError("User");
    if (
      status === "DISABLED" &&
      target.roles.some((r) => r.role === "SUPER_ADMIN") &&
      (await activeAdminCount(tx, userId)) === 0
    )
      throw new ConflictError("At least one active Super Admin must remain");
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
  await assertCanManage(a, userId);
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
      "Sign-in instructions for PSG Tech recruitment portal",
      `An administrator has resent your sign-in details for the PSG College of Technology recruitment office.\n\nSign in directly using your email address:\n${env().APP_ORIGIN}/login\n\nA secure 6-digit one-time verification code (OTP) will be sent to your email address on every sign-in. No password is required.`,
    );
    await audit({ actorId: a.id, action: "user.invite_resent", entityType: "user", entityId: userId }, tx);
  });
}

const hodInviteSchema = z.object({
  departmentId: z.string().uuid("Choose a department"),
  fullName: z.string().trim().min(2, "Enter the HOD's full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(200),
});

function hodInviteBody(fullName: string, departmentName: string, email: string) {
  const link = `${env().APP_ORIGIN}/login?${new URLSearchParams({ email, next: "/staff/review", invite: "hod" })}`;
  return [
    `Dear ${fullName},`,
    "",
    `You have been added as the Head of Department for ${departmentName} on the PSG College of Technology recruitment office.`,
    "",
    "Accept the invitation and sign in here:",
    link,
    "",
    `Your sign-in e-mail is ${email}. A 6-digit one-time code is e-mailed to you on every sign-in; no password is needed.`,
    "After signing in you will see the applications assigned to you for review and the department summary sheet.",
    "",
    "HR – N4 Section, PSG College of Technology",
  ].join("\n");
}

/**
 * HR – N4 Section adds a department's HOD (name + e-mail) and sends the invitation link.
 * A new account is created when needed; an existing staff account gains the HOD role for the
 * department. Candidate accounts are never turned into staff accounts.
 */
export async function inviteHod(actor: SessionUser | null, input: unknown) {
  if (!actor || !hasPermission(actor.grants, "department:manage")) throw new ForbiddenError();
  const p = hodInviteSchema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const v = p.data;
  const department = await prisma.department.findUnique({ where: { id: v.departmentId } });
  if (!department || !department.active) throw new ValidationError("Choose an active department");
  const existing = await prisma.user.findUnique({ where: { email: v.email }, include: { roles: true } });
  if (existing?.roles.some((r) => r.role === "CANDIDATE"))
    throw new ConflictError(
      "This e-mail belongs to a candidate account. Use the HOD's official institutional e-mail address.",
    );
  if (existing?.roles.some((r) => r.role === "HOD" && r.departmentId === v.departmentId))
    throw new ConflictError("This person is already a HOD of the department");
  // One HOD per department: bulk assignment sends a department's applications to exactly one HOD.
  if ((await prisma.userRole.count({ where: { role: "HOD", departmentId: v.departmentId } })) > 0)
    throw new ConflictError(
      "This department already has a HOD. Remove the current HOD before adding another.",
    );
  await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email: v.email,
          emailVerifiedAt: new Date(),
          profile: {
            create: { fullName: v.fullName, privacyVersion: "staff", privacyAcceptedAt: new Date() },
          },
        },
      }));
    await tx.userRole.create({
      data: { userId: user.id, role: "HOD", departmentId: v.departmentId, grantedById: actor.id },
    });
    await notify(
      tx,
      user.id,
      "account.hod_invite",
      `HOD access – ${department.name} | PSG Tech Recruitment`,
      hodInviteBody(v.fullName, department.name, v.email),
    );
    await audit(
      {
        actorId: actor.id,
        action: "department.hod_invited",
        entityType: "department",
        entityId: v.departmentId,
        metadata: { userId: user.id, newAccount: !existing },
      },
      tx,
    );
  });
}

/** Re-sends the HOD invitation e-mail for a department. */
export async function resendHodInvite(actor: SessionUser | null, roleId: string) {
  if (!actor || !hasPermission(actor.grants, "department:manage")) throw new ForbiddenError();
  const r = await prisma.userRole.findUnique({
    where: { id: roleId },
    include: { department: true, user: { include: { profile: true } } },
  });
  if (!r || r.role !== "HOD" || !r.department) throw new NotFoundError("HOD");
  await prisma.$transaction(async (tx) => {
    await notify(
      tx,
      r.userId,
      "account.hod_invite",
      `HOD access – ${r.department!.name} | PSG Tech Recruitment`,
      hodInviteBody(r.user.profile?.fullName ?? r.user.email, r.department!.name, r.user.email),
    );
    await audit(
      {
        actorId: actor.id,
        action: "department.hod_invite_resent",
        entityType: "department",
        entityId: r.departmentId,
        metadata: { userId: r.userId },
      },
      tx,
    );
  });
}

/** Removes a HOD from a department. Applications already assigned to them stay assigned. */
export async function removeHod(actor: SessionUser | null, roleId: string) {
  if (!actor || !hasPermission(actor.grants, "department:manage")) throw new ForbiddenError();
  const r = await prisma.userRole.findUnique({ where: { id: roleId } });
  if (!r || r.role !== "HOD") throw new NotFoundError("HOD");
  await prisma.$transaction(async (tx) => {
    await tx.userRole.delete({ where: { id: roleId } });
    await audit(
      {
        actorId: actor.id,
        action: "department.hod_removed",
        entityType: "department",
        entityId: r.departmentId,
        metadata: { userId: r.userId },
      },
      tx,
    );
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

/** Ends every session of a user (e.g. lost device). The user can sign in again with a new code. */
export async function signOutEverywhere(actor: SessionUser | null, userId: string) {
  const a = requireUserAdmin(actor);
  await assertCanManage(a, userId);
  if (userId === a.id) throw new ConflictError("Use Sign out for your own account");
  await prisma.$transaction(async (tx) => {
    if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } })))
      throw new NotFoundError("User");
    const { count } = await tx.session.deleteMany({ where: { userId } });
    await audit(
      {
        actorId: a.id,
        action: "user.sessions_revoked",
        entityType: "user",
        entityId: userId,
        metadata: { count },
      },
      tx,
    );
  });
}

/**
 * Changes the sign-in e-mail address of an account. The new address must be unused; every session
 * of the account is ended so the next sign-in uses a one-time code sent to the new address.
 */
export async function changeUserEmail(actor: SessionUser | null, userId: string, emailRaw: unknown) {
  const a = requireUserAdmin(actor);
  await assertCanManage(a, userId);
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid e-mail address")
    .max(200)
    .safeParse(emailRaw);
  if (!parsed.success)
    throw new ValidationError("Enter a valid e-mail address", { email: ["Enter a valid e-mail address"] });
  const email = parsed.data;
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        profile: { select: { fullName: true } },
        roles: { where: { role: "HOD" }, select: { department: { select: { name: true } } } },
      },
    });
    if (!target) throw new NotFoundError("User");
    if (target.email === email) throw new ConflictError("That is already this account's e-mail address");
    if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
      throw new ConflictError("An account with this e-mail address already exists");
    await tx.user.update({ where: { id: userId }, data: { email } });
    await tx.session.deleteMany({ where: { userId } });
    const hodDept = target.roles[0]?.department;
    if (hodDept) {
      // A HOD gets the full invitation again at the new address, so the department can sign in and receive bulk assignments.
      await notify(
        tx,
        userId,
        "account.hod_invite",
        `HOD access – ${hodDept.name} | PSG Tech Recruitment`,
        hodInviteBody(target.profile?.fullName ?? email, hodDept.name, email),
        { dedupeKey: `hod-email:${email}` },
      );
    } else {
      await notify(
        tx,
        userId,
        "account.email_changed",
        "Your sign-in e-mail address has been changed | PSG Tech Recruitment",
        `The sign-in e-mail address for your PSG College of Technology recruitment office account has been changed to ${email}.\n\nAll active sessions were ended. Sign in at ${env().APP_ORIGIN}/login; the one-time code will be sent to this address.\n\nIf you did not expect this change, contact the recruitment office.`,
      );
    }
    await audit(
      {
        actorId: a.id,
        action: "user.email_changed",
        entityType: "user",
        entityId: userId,
        metadata: { previousEmail: target.email, newEmail: email },
      },
      tx,
    );
  });
}

/** Corrects the display name of any account. Submitted applications keep their own snapshot. */
export async function renameUser(actor: SessionUser | null, userId: string, nameRaw: unknown) {
  const a = requireUserAdmin(actor);
  await assertCanManage(a, userId);
  const name = z.string().trim().min(2).max(120).safeParse(nameRaw);
  if (!name.success) throw new ValidationError("Enter the full name", { fullName: ["Enter the full name"] });
  await prisma.$transaction(async (tx) => {
    if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } })))
      throw new NotFoundError("User");
    await tx.candidateProfile.upsert({
      where: { userId },
      create: { userId, fullName: name.data, privacyVersion: "staff", privacyAcceptedAt: new Date() },
      update: { fullName: name.data },
    });
    await audit({ actorId: a.id, action: "user.renamed", entityType: "user", entityId: userId }, tx);
  });
}

/**
 * Permanently deletes an account of any role. Super Admin only. Refused when the account is still
 * referenced by records that must be kept (applications, reviews, audit history); such accounts
 * should be disabled instead.
 */
export async function deleteUser(actor: SessionUser | null, userId: string) {
  if (!actor || !isSuperAdmin(actor.grants))
    throw new ForbiddenError("Only the Super Admin can delete accounts");
  if (userId === actor.id) throw new ConflictError("You cannot delete your own account");
  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, roles: { select: { role: true } } },
      });
      if (!target) throw new NotFoundError("User");
      if (target.roles.some((r) => r.role === "SUPER_ADMIN") && (await activeAdminCount(tx, userId)) === 0)
        throw new ConflictError("At least one active Super Admin must remain");
      await audit(
        {
          actorId: actor.id,
          action: "user.deleted",
          entityType: "user",
          entityId: userId,
          metadata: { email: target.email, roles: target.roles.map((r) => r.role) },
        },
        tx,
      );
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2003")
      throw new ConflictError(
        "This account has applications, reviews or audit history and cannot be deleted. Disable it instead.",
      );
    throw err;
  }
}
