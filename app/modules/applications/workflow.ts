/**
 * Application recruitment-status state machine (pure, shared by server and UI).
 * Document processing has its own status (ProcessingStatus) and never changes recruitment state.
 * The model is an initial proposal pending review against college policy (docs/architecture/application-workflow.md).
 */
export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_HR_REVIEW",
  "UNDER_DEPARTMENT_REVIEW",
  "NEEDS_CLARIFICATION",
  "SHORTLISTED",
  "REJECTED",
  "APPROVED",
  "WITHDRAWN",
] as const;
export type AppStatus = (typeof APPLICATION_STATUSES)[number];

export type Actor = "candidate" | "hr";

export interface Transition {
  from: AppStatus;
  to: AppStatus;
  actor: Actor;
  label: string;
  reasonRequired: boolean;
  /** Extra precondition, evaluated by the service. */
  requires?: "documentsReady" | "departmentReview";
}

export const TRANSITIONS: readonly Transition[] = [
  { from: "DRAFT", to: "SUBMITTED", actor: "candidate", label: "Submit application", reasonRequired: false },
  { from: "NEEDS_CLARIFICATION", to: "SUBMITTED", actor: "candidate", label: "Resubmit application", reasonRequired: false },
  { from: "DRAFT", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: false },
  { from: "SUBMITTED", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: true },
  { from: "UNDER_HR_REVIEW", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: true },
  { from: "UNDER_DEPARTMENT_REVIEW", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: true },
  { from: "NEEDS_CLARIFICATION", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: true },
  { from: "SHORTLISTED", to: "WITHDRAWN", actor: "candidate", label: "Withdraw", reasonRequired: true },

  { from: "SUBMITTED", to: "UNDER_HR_REVIEW", actor: "hr", label: "Start HR screening", reasonRequired: false },
  { from: "UNDER_HR_REVIEW", to: "NEEDS_CLARIFICATION", actor: "hr", label: "Return to candidate for clarification", reasonRequired: true },
  { from: "UNDER_HR_REVIEW", to: "UNDER_DEPARTMENT_REVIEW", actor: "hr", label: "Forward to department review", reasonRequired: false, requires: "documentsReady" },
  { from: "UNDER_HR_REVIEW", to: "REJECTED", actor: "hr", label: "Reject at screening", reasonRequired: true },
  { from: "UNDER_DEPARTMENT_REVIEW", to: "UNDER_HR_REVIEW", actor: "hr", label: "Return to HR screening", reasonRequired: true },
  { from: "UNDER_DEPARTMENT_REVIEW", to: "SHORTLISTED", actor: "hr", label: "Shortlist", reasonRequired: false, requires: "departmentReview" },
  { from: "UNDER_DEPARTMENT_REVIEW", to: "REJECTED", actor: "hr", label: "Reject after department review", reasonRequired: true, requires: "departmentReview" },
  { from: "SHORTLISTED", to: "APPROVED", actor: "hr", label: "Record approval (selected)", reasonRequired: true },
  { from: "SHORTLISTED", to: "REJECTED", actor: "hr", label: "Record rejection", reasonRequired: true },
];

export const TERMINAL: readonly AppStatus[] = ["REJECTED", "APPROVED", "WITHDRAWN"];

export function findTransition(from: AppStatus, to: AppStatus, actor: Actor): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to && t.actor === actor);
}

export function availableTransitions(from: AppStatus, actor: Actor): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actor === actor);
}

/** Statuses in which the candidate may edit answers and documents. */
export const EDITABLE: readonly AppStatus[] = ["DRAFT", "NEEDS_CLARIFICATION"];

export const STATUS_LABELS: Record<AppStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_HR_REVIEW: "Under HR screening",
  UNDER_DEPARTMENT_REVIEW: "Under department review",
  NEEDS_CLARIFICATION: "Clarification requested",
  SHORTLISTED: "Shortlisted",
  REJECTED: "Not selected",
  APPROVED: "Selected",
  WITHDRAWN: "Withdrawn",
};

export const PROCESSING_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  QUEUED: "Queued",
  PROCESSING: "Generating PDF",
  READY: "PDF ready",
  FAILED: "PDF failed",
};
