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
    "recruitment:manage",
  ],
  DEPARTMENT_REVIEWER: ["application:list", "application:read", "review:record", "document:download"],
  RECRUITMENT_ADMIN: [
    "user:manage",
    "recruitment:manage",
    "audit:read",
    "application:list",
    "application:read",
    "application:transition",
    "application:assign",
    "application:export",
    "document:download",
    "document:regenerate",
    "review:record",
  ],
  SUPER_ADMIN: [
    "user:manage",
    "recruitment:manage",
    "audit:read",
    "application:list",
    "application:read",
    "application:transition",
    "application:assign",
    "application:export",
    "document:download",
    "document:regenerate",
    "review:record",
  ],
};

export const ROLE_LABELS: Record<RoleName, string> = {
  CANDIDATE: "Candidate",
  HR_OFFICER: "HR Officer (HR-N4 Section)",
  DEPARTMENT_REVIEWER: "HOD / Department Reviewer",
  RECRUITMENT_ADMIN: "Admin (Dean / Principal)",
  SUPER_ADMIN: "Admin (Dean / Principal)",
};

export interface RoleGrant {
  role: RoleName;
  departmentId: string | null;
  cycleId: string | null;
}

export function hasPermission(grants: readonly RoleGrant[], p: Permission): boolean {
  return grants.some((g) => ROLE_PERMISSIONS[g.role]?.includes(p));
}

export function hasRole(grants: readonly RoleGrant[], role: RoleName): boolean {
  return grants.some((g) => g.role === role);
}

/** Staff = anyone with a non-candidate role. */
export function isStaff(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role !== "CANDIDATE");
}

export function isAdmin(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role === "SUPER_ADMIN" || g.role === "RECRUITMENT_ADMIN");
}

export function isHrOfficer(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role === "HR_OFFICER");
}

export function isHodReviewer(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role === "DEPARTMENT_REVIEWER");
}

export function getPrimaryRoleBadge(grants: readonly RoleGrant[]): {
  label: string;
  tone: "info" | "warning" | "neutral" | "success" | "danger";
} {
  if (isAdmin(grants)) return { label: "Admin (Dean / Principal)", tone: "info" };
  if (isHrOfficer(grants)) return { label: "HR - N4 Section", tone: "warning" };
  if (isHodReviewer(grants)) return { label: "HOD / Dept Reviewer", tone: "neutral" };
  if (isStaff(grants)) return { label: "Staff", tone: "neutral" };
  return { label: "Applicant", tone: "success" };
}
