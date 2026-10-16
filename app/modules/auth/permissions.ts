/**
 * Role -> permission matrix (shared by server and UI). The UI uses it only to hide controls;
 * every loader/action/download re-checks on the server, together with record-level scope rules in
 * policy.server.ts. See docs/architecture/authorization-matrix.md.
 */
export const ROLES = [
  "CANDIDATE",
  "HR_OFFICER",
  "DEPARTMENT_REVIEWER",
  "RECRUITMENT_ADMIN",
  "SUPER_ADMIN",
  "AUDITOR",
] as const;
export type RoleName = (typeof ROLES)[number];

export type Permission =
  | "application:own"
  | "application:list"
  | "application:read"
  | "application:transition"
  | "application:assign"
  | "application:export"
  | "review:record"
  | "document:download"
  | "document:regenerate"
  | "recruitment:manage"
  | "user:manage"
  | "audit:read";

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  CANDIDATE: ["application:own"],
  HR_OFFICER: [
    "application:list",
    "application:read",
    "application:transition",
    "application:assign",
    "application:export",
    "document:download",
    "document:regenerate",
  ],
  DEPARTMENT_REVIEWER: ["application:list", "application:read", "review:record", "document:download"],
  RECRUITMENT_ADMIN: ["recruitment:manage"],
  SUPER_ADMIN: ["user:manage"],
  AUDITOR: ["application:list", "application:read", "audit:read"],
};

export const ROLE_LABELS: Record<RoleName, string> = {
  CANDIDATE: "Candidate",
  HR_OFFICER: "HR / Recruitment Officer",
  DEPARTMENT_REVIEWER: "Department Reviewer / HOD",
  RECRUITMENT_ADMIN: "Recruitment Administrator",
  SUPER_ADMIN: "Super Admin",
  AUDITOR: "Auditor",
};

export interface RoleGrant {
  role: RoleName;
  departmentId: string | null;
  cycleId: string | null;
}

export function hasPermission(grants: readonly RoleGrant[], p: Permission): boolean {
  return grants.some((g) => ROLE_PERMISSIONS[g.role].includes(p));
}

export function hasRole(grants: readonly RoleGrant[], role: RoleName): boolean {
  return grants.some((g) => g.role === role);
}

/** Staff = anyone with a non-candidate role. */
export function isStaff(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role !== "CANDIDATE");
}
