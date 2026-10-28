/**
 * Application reference numbers: "PSGCT" + academic year + department short code + "_" + 4-digit
 * running number per academic year and department, e.g. PSGCT2026-27CSE_0001 (ADR 0007).
 */

/** Academic year (June–May, India Standard Time) containing a date, e.g. "2026-27". */
export function academicYearOf(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 5 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const ACADEMIC_YEAR = /^\d{4}-\d{2}$/;

/** Department short code as used in references: upper-case letters and digits only. */
export function referenceDeptCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "") || "GEN";
}

export function formatReference(academicYear: string, deptCode: string, n: number): string {
  return `PSGCT${academicYear}${referenceDeptCode(deptCode)}_${String(n).padStart(4, "0")}`;
}

/** Research appointment reference number: PSGCT<year>RA_<NNNN> */
export function formatResearchReference(academicYear: string, n: number): string {
  return `PSGCT${academicYear}RA_${String(n).padStart(4, "0")}`;
}

export const RESEARCH_REFERENCE = /^PSGCT\d{4}-\d{2}RA_\d{4}$/;

export function parseResearchReference(ref: string): { academicYear: string; sequence: number } | null {
  const match = ref.match(/^PSGCT(\d{4}-\d{2})RA_(\d{4})$/);
  if (!match || !match[1] || !match[2]) return null;
  return { academicYear: match[1], sequence: parseInt(match[2], 10) };
}


