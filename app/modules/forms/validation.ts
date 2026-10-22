import { z } from "zod";
import {
  formatYearsMonths,
  overlappingPeriods,
  periodDuration,
  totalDuration,
  type Period,
} from "./experience";
import { allFields, isScalar } from "./registry";
import type {
  Answers,
  Condition,
  FieldDef,
  FormDefinition,
  ScalarField,
  SectionDef,
  TableRow,
  UploadGroup,
} from "./types";

export type ValidationMode = "draft" | "submit";

export interface FieldIssue {
  /** Path such as `name`, `experience.2.employer` or `internationalJournals.4`. */
  path: string;
  sectionId: string;
  message: string;
}

const MONTH_YEAR = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function validDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** True when a field's condition holds against the given values (top-level answers or a row). */
export function conditionMet(when: Condition | undefined, values: Record<string, unknown>): boolean {
  if (!when) return true;
  const v = values[when.key];
  return typeof v === "string" && when.in.includes(v);
}

/** Validates one scalar value. Returns an error message or null. */
export function checkScalar(
  f: ScalarField,
  v: unknown,
  mode: ValidationMode,
  required: boolean,
): string | null {
  if (f.kind === "derived") return null;
  if (isEmpty(v)) return mode === "submit" && required ? `${f.label} is required` : null;
  switch (f.kind) {
    case "text":
    case "textarea": {
      if (typeof v !== "string") return `${f.label} must be text`;
      if (f.maxLength && v.length > f.maxLength)
        return `${f.label} must be at most ${f.maxLength} characters`;
      if (f.kind === "text" && f.pattern && !new RegExp(f.pattern.regex).test(v.trim()))
        return f.pattern.message;
      return null;
    }
    case "date":
      return typeof v === "string" && validDate(v) ? null : `${f.label} must be a valid date`;
    case "monthYear":
      return typeof v === "string" && MONTH_YEAR.test(v) ? null : `${f.label} must be a month and year`;
    case "number": {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return `${f.label} must be a number`;
      if (f.integer && !Number.isInteger(n)) return `${f.label} must be a whole number`;
      if (f.min !== undefined && n < f.min) return `${f.label} must be at least ${f.min}`;
      if (f.max !== undefined && n > f.max) return `${f.label} must be at most ${f.max}`;
      return null;
    }
    case "select": {
      if (f.allowOther) {
        if (typeof v !== "string") return `${f.label} must be text`;
        const otherVal = f.otherOptionValue ?? "Others";
        if (v === otherVal) {
          return mode === "submit" ? `Please specify your ${f.label.toLowerCase()}` : null;
        }
        if (f.otherMaxLength && v.length > f.otherMaxLength) {
          return `${f.label} must be at most ${f.otherMaxLength} characters`;
        }
        return null;
      }
      return f.options.some((o) => o.value === v) ? null : `${f.label} has an invalid choice`;
    }
  }
}

const isRequired = (f: FieldDef) => f.requirement === "required";

function checkField(
  f: FieldDef,
  value: unknown,
  mode: ValidationMode,
  section: SectionDef,
  answers: Record<string, unknown>,
  issues: FieldIssue[],
) {
  const push = (path: string, message: string) => issues.push({ path, sectionId: section.id, message });
  // Hidden by a condition: the value is ignored (kept in the draft, not validated).
  if (!conditionMet(f.when, answers)) return;
  if (isScalar(f)) {
    const msg = checkScalar(f, value, mode, isRequired(f));
    if (msg) push(f.key, msg);
    return;
  }
  if (f.kind === "list") {
    const items = value === undefined || value === null ? [] : value;
    if (!Array.isArray(items)) return push(f.key, `${f.label} must be a list`);
    if (items.length > f.maxItems) push(f.key, `${f.label}: at most ${f.maxItems} entries`);
    if (mode === "submit" && isRequired(f) && items.length === 0) push(f.key, `${f.label} is required`);
    items.forEach((it, i) => {
      if (typeof it !== "string") return push(`${f.key}.${i}`, `${f.itemLabel} ${i + 1} must be text`);
      if (it.length > f.itemMaxLength)
        push(`${f.key}.${i}`, `${f.itemLabel} ${i + 1} must be at most ${f.itemMaxLength} characters`);
      if (mode === "submit" && it.trim() === "")
        push(`${f.key}.${i}`, `${f.itemLabel} ${i + 1} is empty — remove it or fill it in`);
    });
    return;
  }
  // table
  const rows = value === undefined || value === null ? [] : value;
  if (!Array.isArray(rows)) return push(f.key, `${f.label} must be a table`);
  if (rows.length > f.maxRows) push(f.key, `${f.label}: at most ${f.maxRows} entries`);
  const minRows = f.minRows ?? (isRequired(f) ? 1 : 0);
  if (mode === "submit" && rows.length < minRows)
    push(f.key, `${f.label}: add at least ${minRows} entr${minRows === 1 ? "y" : "ies"}`);
  const item = f.itemLabel ?? "Row";
  rows.forEach((row, i) => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return push(`${f.key}.${i}`, `${item} ${i + 1} is invalid`);
    const r = row as Record<string, unknown>;
    for (const c of f.columns) {
      if (!conditionMet(c.when, r)) continue;
      const msg = checkScalar(c, r[c.key], mode, isRequired(c));
      if (msg) push(`${f.key}.${i}.${c.key}`, `${item} ${i + 1}: ${msg}`);
    }
    const allowedKeys = new Set([
      ...f.columns.map((c) => c.key),
      ...(f.attachment ? ["documentId", "documentName", "documentType"] : []),
    ]);
    for (const k of Object.keys(r))
      if (!allowedKeys.has(k)) push(`${f.key}.${i}.${k}`, `${item} ${i + 1}: unknown column`);

    if (mode === "submit" && f.attachment?.required) {
      const docId = r.documentId;
      if (!docId || typeof docId !== "string" || !docId.trim()) {
        push(
          `${f.key}.${i}.documentId`,
          `${item} ${i + 1}: Please upload the required ${f.attachment.label ?? "supporting document"}`,
        );
      }
    }
  });
}

const rowsOf = (a: Record<string, unknown>, k: string): TableRow[] =>
  Array.isArray(a[k]) ? (a[k] as TableRow[]).filter((r) => r && typeof r === "object") : [];

/** Cross-field rules that the source forms imply. */
function checkCrossField(def: FormDefinition, a: Answers, mode: ValidationMode, issues: FieldIssue[]) {
  const today = new Date().toISOString().slice(0, 10);
  const dob = a.dateOfBirth;
  if (typeof dob === "string" && validDate(dob) && dob >= today)
    issues.push({ path: "dateOfBirth", sectionId: "personal", message: "Date of birth must be in the past" });
  for (const key of ["experience", "jobsHeld"]) {
    const rows = rowsOf(a, key);
    const sectionId = key === "jobsHeld" ? "jobs" : "experience";
    rows.forEach((r, i) => {
      const current = r.isCurrent === "Yes";
      if (
        typeof r.from === "string" &&
        typeof r.to === "string" &&
        r.from &&
        r.to &&
        !current &&
        r.to < r.from
      )
        issues.push({
          path: `${key}.${i}.to`,
          sectionId,
          message: `Position ${i + 1}: "To" date is before "From" date`,
        });
      if (def.version >= 2) {
        if (typeof r.from === "string" && r.from > today)
          issues.push({
            path: `${key}.${i}.from`,
            sectionId,
            message: `Position ${i + 1}: "From" date is in the future`,
          });
        if (!current && typeof r.to === "string" && r.to > today)
          issues.push({
            path: `${key}.${i}.to`,
            sectionId,
            message: `Position ${i + 1}: "To" date is in the future`,
          });
        if (typeof dob === "string" && validDate(dob) && typeof r.from === "string" && validDate(r.from)) {
          const adult = `${Number(dob.slice(0, 4)) + 18}${dob.slice(4)}`;
          if (r.from < adult)
            issues.push({
              path: `${key}.${i}.from`,
              sectionId,
              message: `Position ${i + 1}: the start date is before your 18th birthday`,
            });
        }
      }
    });
  }
  if (def.code === "ASSOCIATE_PROFESSOR" && def.version === 1) {
    if (mode === "submit" && a.maritalStatus === "Y" && isEmpty(a.spouseNameOccupation))
      issues.push({
        path: "spouseNameOccupation",
        sectionId: "family",
        message: "Name and occupation of spouse is required when married",
      });
    const levels = rowsOf(a, "educationalQualifications").map((r) => r.level);
    const dup = levels.find((l, i) => l && levels.indexOf(l) !== i);
    if (dup)
      issues.push({
        path: "educationalQualifications",
        sectionId: "education",
        message: `Only one entry per level is printed on the form (duplicate: ${String(dup)})`,
      });
  }
  if (def.version >= 2 && mode === "submit") {
    const levels = rowsOf(a, "collegeQualifications").map((r) => r.level);
    for (const [lvl, label] of [
      ["UG", "an under-graduate (UG)"],
      ["PG", "a post-graduate (PG)"],
    ] as const)
      if (!levels.includes(lvl))
        issues.push({
          path: "collegeQualifications",
          sectionId: "college",
          message: `Add ${label} degree`,
        });
    rowsOf(a, "collegeQualifications").forEach((r, i) => {
      if (
        typeof r.scoreType === "string" &&
        r.scoreType.startsWith("CGPA") &&
        typeof r.score === "number" &&
        r.score > 10
      )
        issues.push({
          path: `collegeQualifications.${i}.score`,
          sectionId: "college",
          message: `Qualification ${i + 1}: CGPA must be 10 or less`,
        });
    });
    const current = rowsOf(a, "experience").some((r) => r.isCurrent === "Yes");
    if (current && a.currentlyEmployed === "No")
      issues.push({
        path: "currentlyEmployed",
        sectionId: "experience",
        message: 'You marked a position as current — answer "Yes" to "Are you currently employed?"',
      });
  }
}

/**
 * Validates answers against a form definition.
 * `draft` mode checks types and lengths only; `submit` also enforces required fields.
 * Unknown top-level keys are always rejected so stored JSON matches the definition.
 */
export function validateAnswers(def: FormDefinition, answers: unknown, mode: ValidationMode): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const parsed = z.record(z.string(), z.unknown()).safeParse(answers);
  if (!parsed.success) return [{ path: "", sectionId: "", message: "Answers must be an object" }];
  const a = parsed.data;
  const known = new Set(allFields(def).map((f) => f.key));
  for (const k of Object.keys(a))
    if (!known.has(k)) issues.push({ path: k, sectionId: "", message: `Unknown field "${k}"` });
  for (const s of def.sections) for (const f of s.fields) checkField(f, a[f.key], mode, s, a, issues);
  checkCrossField(def, a as Answers, mode, issues);
  return issues;
}

/** Computes age in completed years on a reference date (YYYY-MM-DD). */
export function ageOn(dob: string, on: string): number | null {
  if (!validDate(dob) || !validDate(on)) return null;
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [y, m, d] = on.split("-").map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

/** Experience periods from a v2 answers object. */
export function experiencePeriods(a: Answers, nature?: string): Partial<Period>[] {
  return rowsOf(a, "experience")
    .filter((r) => !nature || r.nature === nature)
    .map((r) => ({
      from: typeof r.from === "string" ? r.from : undefined,
      to: r.isCurrent === "Yes" ? null : typeof r.to === "string" ? r.to : null,
    }));
}

/** First day of the month the earliest PG degree was completed, if known. */
export function pgCompletion(a: Answers): string | undefined {
  const pg = rowsOf(a, "collegeQualifications")
    .filter((r) => r.level === "PG" && typeof r.monthYear === "string" && MONTH_YEAR.test(r.monthYear))
    .map((r) => `${r.monthYear}-01`)
    .sort();
  return pg[0];
}

export interface DerivedContext {
  department: string;
  position?: string;
  asOf: string;
}

/** Value of a derived field (server and UI use the same rules). */
export function derivedValue(derivedFrom: string, a: Answers, ctx: DerivedContext): string | number | null {
  switch (derivedFrom) {
    case "vacancy.department":
      return ctx.department;
    case "vacancy.position":
      return ctx.position ?? null;
    case "dateOfBirth":
      return typeof a.dateOfBirth === "string" ? ageOn(a.dateOfBirth, ctx.asOf) : null;
    case "today":
      return ctx.asOf;
    case "experience.total":
      return formatYearsMonths(totalDuration(experiencePeriods(a), ctx.asOf));
    case "experience.teaching":
      return formatYearsMonths(totalDuration(experiencePeriods(a, "Teaching"), ctx.asOf));
    case "experience.industry":
      return formatYearsMonths(totalDuration(experiencePeriods(a, "Industry"), ctx.asOf));
    case "experience.afterPg": {
      const pg = pgCompletion(a);
      return pg ? formatYearsMonths(totalDuration(experiencePeriods(a), ctx.asOf, pg)) : null;
    }
    case "count.collegeOthers":
      return rowsOf(a, "collegeQualifications").filter((r) => r.level === "DIPLOMA" || r.level === "OTHER")
        .length;
    default:
      return null;
  }
}

/** Duration of one experience row, e.g. "3 years 7 months". */
export function rowDuration(r: TableRow, asOf: string): string {
  return formatYearsMonths(
    periodDuration(
      {
        from: typeof r.from === "string" ? r.from : undefined,
        to: r.isCurrent === "Yes" ? null : typeof r.to === "string" ? r.to : null,
      },
      asOf,
    ),
  );
}

/** Rows of the experience table that overlap another row (warning only). */
export function experienceOverlaps(a: Answers, asOf: string): number[] {
  return overlappingPeriods(experiencePeriods(a), asOf);
}

/** All derived top-level values for a form. */
export function computeDerived(
  def: FormDefinition,
  a: Answers,
  ctx: DerivedContext,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const f of allFields(def)) if (f.kind === "derived") out[f.key] = derivedValue(f.derivedFrom, a, ctx);
  return out;
}

/** Strips derived fields from candidate input — those are computed by the server. */
export function stripDerived(def: FormDefinition, answers: Answers): Answers {
  const out: Answers = {};
  for (const f of allFields(def))
    if (f.kind !== "derived" && answers[f.key] !== undefined) out[f.key] = answers[f.key]!;
  return out;
}

/** Applies server-computed derived values (department, age, experience totals) at a reference date. */
export function withDerived(def: FormDefinition, answers: Answers, ctx: DerivedContext): Answers {
  return { ...answers, ...computeDerived(def, answers, ctx) };
}

/** True when an upload group is mandatory for these answers. */
export function uploadRequired(g: UploadGroup, a: Answers): boolean {
  if (g.required === true) return true;
  if (g.required === false) return false;
  if (g.required === "hasExperience") return rowsOf(a, "experience").length > 0;
  return conditionMet(g.required, a);
}

/** Section completion summary for progress indicators. */
export function sectionStatus(
  def: FormDefinition,
  answers: Answers,
): { id: string; title: string; complete: boolean; issues: number }[] {
  const issues = validateAnswers(def, answers, "submit");
  return def.sections.map((s) => {
    const n = issues.filter((i) => i.sectionId === s.id).length;
    return { id: s.id, title: s.title, complete: n === 0, issues: n };
  });
}
