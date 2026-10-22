/**
 * Experience duration calculation (pure; shared by the form UI, validation, PDF and reports).
 *
 * Durations are whole calendar months. The end date is inclusive: 01-06-2020 to 31-05-2023 is
 * exactly 3 years. Totals merge overlapping periods so concurrent positions are not counted twice.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface Period {
  from: string;
  /** Inclusive end date; null or empty for a current position. */
  to: string | null;
}

export interface YearsMonths {
  years: number;
  months: number;
  totalMonths: number;
}

const isDate = (s: unknown): s is string =>
  typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Day after an ISO date (handles month and year ends, leap years). */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whole months from `start` (inclusive) to `endExclusive`. */
function monthsBetween(start: string, endExclusive: string): number {
  const [y1, m1, d1] = start.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = endExclusive.split("-").map(Number) as [number, number, number];
  const n = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(0, n);
}

export function splitMonths(totalMonths: number): YearsMonths {
  const t = Math.max(0, Math.floor(totalMonths));
  return { years: Math.floor(t / 12), months: t % 12, totalMonths: t };
}

/** Duration of one period, or null when the dates are missing or reversed. */
export function periodDuration(p: Partial<Period>, today: string): YearsMonths | null {
  if (!isDate(p.from)) return null;
  const to = isDate(p.to) ? p.to : today;
  if (to < p.from) return null;
  return splitMonths(monthsBetween(p.from, nextDay(to)));
}

/** "3 years 7 months", "11 months", "0 months". */
export function formatYearsMonths(d: YearsMonths | null): string {
  if (!d) return "";
  const y = d.years ? `${d.years} year${d.years === 1 ? "" : "s"}` : "";
  const m = d.months || !d.years ? `${d.months} month${d.months === 1 ? "" : "s"}` : "";
  return [y, m].filter(Boolean).join(" ");
}

/**
 * Total experience across periods with overlaps merged. `notBefore` clips periods that started
 * earlier (used for "experience after PG").
 */
export function totalDuration(periods: Partial<Period>[], today: string, notBefore?: string): YearsMonths {
  const ranges: [string, string][] = [];
  for (const p of periods) {
    if (!isDate(p.from)) continue;
    let start = p.from;
    const end = nextDay(isDate(p.to) ? p.to : today);
    if (notBefore && isDate(notBefore) && start < notBefore) start = notBefore;
    if (end <= start) continue;
    ranges.push([start, end]);
  }
  ranges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let months = 0;
  let cur: [string, string] | null = null;
  for (const r of ranges) {
    if (cur && r[0] <= cur[1]) {
      if (r[1] > cur[1]) cur[1] = r[1];
      continue;
    }
    if (cur) months += monthsBetween(cur[0], cur[1]);
    cur = [r[0], r[1]];
  }
  if (cur) months += monthsBetween(cur[0], cur[1]);
  return splitMonths(months);
}

/** Indexes of periods that overlap another period (shown to the candidate as a warning). */
export function overlappingPeriods(periods: Partial<Period>[], today: string): number[] {
  const out = new Set<number>();
  const ranges = periods.map((p) =>
    isDate(p.from) ? ([p.from, isDate(p.to) ? p.to : today] as const) : null,
  );
  ranges.forEach((a, i) =>
    ranges.forEach((b, j) => {
      if (!a || !b || i >= j) return;
      if (a[0] <= b[1] && b[0] <= a[1]) {
        out.add(i);
        out.add(j);
      }
    }),
  );
  return [...out].sort((x, y) => x - y);
}
