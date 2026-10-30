import { MessageSquareReply, Search } from "lucide-react";
import { Form, Link } from "react-router";
import { formatDateTime } from "~/components/forms";
import { TicketStatusBadge } from "~/components/helpdesk";
import { EmptyState, ListPagination } from "~/components/staff";
import {
  TICKET_PAGE_SIZE,
  CATEGORY_KEYS,
  categoryLabel,
  STATUS_LABEL,
  TICKET_STATUSES,
  type TicketStatus,
} from "~/modules/helpdesk/definitions";

export interface CandidateTicketRow {
  id: string;
  referenceNo: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string | Date;
  lastActivityAt: string | Date;
  teamReplied: boolean;
  application: { referenceNo: string | null } | null;
}

/** The candidate's ticket list: search, status and category filters, sort, pagination. */
export function CandidateTicketTable({
  rows,
  total,
  page,
  pages,
  q,
  action,
}: {
  rows: CandidateTicketRow[];
  total: number;
  page: number;
  pages: number;
  q: { q?: string; status?: string; category?: string; sort: string };
  action: string;
}) {
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q.q) s.set("q", q.q);
    if (q.status) s.set("status", q.status);
    if (q.category) s.set("category", q.category);
    if (q.sort !== "updated") s.set("sort", q.sort);
    s.set("page", String(p));
    return `${action}?${s}`;
  };
  const filtered = !!(q.q || q.status || q.category);
  return (
    <section className="card p-0" aria-labelledby="my-tickets">
      <div className="flex flex-col gap-4 border-b border-line p-4 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 id="my-tickets" className="text-xl">
            My support tickets
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Your requests and the replies from the recruitment office.
          </p>
        </div>
        <Form
          method="get"
          action={action}
          className="flex w-full flex-wrap items-end gap-2 lg:w-auto lg:max-w-[46rem]"
        >
          <div className="relative min-w-56 flex-1">
            <label htmlFor="t-q" className="sr-only">
              Search by ticket number or subject
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="t-q"
              name="q"
              defaultValue={q.q ?? ""}
              placeholder="Ticket number or subject"
              className="field-input pl-9"
            />
          </div>
          <label className="sr-only" htmlFor="t-status">
            Status
          </label>
          <select id="t-status" name="status" defaultValue={q.status ?? ""} className="field-input">
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="t-cat">
            Category
          </label>
          <select id="t-cat" name="category" defaultValue={q.category ?? ""} className="field-input">
            <option value="">All categories</option>
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="t-sort">
              Sort
            </label>
            <select id="t-sort" name="sort" defaultValue={q.sort} className="field-input">
              <option value="updated">Recently updated</option>
              <option value="created">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button type="submit" className="btn-secondary">
              Apply
            </button>
          </div>
        </Form>
      </div>

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={filtered ? "No tickets match these filters" : "You have not raised a ticket yet"}
          >
            {filtered ? (
              <>
                Change or <Link to={action}>clear the filters</Link>.
              </>
            ) : (
              <>
                If something is not working, <Link to="/help-desk/new">create a support ticket</Link> and the
                recruitment office will reply here.
              </>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Table on wider screens */}
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <caption className="sr-only">My support tickets</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket no.</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Category</th>
                  <th scope="col">Application</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium whitespace-nowrap">
                      <Link to={`/help-desk/tickets/${t.id}`}>{t.referenceNo}</Link>
                    </td>
                    <td>
                      <span className="line-clamp-2">{t.subject}</span>
                      {t.teamReplied && t.status !== "CLOSED" && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-info">
                          <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" /> Reply from the
                          office
                        </span>
                      )}
                    </td>
                    <td className="text-sm">{categoryLabel(t.category)}</td>
                    <td className="text-sm whitespace-nowrap">{t.application?.referenceNo ?? "—"}</td>
                    <td>
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td className="text-sm whitespace-nowrap">{formatDateTime(t.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cards on phones */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <Link to={`/help-desk/tickets/${t.id}`} className="block p-4 no-underline hover:bg-soft">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-brand-700">{t.referenceNo}</span>
                    <TicketStatusBadge status={t.status} />
                  </span>
                  <span className="mt-1 block text-[15px] text-ink">{t.subject}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {categoryLabel(t.category)} · updated {formatDateTime(t.lastActivityAt)}
                  </span>
                  {t.teamReplied && t.status !== "CLOSED" && (
                    <span className="mt-1 block text-xs font-medium text-info">Reply from the office</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <ListPagination
            page={page}
            pages={pages}
            total={total}
            pageSize={TICKET_PAGE_SIZE}
            href={href}
            label="tickets"
          />
        </>
      )}
    </section>
  );
}
