/**
 * Canonical form-definition contract.
 *
 * Every field of the official DOCX application forms is declared exactly once in a
 * form definition. The same definition drives: the candidate UI, server-side Zod
 * validation, the stored JSONB answer shape, DOCX population and the field inventory
 * document (`npm run forms:inventory`).
 */

import type { DocType } from "~/modules/documents/policy";

export type FormCode = "ASSISTANT_PROFESSOR" | "ASSOCIATE_PROFESSOR";

/** Requirement status. `policy` = awaiting institutional confirmation; treated as optional. */
export type Requirement = "required" | "optional" | "policy";

export interface SourceRef {
  /** Page number in the original document (1-based, as printed / as rendered by Word). */
  page: number;
  /** Exact label text as it appears in the source document. */
  label: string;
}

export interface TableAttachmentConfig {
  required?: boolean;
  label?: string;
  docType?: DocType;
  allowedDocTypes?: readonly DocType[];
  help?: string;
}

/**
 * Shows (and validates) a field only when another answer has one of the listed values. For table
 * columns `key` refers to a sibling column in the same row; otherwise to a top-level field.
 */
export interface Condition {
  key: string;
  in: readonly string[];
}

interface BaseField {
  key: string;
  label: string;
  source: SourceRef;
  requirement: Requirement;
  help?: string;
  when?: Condition;
  /** Spans the full width of the form grid (long text inputs). */
  wide?: boolean;
}

export interface TextField extends BaseField {
  kind: "text";
  maxLength?: number;
  /** Rendered in upper case (e.g. "In Block Letters"). */
  uppercase?: boolean;
  pattern?: { regex: string; message: string };
  inputMode?: "email" | "tel" | "numeric" | "text";
}

export interface TextAreaField extends BaseField {
  kind: "textarea";
  maxLength?: number;
  rows?: number;
}

export interface DateField extends BaseField {
  kind: "date";
}

export interface MonthYearField extends BaseField {
  kind: "monthYear";
}

export interface NumberField extends BaseField {
  kind: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  placeholder?: string;
}

export interface SelectField extends BaseField {
  kind: "select";
  options: { value: string; label: string }[];
  /** When true, selecting an "other" option displays a text input allowing custom text. */
  allowOther?: boolean;
  otherOptionValue?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
  otherMaxLength?: number;
}

/** Read-only field whose value is derived (e.g. age from date of birth, department from vacancy). */
export interface DerivedField extends BaseField {
  kind: "derived";
  derivedFrom: string;
}

export type ScalarField =
  TextField | TextAreaField | DateField | MonthYearField | NumberField | SelectField | DerivedField;

export interface TableField extends BaseField {
  kind: "table";
  columns: ScalarField[];
  /** Blank rows printed in the official template. More entries are rendered as additional rows. */
  templateRows: number;
  minRows?: number;
  maxRows: number;
  attachment?: TableAttachmentConfig;
  /** Name of one entry, e.g. "Journal paper" (used for "Add journal paper"). */
  itemLabel?: string;
  /** Shows a live total, e.g. "Total journal papers". */
  countLabel?: string;
}

/** A list of free-text entries (e.g. journal papers written in blank lines of the source). */
export interface ListField extends BaseField {
  kind: "list";
  itemLabel: string;
  itemMaxLength: number;
  maxItems: number;
  /** Capacity of the official template before continuation rows/paragraphs are added. */
  templateCapacity: number;
}

export type FieldDef = ScalarField | TableField | ListField;

export interface SectionDef {
  id: string;
  title: string;
  /** Exact heading/numbering text in the source, when a heading exists. */
  sourceHeading?: string;
  pages: number[];
  description?: string;
  fields: FieldDef[];
  /** "uploads" renders the document upload groups of the form instead of fields. */
  kind?: "fields" | "uploads";
}

/** A group of standalone uploads on the documents step of a v2 form. */
export interface UploadGroup {
  id: string;
  title: string;
  help: string;
  types: readonly DocType[];
  /** Mandatory always, never, or when a condition on the answers holds. */
  required: boolean | Condition | "hasExperience";
  /** At most one file (photograph, signature, resume). */
  single?: boolean;
}

export interface FormDefinition {
  code: FormCode;
  version: number;
  title: string;
  sourceDocument: string;
  /** DOCX template (v1). Forms rendered directly to PDF (v2) have no template file. */
  templatePath: string;
  /** "docx" fills the official Word template; "pdf" draws the application directly (v2). */
  renderer?: "docx" | "pdf";
  /** Page count of the original template as rendered by Word (docProps/app.xml). */
  sourcePageCount: number;
  sections: SectionDef[];
  /** Standalone upload groups (v2 forms). */
  uploads?: UploadGroup[];
  /** Static content preserved verbatim (instructions, declarations, endorsement blocks). */
  preservedText: { id: string; page: number; text: string; note: string }[];
}

export type ScalarValue = string | number | null;
export type TableRow = Record<string, ScalarValue>;
export type AnswerValue = ScalarValue | TableRow[] | string[];
export type Answers = Record<string, AnswerValue>;
