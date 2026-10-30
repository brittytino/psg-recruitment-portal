import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { Globe, ShieldCheck, UserRound } from "lucide-react";
import type { Route } from "./+types/audit";
import { Badge, formatDateTime } from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { actionTone, AUDIT_CATEGORIES, type AuditCategory } from "~/modules/audit/describe";
import { auditLogDetailed } from "~/modules/audit/log.server";

export const meta: Route.MetaFunction = () => [
  { title: "Audit log — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "audit:read");
  const sp = new URL(request.url).searchParams;
  const cat = sp.get("category");
  const q = {
    category: cat && cat in AUDIT_CATEGORIES ? (cat as AuditCategory) : undefined,
    person: sp.get("person")?.trim().slice(0, 100) || undefined,
    action: sp.get("action")?.trim().slice(0, 60) || undefined,
    entityId: UUID.test(sp.get("entityId") ?? "") ? sp.get("entityId")! : undefined,
    from: DATE.test(sp.get("from") ?? "") ? sp.get("from")! : undefined,
    to: DATE.test(sp.get("to") ?? "") ? sp.get("to")! : undefined,
    page: Math.max(1, Math.min(10_000, Number(sp.get("page")) || 1)),
  };
  return { log: await auditLogDetailed(user, q), q };
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const { log, q } = loaderData;
  const [params] = useSearchParams();
  const busy = useNavigation().state === "loading";
  const link = (p: number) => {
    const s = new URLSearchParams(params);
    s.set("page", String(p));
    return `?${s}`;
  };
  const filtered = !!(q.category || q.person || q.action || q.entityId || q.from || q.to);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Permanent record of who did what and when: sign-ins, submissions, assignments, decisions, document access, user and setting changes. Entries cannot be edited or deleted."
      />

      <Form
        method="get"
        className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6"
        aria-label="Filter the audit log"
      >
        <div className="lg:col-span-2">
          <label htmlFor="a-person" className="block text-sm font-medium">
            Person (name or e-mail)
          </label>
          <input
            id="a-person"
            name="person"
            defaultValue={q.person ?? ""}
            placeholder="e.g. Dean or admin.n4@"
            className="field-input mt-1"
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="a-category" className="block text-sm font-medium">
            Activity
          </label>
          <select
            id="a-category"
            name="category"
            defaultValue={q.category ?? ""}
            className="field-input mt-1"
          >
            <option value="">All activity</option>
            {Object.entries(AUDIT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-from" className="block text-sm font-medium">
            From
          </label>
          <input
            id="a-from"
            name="from"
            type="date"
            defaultValue={q.from ?? ""}
            className="field-input mt-1"
          />
        </div>
        <div>
          <label htmlFor="a-to" className="block text-sm font-medium">
            To
          </label>
          <input id="a-to" name="to" type="date" defaultValue={q.to ?? ""} className="field-input mt-1" />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="a-action" className="block text-sm font-medium">
            Action code contains
          </label>
          <input
            id="a-action"
            name="action"
            defaultValue={q.action ?? ""}
            placeholder="e.g. assigned, decision, login"
            className="field-input mt-1"
          />
        </div>
        {q.entityId && <input type="hidden" name="entityId" value={q.entityId} />}
        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" className="btn-primary">
            Apply filters
          </button>
          {filtered && (
            <Link to="/staff/audit" className="btn-secondary">
              Clear
            </Link>
          )}
          <p className="ml-auto self-center text-sm text-muted" aria-live="polite">
            {busy ? "Loading…" : `${log.total.toLocaleString("en-IN")} event${log.total === 1 ? "" : "s"}`}
            {q.entityId ? " for one record" : ""}
          </p>
        </div>
      </Form>

      {log.rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No audit events match these filters">
            Change or <Link to="/staff/audit">clear the filters</Link>.
          </EmptyState>
        </div>
      ) : (
        <ol className="card divide-y divide-line p-0" aria-label="Audit events, newest first">
          {log.rows.map((r) => (
            <li key={r.id} className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[11rem_16rem_1fr]">
              <div className="text-sm">
                <time dateTime={new Date(r.createdAt).toISOString()} className="font-medium text-ink">
                  {formatDateTime(r.createdAt)}
                </time>
                {r.ip && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" /> {r.ip}
                  </p>
                )}
              </div>

              <div className="min-w-0 text-sm">
                {r.actor ? (
                  <>
                    <p className="flex items-center gap-1.5 font-semibold text-ink">
                      <UserRound className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <Link to={`?person=${encodeURIComponent(r.actor.email)}`} className="truncate text-ink">
                        {r.actor.name}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted">{r.actor.email}</p>
                    {r.actor.roles.length > 0 && (
                      <p className="mt-1 text-xs text-brand-700">{r.actor.roles.join(", ")}</p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 font-semibold text-muted">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" /> System
                  </p>
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={actionTone(r.action)}>{r.actionLabel}</Badge>
                  <code className="text-xs text-muted">{r.action}</code>
                </div>
                {r.entity.label !== "—" && (
                  <p className="text-sm">
                    <span className="text-muted">{r.entity.kind}: </span>
                    {r.entity.href ? (
                      <Link to={r.entity.href} className="font-medium">
                        {r.entity.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{r.entity.label}</span>
                    )}
                    {r.entityId && (
                      <Link
                        to={`?entityId=${r.entityId}`}
                        className="ml-2 text-xs whitespace-nowrap"
                        title="Show the full history of this record"
                      >
                        History
                      </Link>
                    )}
                  </p>
                )}
                {r.details.length > 0 && (
                  <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    {r.details.map((d) => (
                      <div key={d.label} className="flex min-w-0 gap-1.5">
                        <dt className="shrink-0 text-muted">{d.label}:</dt>
                        <dd className="min-w-0 break-words text-ink">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
        {q.page > 1 && (
          <Link to={link(q.page - 1)} className="btn-secondary btn-sm">
            Previous
          </Link>
        )}
        <span className="text-muted">
          Page {q.page} of {log.pages}
        </span>
        {q.page < log.pages && (
          <Link to={link(q.page + 1)} className="btn-secondary btn-sm">
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
