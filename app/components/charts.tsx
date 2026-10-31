/**
 * Small, dependency-free SVG charts. Sizes are SVG attributes (not inline styles) so they work under
 * the site's Content Security Policy. Single hue per chart; values are always printed as text, and
 * every mark has a native tooltip (<title>) so nothing depends on colour alone.
 */
import { cn } from "~/lib/utils";

export interface Datum {
  label: string;
  value: number;
  /** Optional link for the row (e.g. a filtered list). */
  href?: string;
}

/** Ranked horizontal bars with the label above and the value on the right. */
export function BarList({
  data,
  total,
  emptyText = "No data yet",
  className,
}: {
  data: Datum[];
  /** Percentages are of this total (defaults to the sum of values). */
  total?: number;
  emptyText?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = total ?? data.reduce((t, d) => t + d.value, 0);
  if (!data.some((d) => d.value > 0))
    return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <ul className={cn("space-y-3", className)}>
      {data.map((d) => {
        const pct = sum ? Math.round((d.value / sum) * 100) : 0;
        const w = d.value ? Math.max(1.5, (d.value / max) * 100) : 0;
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink">{d.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-ink">{d.value.toLocaleString("en-IN")}</span>
                <span className="ml-1.5 text-xs text-muted">{pct}%</span>
              </span>
            </div>
            <svg
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              className="mt-1.5 h-1.5 w-full overflow-visible"
              aria-hidden="true"
            >
              <rect x="0" y="0" width="100" height="6" rx="3" className="fill-soft" />
              {w > 0 && (
                <rect
                  x="0"
                  y="0"
                  width={w}
                  height="6"
                  rx="3"
                  className="fill-navy-600 transition-colors group-hover:fill-brand-600"
                >
                  <title>{`${d.label}: ${d.value} (${pct}%)`}</title>
                </rect>
              )}
            </svg>
          </>
        );
        return (
          <li key={d.label}>
            {d.href ? (
              <a href={d.href} className="group block rounded-lg no-underline outline-offset-4">
                {row}
              </a>
            ) : (
              <div className="group">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Weekly columns (change over time). The latest column is emphasised. */
export function ColumnTrend({ data, label }: { data: { weekOf: string; value: number }[]; label: string }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">No submissions yet</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 120;
  const slot = 100 / data.length;
  const bw = Math.min(slot * 0.62, 9);
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return (
    <figure>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label={label}
      >
        {[0.5, 1].map((t) => (
          <line
            key={t}
            x1="0"
            x2="100"
            y1={H - (H - 8) * t}
            y2={H - (H - 8) * t}
            className="stroke-line"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {data.map((d, i) => {
          const h = d.value ? Math.max(2, ((H - 8) * d.value) / max) : 0;
          const last = i === data.length - 1;
          return (
            <g key={d.weekOf} className="group">
              <rect x={i * slot} y="0" width={slot} height={H} className="fill-transparent" />
              <rect
                x={i * slot + (slot - bw) / 2}
                y={H - h}
                width={bw}
                height={h}
                rx="1.2"
                className={cn(
                  "transition-colors group-hover:fill-brand-600",
                  last ? "fill-navy-800" : "fill-navy-600/45",
                )}
              />
              <title>{`Week of ${fmt(d.weekOf)}: ${d.value} submitted`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-muted tabular-nums">
        <span>{fmt(data[0]!.weekOf)}</span>
        <span>
          Last week shown: <strong className="text-ink">{data[data.length - 1]!.value}</strong>
        </span>
        <span>{fmt(data[data.length - 1]!.weekOf)}</span>
      </figcaption>
    </figure>
  );
}

/** Thin progress ring for a single share (e.g. "decided 64 %"). */
export function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? value / total : 0;
  const r = 15.9155; // circumference 100
  return (
    <svg viewBox="0 0 36 36" className="h-14 w-14 shrink-0 -rotate-90" role="img" aria-label={label}>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-soft" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${Math.round(pct * 100)} 100`}
        className="stroke-brand-600"
      />
    </svg>
  );
}
