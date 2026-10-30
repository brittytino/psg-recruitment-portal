/**
 * Help desk vocabulary, shared by the server and the pages. Categories live here only: add or
 * rename one in this file and every form, filter and report picks it up.
 */
export const TICKET_CATEGORIES = {
  ACCOUNT_LOGIN: {
    label: "Account and sign-in code",
    subs: ["Sign-in code not received", "Code not accepted", "Cannot sign in", "Other"],
  },
  REGISTRATION: {
    label: "Registration and profile",
    subs: ["Cannot create an account", "Change name or details", "E-mail address", "Other"],
  },
  APPLICATION_FORM: {
    label: "Application form",
    subs: ["A field will not save", "Cannot find a field or section", "Wrong information entered", "Other"],
  },
  DOCUMENT_UPLOAD: {
    label: "Document upload",
    subs: ["Upload fails", "File too large", "PDF not accepted", "Photograph or signature", "Other"],
  },
  APPLICATION_PDF: {
    label: "Application PDF and download",
    subs: ["Preview not showing", "Download fails", "Details missing in the PDF", "Other"],
  },
  SUBMISSION: {
    label: "Application submission",
    subs: ["Cannot submit", "Submitted by mistake", "Did not receive the confirmation", "Other"],
  },
  VACANCY: {
    label: "Vacancy and job profile",
    subs: ["Eligibility", "Last date", "Department or position", "Other"],
  },
  STATUS: {
    label: "Application status",
    subs: ["What does my status mean", "No update yet", "Interview", "Other"],
  },
  TECHNICAL: { label: "Technical error", subs: ["Error message on screen", "Page does not load", "Other"] },
  BROWSER: { label: "Website or browser issue", subs: ["Mobile phone", "Display problem", "Other"] },
  GENERAL: { label: "General recruitment enquiry", subs: [] },
  OTHER: { label: "Other", subs: [] },
} as const;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(TICKET_CATEGORIES) as TicketCategory[];
export const categoryLabel = (c: string) => TICKET_CATEGORIES[c as TicketCategory]?.label ?? c;

/** How the candidate describes the urgency. Staff set the operational priority separately. */
export const CANDIDATE_URGENCY = [
  "It stops me from submitting before the last date",
  "It slows me down but I can continue",
  "A question, no deadline involved",
] as const;

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_CANDIDATE", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_CANDIDATE: "Awaiting your response",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
/** Staff see "Awaiting candidate" where candidates see "Awaiting your response". */
export const STAFF_STATUS_LABEL: Record<TicketStatus, string> = {
  ...STATUS_LABEL,
  AWAITING_CANDIDATE: "Awaiting candidate",
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * Status changes staff may make. Resolving or closing needs a resolution summary. Candidates never
 * set a status directly: replying to an "awaiting" ticket returns it to the team, and replying to a
 * resolved ticket reopens it (see service.server.ts).
 */
export const STAFF_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "AWAITING_CANDIDATE", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["AWAITING_CANDIDATE", "RESOLVED", "CLOSED"],
  AWAITING_CANDIDATE: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["IN_PROGRESS"],
};
export const NEEDS_SUMMARY: readonly TicketStatus[] = ["RESOLVED", "CLOSED"];
/** A resolved ticket can be reopened by the candidate for this many days. */
export const REOPEN_DAYS = 14;

export const TICKET_LIMITS = {
  subject: { min: 8, max: 150 },
  body: { min: 20, max: 5000 },
  reply: { min: 2, max: 5000 },
  attachments: 3,
  attachmentMb: 10,
} as const;
export const ATTACHMENT_TYPES_LABEL = "PDF, JPG or PNG";

/** Staff ticket views (left-hand list on the staff help desk). */
export const STAFF_VIEWS = {
  all: "All tickets",
  open: "Open",
  unassigned: "Unassigned",
  mine: "Assigned to me",
  awaiting: "Awaiting candidate",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
} as const;
export type StaffView = keyof typeof STAFF_VIEWS;

/** Help article topics. */
export const ARTICLE_TOPICS = [
  "Sign-in and account",
  "Application form",
  "Documents and uploads",
  "Application PDF",
  "Status and next steps",
  "Technical help",
] as const;
