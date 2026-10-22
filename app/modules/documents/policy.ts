/**
 * Attachment policy (docs/security/file-upload-policy.md). Shared by server and UI.
 * The type is determined from file signatures (magic bytes) on the server; the browser-supplied
 * filename and MIME type are never trusted.
 */
export const DOCUMENT_TYPES = [
  "PHOTOGRAPH",
  "DEGREE_CERTIFICATE",
  "MARK_SHEET",
  "PHD_CERTIFICATE",
  "EXPERIENCE_CERTIFICATE",
  "SALARY_CERTIFICATE",
  "COMMUNITY_CERTIFICATE",
  "PUBLICATIONS",
  "NO_OBJECTION_CERTIFICATE",
  "OTHER",
  "SIGNATURE",
  "RESUME",
  "APPOINTMENT_ORDER",
  "SALARY_SLIP",
  "SERVICE_CERTIFICATE",
  "MEMBERSHIP_CERTIFICATE",
  "PUBLICATION_PROOF",
  "COMPETITIVE_EXAM_SCORECARD",
] as const;
export type DocType = (typeof DOCUMENT_TYPES)[number];

export const QUALIFICATION_DOC_TYPES: readonly DocType[] = [
  "DEGREE_CERTIFICATE",
  "MARK_SHEET",
  "PHD_CERTIFICATE",
];

export const EXPERIENCE_DOC_TYPES: readonly DocType[] = ["EXPERIENCE_CERTIFICATE"];

export const INLINE_ENTRY_DOC_TYPES: readonly DocType[] = [
  ...QUALIFICATION_DOC_TYPES,
  ...EXPERIENCE_DOC_TYPES,
];

/** Types offered on the v1 documents page (v2 forms use their own upload groups). */
export const STANDALONE_DOCUMENT_TYPES: readonly DocType[] = [
  "PHOTOGRAPH",
  "SALARY_CERTIFICATE",
  "COMMUNITY_CERTIFICATE",
  "PUBLICATIONS",
  "NO_OBJECTION_CERTIFICATE",
  "OTHER",
];

export const DOCUMENT_TYPE_LABELS: Record<DocType, string> = {
  PHOTOGRAPH: "Passport size photograph",
  DEGREE_CERTIFICATE: "Degree certificates (attested copies)",
  MARK_SHEET: "Mark sheets",
  PHD_CERTIFICATE: "Ph.D. degree / provisional certificate",
  EXPERIENCE_CERTIFICATE: "Experience certificates / testimonials",
  SALARY_CERTIFICATE: "Last drawn salary certificate",
  COMMUNITY_CERTIFICATE: "Community certificate",
  PUBLICATIONS: "Publications (first pages / list)",
  NO_OBJECTION_CERTIFICATE: "No objection certificate from present employer",
  OTHER: "Other supporting documents",
  SIGNATURE: "Signature of the candidate",
  RESUME: "Resume / CV",
  APPOINTMENT_ORDER: "Appointment order",
  SALARY_SLIP: "Last drawn salary certificate / salary slip",
  SERVICE_CERTIFICATE: "Service / experience certificate (present employer)",
  MEMBERSHIP_CERTIFICATE: "Professional membership certificates",
  PUBLICATION_PROOF: "Publication proofs (first page / acceptance)",
  COMPETITIVE_EXAM_SCORECARD: "GATE / NET / SET score card",
};

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

const IMAGES: readonly AllowedMime[] = ["image/jpeg", "image/png"];
const PDF_ONLY: readonly AllowedMime[] = ["application/pdf"];
const ANY: readonly AllowedMime[] = ["application/pdf", "image/jpeg", "image/png"];

/** Photograph and signature are printed on the application, so they must be images. */
export const IMAGE_ONLY_TYPES: readonly DocType[] = ["PHOTOGRAPH", "SIGNATURE"];

export function allowedMime(type: DocType): readonly AllowedMime[] {
  if (IMAGE_ONLY_TYPES.includes(type)) return IMAGES;
  if (type === "RESUME") return PDF_ONLY;
  return ANY;
}

/** Order of attachments in the consolidated bundle, after the application form itself. */
export const BUNDLE_ORDER: readonly DocType[] = [
  "RESUME",
  "DEGREE_CERTIFICATE",
  "MARK_SHEET",
  "PHD_CERTIFICATE",
  "EXPERIENCE_CERTIFICATE",
  "SERVICE_CERTIFICATE",
  "APPOINTMENT_ORDER",
  "SALARY_SLIP",
  "SALARY_CERTIFICATE",
  "NO_OBJECTION_CERTIFICATE",
  "COMPETITIVE_EXAM_SCORECARD",
  "PUBLICATION_PROOF",
  "PUBLICATIONS",
  "MEMBERSHIP_CERTIFICATE",
  "COMMUNITY_CERTIFICATE",
  "OTHER",
];

/** Printed on the application itself, never appended to the bundle as attachments. */
export const PRINTED_TYPES: readonly DocType[] = ["PHOTOGRAPH", "SIGNATURE"];

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILES_PER_TYPE = 10;

/** Produces a safe display name (no path, control or markup characters). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(0, 120);
}
