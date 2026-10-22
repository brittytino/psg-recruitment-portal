import type { ReactNode } from "react";
import { Link } from "react-router";

/** Page title block used by every staff page: eyebrow, title, one-line purpose and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Number tile; a link when `to` is given (filters the list below). */
export function StatTile({
  label,
  value,
  to,
  tone = "bg-white",
}: {
  label: string;
  value: number | string;
  to?: string;
  tone?: string;
}) {
  const body = (
    <>
      <span className="block text-sm font-medium text-muted">{label}</span>
      <span className="mt-1 block text-3xl font-bold tabular-nums text-ink">{value}</span>
    </>
  );
  const cls = `block rounded-2xl border border-line p-4 no-underline shadow-xs ${tone}`;
  return to ? (
    <Link to={to} className={`${cls} transition-colors hover:border-brand-600/40`}>
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
      <label htmlFor={`f-${name}`} className="block text-sm font-semibold">
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
    <div className="rounded-2xl border border-dashed border-line bg-soft/50 p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Sub-navigation for the staff workspace sections. */
export function Tabs({ items }: { items: { to: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1">
      {items.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          aria-current={t.active ? "page" : undefined}
          className="rounded-xl px-4 py-2 text-sm font-semibold no-underline text-muted hover:bg-soft hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-white"
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 tabular-nums opacity-80">({t.count})</span>}
        </Link>
      ))}
    </nav>
  );
}
