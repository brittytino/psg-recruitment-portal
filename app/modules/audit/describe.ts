/**
 * Plain-English labels for audit events, shared by the audit log page and its export.
 * Unknown actions fall back to a readable version of the code, so new events never break the page.
 */
export const AUDIT_CATEGORIES = {
  auth: "Sign-in and security",
  account: "Candidate accounts",
  application: "Applications",
  review: "Reviews and decisions",
  document: "Documents",
  setup: "Job profiles, departments and notices",
  user: "Users and roles",
  settings: "Settings and control centre",
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

/** Action-code prefixes per category (used for filtering). */
export const CATEGORY_PREFIXES: Record<AuditCategory, string[]> = {
  auth: ["auth."],
  account: ["account."],
  application: ["application.", "applications."],
  review: ["review.", "position_change.", "summary."],
  document: ["document.", "bundle."],
  setup: ["vacancy.", "department.", "discipline.", "research_specialisation.", "notice."],
  user: ["user."],
  settings: ["settings.", "system."],
};

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.otp_sent": "Sign-in code e-mailed",
  "auth.otp_verified": "Sign-in code accepted",
  "auth.otp_failed": "Wrong sign-in code entered",
  "account.registered": "Candidate account created",
  "account.email_verified": "E-mail address verified",
  "account.reset_requested": "Password reset requested",
  "account.password_reset": "Password reset",
  "application.draft_created": "Application started",
  "application.submitted": "Application submitted",
  "application.withdrawn": "Application withdrawn",
  "application.viewed": "Application opened by staff",
  "application.status_changed": "Application status changed",
  "application.assigned_to_hod": "Application sent to HOD",
  "application.unassigned": "Application taken back from HOD",
  "application.note_updated": "Internal note updated",
  "application.interview_called": "Interview call sent",
  "application.interview_rescheduled": "Interview rescheduled",
  "applications.exported": "Applications exported",
  "review.hod_decision": "HOD decision recorded",
  "position_change.approved": "Position change approved",
  "position_change.rejected": "Position change rejected",
  "summary.approved": "Department summary sheet approved",
  "summary.reopened": "Summary sheet reopened",
  "summary.exported": "Summary sheet exported",
  "document.uploaded": "Document uploaded",
  "document.removed": "Document removed",
  "document.downloaded": "Document downloaded by staff",
  "bundle.regeneration_requested": "Application PDF regeneration requested",
  "vacancy.created": "Job profile created",
  "vacancy.updated": "Job profile edited",
  "vacancy.status_changed": "Job profile opened / closed",
  "department.created": "Department added",
  "department.hod_invited": "HOD invited",
  "department.hod_invite_resent": "HOD invitation re-sent",
  "department.hod_removed": "HOD removed",
  "discipline.created": "Discipline added",
  "research_specialisation.created": "Research specialisation added",
  "research_specialisation.updated": "Research specialisation edited",
  "notice.uploaded": "Open-positions PDF uploaded",
  "notice.shown": "Open-positions PDF shown on home page",
  "notice.hidden": "Open-positions PDF hidden",
  "user.staff_created": "Staff account created",
  "user.renamed": "User renamed",
  "user.role_granted": "Role granted",
  "user.role_revoked": "Role removed",
  "user.status_changed": "Account enabled / disabled",
  "user.sessions_revoked": "User signed out everywhere",
  "user.invite_resent": "Invitation re-sent",
  "settings.changed": "Setting changed",
  "system.pdfs_retried": "Failed PDFs queued again",
  "system.all_sessions_revoked": "Everyone signed out",
  "system.test_email_sent": "Test e-mail sent",
};

export function actionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const s = action.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tone of the action for the badge colour: failures and removals stand out. */
export function actionTone(action: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (/failed|rejected|removed|revoked|withdrawn|hidden/.test(action)) return "danger";
  if (/reopened|unassigned|status_changed|settings\.|role_|sessions_revoked/.test(action)) return "warning";
  if (/submitted|approved|verified|created|granted|accepted|shown/.test(action)) return "success";
  if (/^auth\./.test(action)) return "neutral";
  return "info";
}

const KEY_LABELS: Record<string, string> = {
  from: "From",
  to: "To",
  reason: "Reason",
  value: "New value",
  role: "Role",
  status: "Status",
  version: "Version",
  revisionNo: "Revision",
  referenceNo: "Reference No.",
  documentType: "Document type",
  sizeBytes: "Size",
  size: "Size",
  count: "Count",
  attempts: "Attempts",
  purpose: "Purpose",
  category: "Category",
  decision: "Decision",
  toPosition: "Recommended position",
  fromPosition: "Applied position",
  onBehalfOfHod: "On behalf of HOD",
  rows: "Rows",
  format: "Format",
};

/** Human-readable label for a metadata key ("hodId" -> "Hod"). */
export function metaKeyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const s = key
    .replace(/Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
