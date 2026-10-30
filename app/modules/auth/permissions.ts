/**
 * Role -> permission matrix (shared by server and UI). The UI uses it only to hide controls;
 * every loader/action/download re-checks on the server, together with record-level scope rules in
 * policy.server.ts. See docs/architecture/authorization-matrix.md.
 *
 *  - SUPER_ADMIN: full system access. Hidden from every other user.
 *  - MANAGER ("Admin"): runs recruitment and support day to day — everything HR – N4 Section and
 *    Dean / Principal can do, the help desk (including its settings), and adding people in lower
 *    roles (HR, HOD, Viewer). No system settings, system logs, audit log or Super Admin powers.
 *  - ADMIN: Dean and Principal. Recruitment oversight and assigning applications to HODs.
 *  - HR: HR – N4 Section. Job profiles, screening, departments + HOD invitations, research
 *    specialisations, the public "open positions" notice, summaries and exports.
 *  - HOD: reviews the applications of their own department that were assigned to them.
 *  - VIEWER: read-only access to applications (list, open, view documents). Granted by the
 *    Super Admin or HR – N4 Section.
 *  - CANDIDATE: their own applications only.
 */
export const ROLES = ["CANDIDATE", "HR", "HOD", "ADMIN", "SUPER_ADMIN", "VIEWER", "MANAGER"] as const;
export type RoleName = (typeof ROLES)[number];

/** Staff roles that Super Admin can grant (candidates register themselves). */
export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "ADMIN",
  "HR",
  "HOD",
  "VIEWER",
] as const satisfies readonly RoleName[];

/**
 * Roles each manager may grant, edit or remove. The Super Admin manages everyone; an Admin
 * (MANAGER) manages lower roles only. Nobody else manages users.
 */
export function grantableRoles(grants: readonly RoleGrant[]): readonly StaffRole[] {
  if (hasRole(grants, "SUPER_ADMIN")) return STAFF_ROLES;
  if (hasRole(grants, "MANAGER")) return ["HR", "HOD", "VIEWER"];
  return [];
}
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
  | "system:manage"
  /** Help desk: read and work on candidate support tickets. */
  | "helpdesk:handle"
  /** Help desk configuration: assignment rules, help articles, escalations. */
  | "helpdesk:admin"
  /** Add and remove read-only Viewer accounts (Super Admin, HR – N4 Section). */
  | "viewer:manage";

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
  "helpdesk:handle",
  "helpdesk:admin",
  "viewer:manage",
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
    "helpdesk:handle",
    "viewer:manage",
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
  // Admin: HR + Dean / Principal work, the help desk and lower-role management; not system-level.
  MANAGER: [
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
    "department:manage",
    "notice:manage",
    "helpdesk:handle",
    "helpdesk:admin",
    "viewer:manage",
    "user:manage",
  ],
  // Read only: no transition, assignment, export, decisions, help desk or configuration.
  VIEWER: ["application:list", "application:read", "document:download"],
};

export const ROLE_LABELS: Record<RoleName, string> = {
  CANDIDATE: "Candidate",
  HR: "HR – N4 Section",
  HOD: "Head of Department (HOD)",
  ADMIN: "Dean / Principal",
  MANAGER: "Admin",
  SUPER_ADMIN: "Super Admin",
  VIEWER: "Viewer (read only)",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  CANDIDATE: "Applies for vacancies.",
  HR: "Job profiles and screening; adds departments, invites HODs, manages research specialisations and the open-positions notice; summaries and exports.",
  HOD: "Reviews the applications of their own department that are assigned to them and approves the department summary sheet.",
  ADMIN:
    "Recruitment oversight: assigns applications to HODs, tracks progress, approves position changes and views summaries.",
  SUPER_ADMIN: "Full system access: users, roles, settings, audit logs and every recruitment operation.",
  MANAGER:
    "Runs recruitment and support: applications, HOD assignment, job profiles, departments, the help desk, and adding HR, HOD and Viewer accounts.",
  VIEWER: "Can open and read submitted applications and their documents. Cannot change anything.",
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

/** Institution-wide recruitment office access: Dean / Principal, Admin and Super Admin. */
export function isAdmin(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "ADMIN") || hasRole(grants, "MANAGER") || hasRole(grants, "SUPER_ADMIN");
}

export function isManager(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "MANAGER");
}

export function isHrOfficer(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "HR");
}

export function isHodReviewer(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "HOD");
}

/** Department ids a HOD is responsible for. */
/** Read-only viewer (and nothing more powerful). */
export function isViewer(grants: readonly RoleGrant[]): boolean {
  return hasRole(grants, "VIEWER");
}

export function hodDepartments(grants: readonly RoleGrant[]): string[] {
  return grants.filter((g) => g.role === "HOD" && g.departmentId).map((g) => g.departmentId!);
}

/** Highest-privilege role label, for headers and badges. */
export function primaryRoleLabel(grants: readonly RoleGrant[]): string {
  if (isSuperAdmin(grants)) return "Super Admin";
  if (isManager(grants)) return "Admin";
  if (isAdmin(grants)) return "Dean / Principal";
  if (isHrOfficer(grants)) return "HR – N4 Section";
  if (isHodReviewer(grants)) return "HOD";
  if (isViewer(grants)) return "Viewer (read only)";
  return "Applicant";
}

/** Where a user lands after signing in. */
export function homePath(grants: readonly RoleGrant[]): string {
  if (isSuperAdmin(grants) || isAdmin(grants) || isHrOfficer(grants)) return "/staff";
  if (isHodReviewer(grants)) return "/staff/review";
  if (isViewer(grants)) return "/staff";
  return "/account";
}
