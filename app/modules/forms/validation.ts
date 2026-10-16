import { z } from "zod";
import { allFields, isScalar } from "./registry";
import type { Answers, FieldDef, FormDefinition, ScalarField, SectionDef } from "./types";

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
    case "select":
      return f.options.some((o) => o.value === v) ? null : `${f.label} has an invalid choice`;
  }
}

const isRequired = (f: FieldDef) => f.requirement === "required";

function checkField(
  f: FieldDef,
  value: unknown,
  mode: ValidationMode,
  section: SectionDef,
  issues: FieldIssue[],
) {
  const push = (path: string, message: string) => issues.push({ path, sectionId: section.id, message });
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
  if (rows.length > f.maxRows) push(f.key, `${f.label}: at most ${f.maxRows} rows`);
  const minRows = f.minRows ?? (isRequired(f) ? 1 : 0);
  if (mode === "submit" && rows.length < minRows)
    push(f.key, `${f.label}: add at least ${minRows} entr${minRows === 1 ? "y" : "ies"}`);
  rows.forEach((row, i) => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return push(`${f.key}.${i}`, `Row ${i + 1} is invalid`);
    const r = row as Record<string, unknown>;
    for (const c of f.columns) {
      const msg = checkScalar(c, r[c.key], mode, isRequired(c));
      if (msg) push(`${f.key}.${i}.${c.key}`, `Row ${i + 1}: ${msg}`);
    }
    for (const k of Object.keys(r))
      if (!f.columns.some((c) => c.key === k)) push(`${f.key}.${i}.${k}`, `Row ${i + 1}: unknown column`);
  });
}

/** Cross-field rules that the source form implies. */
function checkCrossField(def: FormDefinition, a: Answers, mode: ValidationMode, issues: FieldIssue[]) {
  const today = new Date().toISOString().slice(0, 10);
  const dob = a.dateOfBirth;
  if (typeof dob === "string" && validDate(dob) && dob >= today)
    issues.push({ path: "dateOfBirth", sectionId: "personal", message: "Date of birth must be in the past" });
  for (const key of ["experience", "jobsHeld"]) {
    const rows = a[key];
    if (!Array.isArray(rows)) continue;
    rows.forEach((row, i) => {
      if (typeof row !== "object" || row === null) return;
      const r = row as Record<string, unknown>;
      if (typeof r.from === "string" && typeof r.to === "string" && r.from && r.to && r.to < r.from)
        issues.push({
          path: `${key}.${i}.to`,
          sectionId: key === "experience" ? "experience" : "jobs",
          message: `Row ${i + 1}: "To" date is before "From" date`,
        });
    });
  }
  if (
    def.code === "ASSOCIATE_PROFESSOR" &&
    mode === "submit" &&
    a.maritalStatus === "Y" &&
    isEmpty(a.spouseNameOccupation)
  )
    issues.push({
      path: "spouseNameOccupation",
      sectionId: "family",
      message: "Name and occupation of spouse is required when married",
    });
  if (def.code === "ASSOCIATE_PROFESSOR") {
    const levels = Array.isArray(a.educationalQualifications)
      ? (a.educationalQualifications as Record<string, unknown>[]).map((r) => r?.level)
      : [];
    const dup = levels.find((l, i) => l && levels.indexOf(l) !== i);
    if (dup)
      issues.push({
        path: "educationalQualifications",
        sectionId: "education",
        message: `Only one entry per level is printed on the form (duplicate: ${String(dup)})`,
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
  for (const s of def.sections) for (const f of s.fields) checkField(f, a[f.key], mode, s, issues);
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

/** Strips derived fields from candidate input — those are computed by the server. */
export function stripDerived(def: FormDefinition, answers: Answers): Answers {
  const out: Answers = {};
  for (const f of allFields(def))
    if (f.kind !== "derived" && answers[f.key] !== undefined) out[f.key] = answers[f.key]!;
  return out;
}

/** Applies server-computed derived values (department, age) at a reference date. */
export function withDerived(
  def: FormDefinition,
  answers: Answers,
  ctx: { department: string; asOf: string },
): Answers {
  const out: Answers = { ...answers };
  for (const f of allFields(def)) {
    if (f.kind !== "derived") continue;
    if (f.derivedFrom === "vacancy.department") out[f.key] = ctx.department;
    if (f.derivedFrom === "dateOfBirth")
      out[f.key] = typeof answers.dateOfBirth === "string" ? ageOn(answers.dateOfBirth, ctx.asOf) : null;
  }
  return out;
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
