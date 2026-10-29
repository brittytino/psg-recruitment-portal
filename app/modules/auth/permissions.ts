/**
 * Role -> permission matrix (shared by server and UI). The UI uses it only to hide controls;
 * every loader/action/download re-checks on the server, together with record-level scope rules in
 * policy.server.ts. See docs/architecture/authorization-matrix.md.
 *
 *  - SUPER_ADMIN: full system access.
 *  - ADMIN: Dean and Principal. Recruitment oversight and assigning applications to HODs.
 *  - HR: HR – N4 Section. Job profiles, screening, departments + HOD invitations, research
 *    specialisations, the public "open positions" notice, summaries and exports.
 *  - HOD: reviews the applications of their own department that were assigned to them.
 *  - CANDIDATE: their own applications only.
 */
export const ROLES = ["CANDIDATE", "HR", "HOD", "ADMIN", "SUPER_ADMIN"] as const;
export type RoleName = (typeof ROLES)[number];

/** Staff roles that Super Admin can grant (candidates register themselves). */
export const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "HR", "HOD"] as const satisfies readonly RoleName[];
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Permission =
  | "application:own"
  | "application:list"
  | "application:read"
  | "application:transition"
  | "application:assign"
  | "application:export"
  | "review:record"
  | "summary:generate"
  | "summary:read"
  | "summary:reopen"
  | "position:approve"
  | "document:download"
  | "document:regenerate"
  | "recruitment:manage"
  | "department:manage"
  | "notice:manage"
  | "user:manage"
  | "settings:manage"
  | "audit:read"
  | "system:manage";

/** Every permission except the candidate-only one. */
export const ALL_STAFF_PERMISSIONS: readonly Permission[] = [
  "application:list",
  "application:read",
  "application:transition",
  "application:assign",
  "application:export",
  "review:record",
  "summary:generate",
  "summary:read",
  "summary:reopen",
  "position:approve",
  "document:download",
  "document:regenerate",
  "recruitment:manage",
  "department:manage",
  "notice:manage",
  "user:manage",
  "settings:manage",
  "audit:read",
  "system:manage",
];
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  CANDIDATE: ["application:own"],
  HR: [
    "application:list",
    "application:read",
    "application:transition",
    "application:assign",
    "application:export",
    "summary:read",
    "document:download",
    "document:regenerate",
    "recruitment:manage",
    "department:manage",
    "notice:manage",
  ],
  HOD: [
    "application:list",
    "application:read",
    "review:record",
    "summary:generate",
    "summary:read",
    "document:download",
  ],
  ADMIN: [
    "application:list",
    "application:read",
    "application:transition",
    "application:assign",
    "application:export",
    "summary:read",
    "summary:reopen",
    "position:approve",
    "document:download",
    "document:regenerate",
    "recruitment:manage",
  ],
  // Super Admin holds every staff permission, including ones added later (see ALL_STAFF_PERMISSIONS).
  SUPER_ADMIN: ALL_STAFF_PERMISSIONS,
};

export const ROLE_LABELS: Record<RoleName, string> = {
  CANDIDATE: "Candidate",
  HR: "HR – N4 Section",
  HOD: "Head of Department (HOD)",
  ADMIN: "Admin (Dean / Principal)",
  SUPER_ADMIN: "Super Admin",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  CANDIDATE: "Applies for vacancies.",
  HR: "Job profiles and screening; adds departments, invites HODs, manages research specialisations and the open-positions notice; summaries and exports.",
  HOD: "Reviews the applications of their own department that are assigned to them and approves the department summary sheet.",
  ADMIN:
    "Recruitment oversight: assigns applications to HODs, tracks progress, approves position changes and views summaries.",
  SUPER_ADMIN: "Full system access: users, roles, settings, audit logs and every recruitment operation.",
};

export interface RoleGrant {
  role: RoleName;
  departmentId: string | null;
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

export function isSuperAdmin(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "SUPER_ADMIN");
}

export function isAdmin(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "ADMIN") || hasRole(grants, "SUPER_ADMIN");
}

export function isHrOfficer(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "HR");
}

export function isHodReviewer(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "HOD");
}

/** Department ids a HOD is responsible for. */
export function hodDepartments(grants: readonly RoleGrant[]): string[] {
  return grants.filter((g) => g.role === "HOD" && g.departmentId).map((g) => g.departmentId!);
}

/** Highest-privilege role label, for headers and badges. */
export function primaryRoleLabel(grants: readonly RoleGrant[]): string {
  if (isSuperAdmin(grants)) return "Super Admin";
  if (isAdmin(grants)) return "Admin";
  if (isHrOfficer(grants)) return "HR – N4 Section";
  if (isHodReviewer(grants)) return "HOD";
  return "Applicant";
}

/** Where a user lands after signing in. */
export function homePath(grants: readonly RoleGrant[]): string {
  if (isSuperAdmin(grants) || isAdmin(grants) || isHrOfficer(grants)) return "/staff";
  if (isHodReviewer(grants)) return "/staff/review";
  return "/account";
}
