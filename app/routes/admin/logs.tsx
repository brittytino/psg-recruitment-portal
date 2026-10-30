import { Form, Link, useNavigation } from "react-router";
import { AlertTriangle, Download, Info, ScrollText, XCircle } from "lucide-react";
import type { Route } from "./+types/logs";
import { EmptyState, PageHeader } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { cn } from "~/lib/utils";
import { LOG_CATEGORIES, LOG_RETENTION_DAYS, type LogCategory } from "~/modules/settings/log-categories";
import { logDays, readLogs } from "~/modules/settings/logs.server";

export const meta: Route.MetaFunction = () => [
  { title: "System logs — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "system:manage");
  const sp = new URL(request.url).searchParams;
  const days = await logDays(user);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "")
    ? sp.get("date")!
    : (days[0]?.date ?? todayIst());
  const cat = sp.get("category");
  const category: LogCategory = cat && cat in LOG_CATEGORIES ? (cat as LogCategory) : "all";
  const search = sp.get("q")?.slice(0, 100) || undefined;
  const result = await readLogs(user, { date, category, search }, 400);
  // Dates and times are formatted here (server) so the page renders identically in every browser.
  const entries = result.entries.map((e) => ({ ...e, timeLabel: istTime(e.time) }));
  const dayOptions = days.map((d) => ({
    date: d.date,
    label: `${new Date(`${d.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${d.bytes > 1024 * 1024 ? `${(d.bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(d.bytes / 1024)} KB`}`,
  }));
  return { days: dayOptions, date, category, search, ...result, entries };
}

const LEVEL_STYLE: Record<string, string> = {
  error: "bg-danger-50 text-danger",
  fatal: "bg-danger-50 text-danger",
  warn: "bg-warning-50 text-warning",
  info: "bg-info-50 text-info",
};

function istTime(t: string) {
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

export default function Logs({ loaderData }: Route.ComponentProps) {
  const { days, date, category, search, entries, total, truncated } = loaderData;
  const busy = useNavigation().state === "loading";
  const qs = new URLSearchParams({ date, category, ...(search ? { q: search } : {}) });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Super Admin"
        title="System logs"
        description={`Technical events from the web app and background worker: sign-in codes and e-mail delivery, PDF generation, rate limits and errors. Kept for ${LOG_RETENTION_DAYS} days. For who-did-what, see the audit log.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/staff/audit" className="btn-secondary">
              <ScrollText className="h-4 w-4" aria-hidden="true" /> Audit log
            </Link>
            <a href={`/admin/logs/download?${qs}`} className="btn-primary" download>
              <Download className="h-4 w-4" aria-hidden="true" /> Download
            </a>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Log category">
        {(Object.keys(LOG_CATEGORIES) as LogCategory[]).map((c) => (
          <Link
            key={c}
            role="tab"
            aria-selected={c === category}
            to={`?${new URLSearchParams({ date, category: c, ...(search ? { q: search } : {}) })}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm no-underline transition-colors",
              c === category
                ? "border-navy-800 bg-navy-800 font-semibold text-white"
                : "border-line bg-paper text-ink hover:border-line-strong",
            )}
          >
            {LOG_CATEGORIES[c]}
          </Link>
        ))}
      </div>

      <Form method="get" className="card flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <input type="hidden" name="category" value={category} />
        <div>
          <label htmlFor="l-date" className="block text-sm font-medium">
            Day
          </label>
          <select id="l-date" name="date" defaultValue={date} className="field-input mt-1 min-w-48">
            {days.length === 0 && <option value={date}>{date}</option>}
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-60 flex-1">
          <label htmlFor="l-q" className="block text-sm font-medium">
            Contains
          </label>
          <input
            id="l-q"
            name="q"
            defaultValue={search ?? ""}
            placeholder="e.g. a reference no., user id, IP or error text"
            className="field-input mt-1"
          />
        </div>
        <button type="submit" className="btn-secondary">
          Show
        </button>
        <p className="ml-auto self-center text-sm text-muted" aria-live="polite">
          {busy ? "Loading…" : `${total.toLocaleString("en-IN")} entr${total === 1 ? "y" : "ies"}`}
          {truncated ? " · newest 400 shown (download for all)" : ""}
        </p>
      </Form>

      {entries.length === 0 ? (
        <div className="card">
          <EmptyState title="No log entries for this selection">
            Choose another day or category. New entries appear here as soon as they are written.
          </EmptyState>
        </div>
      ) : (
        <ol
          className="card divide-y divide-line p-0 font-mono text-[13px]"
          aria-label="Log entries, newest first"
        >
          {entries.map((e, i) => (
            <li
              key={`${e.time}-${i}`}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[6.5rem_4.5rem_1fr] sm:px-5"
            >
              <time className="text-muted tabular-nums">{e.timeLabel}</time>
              <span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase",
                    LEVEL_STYLE[e.level] ?? "bg-soft text-muted",
                  )}
                >
                  {e.level === "error" || e.level === "fatal" ? (
                    <XCircle className="h-3 w-3" aria-hidden="true" />
                  ) : e.level === "warn" ? (
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Info className="h-3 w-3" aria-hidden="true" />
                  )}
                  {e.level}
                </span>
              </span>
              <div className="min-w-0">
                <p className="font-sans text-sm text-ink">
                  <span className="font-semibold">{e.message}</span>{" "}
                  <span className="text-xs text-muted">
                    · {e.service}
                    {e.event ? ` · ${e.event}` : ""}
                  </span>
                </p>
                {Object.keys(e.details).length > 0 && (
                  <p className="mt-1 break-all text-xs text-muted">
                    {Object.entries(e.details)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("  ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
