import type { Prisma } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "~/modules/core/errors";
import { hasPermission, type Permission } from "./permissions";
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
 *  - HR_OFFICER: submitted (non-draft) applications in the cycles they are scoped to (null = all).
 *  - DEPARTMENT_REVIEWER: non-draft applications in their department AND assigned to them.
 *  - Recruitment admins and super admins have no application access by default.
 */
export function staffApplicationScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  // Institutional Admins (Dean, Principal, Super Admin) have full system access across all applications
  if (user.grants.some((g) => g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN")) {
    return { status: { not: "DRAFT" } };
  }

  const ors: Prisma.ApplicationWhereInput[] = [];
  for (const g of user.grants) {
    if (g.role === "HR_OFFICER") {
      ors.push(g.cycleId ? { vacancy: { cycleId: g.cycleId } } : {});
    }
    if (g.role === "DEPARTMENT_REVIEWER" && g.departmentId) {
      ors.push({
        vacancy: { departmentId: g.departmentId },
      });
    }
  }
  if (!ors.length) return null;
  return { AND: [{ status: { not: "DRAFT" } }, { OR: ors }] };
}

export function isHr(user: SessionUser): boolean {
  return user.grants.some(
    (g) => g.role === "HR_OFFICER" || g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN",
  );
}

export function hrScope(user: SessionUser): Prisma.ApplicationWhereInput | null {
  if (user.grants.some((g) => g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN")) {
    return { status: { not: "DRAFT" } };
  }
  const ors = user.grants
    .filter((g) => g.role === "HR_OFFICER")
    .map((g) => (g.cycleId ? { vacancy: { cycleId: g.cycleId } } : {}));
  return ors.length ? { AND: [{ status: { not: "DRAFT" } }, { OR: ors }] } : null;
}

export function reviewerDepartments(user: SessionUser): string[] {
  return user.grants
    .filter((g) => g.role === "DEPARTMENT_REVIEWER" && g.departmentId)
    .map((g) => g.departmentId!);
}
