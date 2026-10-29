import type { Prisma } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "~/modules/core/errors";
import { hasPermission, hodDepartments, isAdmin, isHrOfficer, type Permission } from "./permissions";
import type { SessionUser } from "./session.server";

export function requireAuth(user: SessionUser | null): SessionUser {
  if (!user) throw new UnauthenticatedError();
  return user;
}

export function requirePermission(user: SessionUser | null, p: Permission): SessionUser {
  const u = requireAuth(user);
  if (!hasPermission(u.grants, p)) throw new ForbiddenError();
  return u;
}

/**
 * Record-level scope for staff reading applications, expressed as a Prisma `where` fragment so the
 * same rule is applied to lists, counts, detail pages and downloads. Returns null when the user has
 * no staff read access at all.
 *
 *  - ADMIN & SUPER_ADMIN: every submitted (non-draft) application across the institution.
 *  - HR: every submitted (non-draft) application.
 *  - HOD: submitted applications of their own department(s) that are assigned to them.
 */
export function staffApplicationScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  if (isAdmin(user.grants) || isHrOfficer(user.grants)) return { status: { not: "DRAFT" } };
  const depts = hodDepartments(user.grants);
  if (!depts.length) return null;
  return {
    AND: [
      { status: { not: "DRAFT" } },
      { OR: [{ assignedHodId: user.id, vacancy: { departmentId: { in: depts } } }] },
    ],
  };
}

/** True for Super Admin, Admin and HR (institution-wide recruitment office access). */
export function isHr(user: SessionUser): boolean {
  return isHrOfficer(user.grants) || isAdmin(user.grants);
}

/** Scope for recruitment-office actions (transitions, assignment, exports): Super Admin, Admin and HR only. */
export function hrScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  return isAdmin(user.grants) || isHrOfficer(user.grants) ? { status: { not: "DRAFT" } } : null;
}

export function reviewerDepartments(user: SessionUser): string[] {
  return hodDepartments(user.grants);
}

/** Scope for research applications: accessible only by HR, Admin and Super Admin (never HODs). */
export function researchApplicationScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  if (!isHr(user)) return null;
  const hr = hrScope(user);
  if (!hr) return null;
  return { AND: [hr, { recruitmentCategory: "RESEARCH" }] };
}
