import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, Inbox, type LucideIcon } from "lucide-react";

/** Page title block used by every staff page: eyebrow, title, one-line purpose and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  crumbs,
}: {
  /** Breadcrumb trail before the title, e.g. [["Dashboard", "/staff"]]. */
  crumbs?: [string, string?][];
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted">
            {crumbs.map(([label, to], i) => (
              <span key={label} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                {to ? (
                  <Link to={to} className="text-muted no-underline hover:text-ink">
                    {label}
                  </Link>
                ) : (
                  <span className="text-ink">{label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && !crumbs && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const ACCENTS = {
  brand: "bg-brand-50 text-brand-700",
  blue: "bg-info-50 text-info",
  orange: "bg-warning-50 text-warning",
  green: "bg-success-50 text-success",
  purple: "bg-tile-purple text-[#5b3f99]",
  red: "bg-danger-50 text-danger",
} as const;
export type Accent = keyof typeof ACCENTS;

/** Number tile with an icon bubble; a link when `to` is given (filters the list below). */
export function StatTile({
  label,
  value,
  to,
  icon: Icon,
  accent = "brand",
  share,
}: {
  label: string;
  value: number | string;
  to?: string;
  icon?: LucideIcon;
  accent?: Accent;
  /** Optional share of a total, shown as a percentage pill. */
  share?: number;
  /** @deprecated kept for older callers; accent is used instead. */
  tone?: string;
}) {
  const body = (
    <span className="flex items-start gap-3">
      {Icon && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${ACCENTS[accent]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm text-muted">{label}</span>
        <span className="mt-0.5 block text-2xl font-bold text-ink tabular-nums">{value}</span>
        {share !== undefined && (
          <span
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${ACCENTS[accent]}`}
          >
            {share}%
          </span>
        )}
      </span>
    </span>
  );
  const cls = "block rounded-xl border border-line bg-paper p-4 no-underline shadow-xs";
  return to ? (
    <Link
      to={to}
      className={`${cls} transition hover:-translate-y-px hover:border-line-strong hover:shadow-[var(--shadow-soft)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function FilterSelect({
  name,
  label,
  value,
  options,
  allLabel = "All",
}: {
  name: string;
  label: string;
  value?: string | number;
  options: readonly (readonly [string, string])[];
  allLabel?: string;
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="field-input mt-1">
        <option value="">{allLabel}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Text shown when a list is empty, with the next sensible action. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-canvas px-6 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Sub-navigation for the staff workspace sections. Scrolls horizontally on small screens. */
export function Tabs({ items }: { items: { to: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {items.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            aria-current={t.active ? "page" : undefined}
            className="-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted no-underline hover:text-ink aria-[current=page]:border-brand-600 aria-[current=page]:text-ink"
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-soft px-2 py-0.5 text-xs text-muted tabular-nums">
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Page numbers to show: first, last, current ±1, with gaps ("…"). */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Pagination used by every list: "Showing 21–40 of 113", numbered pages, previous / next, and an
 * optional rows-per-page control (rendered by the caller as `sizeControl`).
 */
export function ListPagination({
  page,
  pages,
  total,
  pageSize,
  href,
  label = "applications",
  sizeControl,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  label?: string;
  sizeControl?: ReactNode;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    "inline-grid h-9 min-w-9 place-items-center rounded-lg border px-2.5 text-sm no-underline transition-colors";
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 border-t border-line p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-3 text-muted">
        <span aria-live="polite">
          {total === 0 ? `No ${label}` : `Showing ${from}–${to} of ${total.toLocaleString("en-IN")} ${label}`}
        </span>
        {sizeControl}
      </div>
      {pages > 1 && (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {page > 1 ? (
              <Link
                to={href(page - 1)}
                className={`${btn} border-line bg-paper text-ink hover:bg-soft`}
                rel="prev"
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
              </Link>
            ) : (
              <span className={`${btn} cursor-not-allowed border-line text-muted/50`} aria-disabled="true">
                <span aria-hidden="true">‹</span>
                <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
              </span>
            )}
          </li>
          {pageWindow(page, pages).map((p, i) =>
            p === "gap" ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  to={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className={`${btn} ${
                    p === page
                      ? "border-brand-600 bg-brand-600 font-semibold text-white hover:text-white"
                      : "border-line bg-paper text-ink hover:bg-soft"
                  }`}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
          <li>
            {page < pages ? (
              <Link
                to={href(page + 1)}
                className={`${btn} border-line bg-paper text-ink hover:bg-soft`}
                rel="next"
              >
                <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
                <span aria-hidden="true">›</span>
              </Link>
            ) : (
              <span className={`${btn} cursor-not-allowed border-line text-muted/50`} aria-disabled="true">
                <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
                <span aria-hidden="true">›</span>
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
