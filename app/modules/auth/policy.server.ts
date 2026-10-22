import type { Prisma } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "~/modules/core/errors";
import { hasPermission, hasRole, hodDepartments, type Permission } from "./permissions";
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
 *  - ADMIN: every submitted (non-draft) application.
 *  - HR: submitted applications in the cycles they are scoped to (null = all cycles).
 *  - HOD: submitted applications of their own department(s) that are assigned to them.
 */
export function staffApplicationScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  if (hasRole(user.grants, "ADMIN")) return { status: { not: "DRAFT" } };
  const ors: Prisma.ApplicationWhereInput[] = [];
  for (const g of user.grants) {
    if (g.role === "HR") ors.push(g.cycleId ? { vacancy: { cycleId: g.cycleId } } : {});
  }
  const depts = hodDepartments(user.grants);
  if (depts.length) ors.push({ assignedHodId: user.id, vacancy: { departmentId: { in: depts } } });
  if (!ors.length) return null;
  return { AND: [{ status: { not: "DRAFT" } }, { OR: ors }] };
}

/** True for Admin and HR (institution-wide recruitment office access). */
export function isHr(user: SessionUser): boolean {
  return hasRole(user.grants, "HR") || hasRole(user.grants, "ADMIN");
}

/** Scope for recruitment-office actions (transitions, assignment, exports): Admin and HR only. */
export function hrScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  if (hasRole(user.grants, "ADMIN")) return { status: { not: "DRAFT" } };
  const ors = user.grants
    .filter((g) => g.role === "HR")
    .map((g) => (g.cycleId ? { vacancy: { cycleId: g.cycleId } } : {}));
  return ors.length ? { AND: [{ status: { not: "DRAFT" } }, { OR: ors }] } : null;
}

export function reviewerDepartments(user: SessionUser): string[] {
  return hodDepartments(user.grants);
}
