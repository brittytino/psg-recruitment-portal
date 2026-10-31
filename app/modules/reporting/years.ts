/**
 * Recruitment years. Every vacancy belongs to an academic year (June to May, IST): its own
 * `academicYear`, or the year of its opening date. Applications follow their vacancy. The current
 * year is "live"; earlier years are archived automatically, with nothing deleted or moved, so the
 * portal keeps working year after year.
 */
import { academicYearOf } from "~/modules/applications/reference";

export const YEAR_PATTERN = /^\d{4}-\d{2}$/;

/** "2026-27" → "Recruitment 2026–27". */
export const recruitmentName = (year: string) => `Recruitment ${year.replace("-", "–")}`;

/** First and last instant (exclusive) of an academic year, e.g. 1 June 2026 IST to 1 June 2027 IST. */
export function yearRange(year: string): { from: Date; to: Date } {
  const start = Number(year.slice(0, 4));
  return {
    from: new Date(`${start}-06-01T00:00:00+05:30`),
    to: new Date(`${start + 1}-06-01T00:00:00+05:30`),
  };
}

export const currentYear = (now = new Date()) => academicYearOf(now);

/** Year of a vacancy: its stored value when valid, otherwise derived from the opening date. */
export const yearOfVacancy = (v: { academicYear: string | null; opensAt: Date | string }) =>
  v.academicYear && YEAR_PATTERN.test(v.academicYear) ? v.academicYear : academicYearOf(new Date(v.opensAt));
