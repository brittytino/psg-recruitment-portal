import { useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { AlertTriangle, MessageSquareWarning, Settings2 } from "lucide-react";
import type { Route } from "./+types/help-desk";
import { Alert, ConfirmDialog, CsrfInput, formatDateTime } from "~/components/forms";
import { PriorityLabel, TicketStatusBadge } from "~/components/helpdesk";
import { EmptyState, ListPagination, PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { cn } from "~/lib/utils";
import { hasPermission, isSuperAdmin } from "~/modules/auth/permissions";
import { supportStaff } from "~/modules/helpdesk/config.server";
import {
  CATEGORY_KEYS,
  categoryLabel,
  PRIORITIES,
  PRIORITY_LABEL,
  STAFF_STATUS_LABEL,
  STAFF_VIEWS,
  TICKET_PAGE_SIZE,
  TICKET_STATUSES,
  type StaffView,
  type Priority,
  type TicketStatus,
} from "~/modules/helpdesk/definitions";
import { bulkUpdate, staffCounts, staffListSchema, staffTickets } from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Help desk — Staff" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "helpdesk:handle");
  const q = staffListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const [list, counts, staff] = await Promise.all([
    staffTickets(user, q),
    staffCounts(user),
    supportStaff(isSuperAdmin(user.grants)),
  ]);
  return {
    q,
    ...list,
    counts,
    staff: staff.map((s) => ({ id: s.id, name: s.profile?.fullName?.trim() || s.email })),
    canConfigure: hasPermission(user.grants, "helpdesk:admin"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "helpdesk:handle");
  const form = await readForm(request, context);
  return handleAction(async () => {
    const r = await bulkUpdate(user, form);
    return {
      message: `${r.updated} ticket${r.updated === 1 ? "" : "s"} updated.`,
      failed: r.failed,
    };
  });
}

export default function StaffHelpDesk({ loaderData: L, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const busy = useNavigation().state !== "idle";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const a = actionData as
    { message?: string; formError?: string; failed?: { ref: string; reason: string }[] } | undefined;
  const link = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    if (!("page" in patch)) s.delete("page");
    return `?${s}`;
  };
  const viewCount: Partial<Record<StaffView, number>> = {
    open: L.counts.status.OPEN + L.counts.status.IN_PROGRESS,
    unassigned: L.counts.unassigned,
    mine: L.counts.mine,
    awaiting: L.counts.status.AWAITING_CANDIDATE,
    escalated: L.counts.escalated,
    resolved: L.counts.status.RESOLVED,
    closed: L.counts.status.CLOSED,
  };
  const allOnPage = L.rows.length > 0 && L.rows.every((r) => selected.has(r.id));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Help desk"
        title="Support tickets"
        description="Candidate support requests: triage, reply, assign and resolve."
        actions={
          L.canConfigure ? (
            <Link to="/staff/help-desk/settings" className="btn-secondary">
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Help desk settings
            </Link>
          ) : null
        }
      />
      {a?.message && (
        <Alert tone={a.failed?.length ? "warning" : "success"} title={a.message}>
          {a.failed?.length ? (
            <ul className="list-disc pl-5">
              {a.failed.map((f) => (
                <li key={f.ref}>
                  {f.ref}: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      )}
      {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["Open", L.counts.status.OPEN, "open", "border-l-danger"],
            ["Unassigned", L.counts.unassigned, "unassigned", "border-l-navy-800"],
            ["High / urgent", L.counts.high, null, "border-l-warning"],
            ["Awaiting candidate", L.counts.status.AWAITING_CANDIDATE, "awaiting", "border-l-warning"],
            ["Escalated", L.counts.escalated, "escalated", "border-l-brand-600"],
          ] as const
        ).map(([label, n, view, tone]) => (
          <div key={label} className={cn("card border-l-4 p-4", tone)}>
            <dt className="text-sm text-muted">
              {view ? (
                <Link to={link({ view, status: null })} className="text-muted no-underline hover:text-ink">
                  {label}
                </Link>
              ) : (
                label
              )}
            </dt>
            <dd className="font-display text-2xl font-semibold">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Ticket views" className="-mx-4 overflow-x-auto px-4 xl:mx-0 xl:px-0">
          <ul className="flex gap-1 xl:flex-col">
            {(Object.keys(STAFF_VIEWS) as StaffView[]).map((v) => (
              <li key={v} className="shrink-0">
                <Link
                  to={link({ view: v, status: null })}
                  aria-current={L.q.view === v ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm no-underline",
                    L.q.view === v ? "bg-navy-800 font-semibold text-white" : "text-ink hover:bg-soft",
                  )}
                >
                  {STAFF_VIEWS[v]}
                  {viewCount[v] !== undefined && (
                    <span
                      className={cn("text-xs tabular-nums", L.q.view === v ? "text-white/70" : "text-muted")}
                    >
                      {viewCount[v]}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section className="card min-w-0 p-0" aria-labelledby="tickets">
          <Form
            method="get"
            className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
          >
            <input type="hidden" name="view" value={L.q.view} />
            <div className="sm:col-span-2">
              <label htmlFor="s-q" className="block text-sm font-medium">
                Search
              </label>
              <input
                id="s-q"
                name="q"
                defaultValue={L.q.q ?? ""}
                placeholder="Ticket no., subject, candidate, e-mail or application no."
                className="field-input mt-1"
              />
            </div>
            {(
              [
                ["status", "Status", TICKET_STATUSES.map((s) => [s, STAFF_STATUS_LABEL[s]])],
                ["priority", "Priority", PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])],
                ["category", "Category", CATEGORY_KEYS.map((c) => [c, categoryLabel(c)])],
                ["assignee", "Assigned to", L.staff.map((s) => [s.id, s.name])],
              ] as [string, string, [string, string][]][]
            ).map(([name, label, opts]) => (
              <div key={name}>
                <label htmlFor={`s-${name}`} className="block text-sm font-medium">
                  {label}
                </label>
                <select
                  id={`s-${name}`}
                  name={name}
                  defaultValue={(L.q as Record<string, unknown>)[name] as string | undefined}
                  className="field-input mt-1"
                >
                  <option value="">All</option>
                  {opts.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label htmlFor="s-from" className="block text-sm font-medium">
                Created from
              </label>
              <input
                id="s-from"
                name="from"
                type="date"
                defaultValue={L.q.from ?? ""}
                className="field-input mt-1"
              />
            </div>
            <div>
              <label htmlFor="s-to" className="block text-sm font-medium">
                Created to
              </label>
              <input
                id="s-to"
                name="to"
                type="date"
                defaultValue={L.q.to ?? ""}
                className="field-input mt-1"
              />
            </div>
            <div>
              <label htmlFor="s-sort" className="block text-sm font-medium">
                Sort
              </label>
              <select id="s-sort" name="sort" defaultValue={L.q.sort} className="field-input mt-1">
                <option value="updated">Recently updated</option>
                <option value="priority">Priority</option>
                <option value="created">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn-primary">
                Apply
              </button>
              <Link to={`?view=${L.q.view}`} className="btn-secondary">
                Clear
              </Link>
            </div>
          </Form>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h2 id="tickets" className="text-lg">
              {STAFF_VIEWS[L.q.view]} <span className="text-muted">· {L.total}</span>
            </h2>
            {selected.size > 0 && (
              <Form method="post" className="flex flex-wrap items-end gap-2">
                <CsrfInput />
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="ticketId" value={id} />
                ))}
                <input type="hidden" name="bulk" value="assign" />
                <label htmlFor="b-assignee" className="sr-only">
                  Assign to
                </label>
                <select id="b-assignee" name="assigneeId" required className="field-input py-2 text-sm">
                  <option value="">Assign {selected.size} to…</option>
                  <option value="none">Nobody (unassigned)</option>
                  {L.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ConfirmDialog
                  trigger="Assign"
                  triggerClassName="btn-secondary btn-sm"
                  title={`Assign ${selected.size} ticket${selected.size === 1 ? "" : "s"}?`}
                  confirmLabel="Assign"
                  disabled={busy}
                >
                  <p>Each assignment is recorded in the ticket history. The new assignee is notified.</p>
                </ConfirmDialog>
              </Form>
            )}
            {selected.size > 0 && (
              <Form method="post" className="flex flex-wrap items-end gap-2">
                <CsrfInput />
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="ticketId" value={id} />
                ))}
                <input type="hidden" name="bulk" value="status" />
                <label htmlFor="b-status" className="sr-only">
                  New status
                </label>
                <select
                  id="b-status"
                  name="status"
                  required
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="field-input py-2 text-sm"
                >
                  <option value="">Set status…</option>
                  {TICKET_STATUSES.filter((s) => s !== "OPEN").map((s) => (
                    <option key={s} value={s}>
                      {STAFF_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                {(bulkStatus === "RESOLVED" || bulkStatus === "CLOSED") && (
                  <input
                    name="summary"
                    required
                    minLength={10}
                    placeholder="Resolution summary (sent to each candidate)"
                    className="field-input w-72 py-2 text-sm"
                  />
                )}
                <ConfirmDialog
                  trigger="Update"
                  triggerClassName="btn-secondary btn-sm"
                  tone={bulkStatus === "CLOSED" ? "danger" : "primary"}
                  title={`Change the status of ${selected.size} ticket${selected.size === 1 ? "" : "s"}?`}
                  confirmLabel="Change status"
                  disabled={busy}
                >
                  <p>
                    Tickets that cannot move to this status are skipped and listed afterwards.
                    {bulkStatus === "RESOLVED" ? " Each candidate is notified." : ""}
                  </p>
                </ConfirmDialog>
              </Form>
            )}
          </div>

          {L.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No tickets here">
                Nothing matches this view and these filters. <Link to="?view=all">Show all tickets</Link>.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <caption className="sr-only">Support tickets</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all tickets on this page"
                        checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(L.rows.map((r) => r.id)))}
                        className="h-4 w-4"
                      />
                    </th>
                    <th scope="col">Ticket</th>
                    <th scope="col">Candidate</th>
                    <th scope="col">Category</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {L.rows.map((t) => (
                    <tr key={t.id} className={selected.has(t.id) ? "bg-brand-50/40" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.referenceNo}`}
                          checked={selected.has(t.id)}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(t.id)) n.delete(t.id);
                              else n.add(t.id);
                              return n;
                            })
                          }
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="min-w-64">
                        <Link to={`/staff/help-desk/${t.id}`} className="font-semibold">
                          {t.referenceNo}
                        </Link>
                        <span className="block text-sm text-ink">{t.subject}</span>
                        <span className="flex flex-wrap gap-2 text-xs">
                          {t.waitingOnTeam && (
                            <span className="inline-flex items-center gap-1 font-medium text-danger">
                              <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden="true" /> Candidate
                              waiting
                            </span>
                          )}
                          {t.escalated && (
                            <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Escalated
                            </span>
                          )}
                          {t.application?.referenceNo && (
                            <span className="text-muted">{t.application.referenceNo}</span>
                          )}
                        </span>
                      </td>
                      <td className="text-sm">{t.candidate}</td>
                      <td className="text-sm">{categoryLabel(t.category)}</td>
                      <td>
                        <PriorityLabel priority={t.priority as Priority} />
                      </td>
                      <td>
                        <TicketStatusBadge status={t.status as TicketStatus} staff />
                      </td>
                      <td className="text-sm">
                        {t.assigneeName ?? <span className="text-muted">Unassigned</span>}
                      </td>
                      <td className="text-sm whitespace-nowrap">{formatDateTime(t.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPagination
            page={L.q.page}
            pages={L.pages}
            total={L.total}
            pageSize={TICKET_PAGE_SIZE}
            href={(p) => link({ page: String(p) })}
            label="tickets"
          />
        </section>
      </div>
    </div>
  );
}
