import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { Archive, CalendarClock, CalendarPlus, Pencil, Plus } from "lucide-react";
import {
  Alert,
  Badge,
  ConfirmDialog,
  CsrfInput,
  formatDate,
  formatDateTime,
  statusTone,
} from "~/components/forms";
import { Modal, ModalActions, ModalClose } from "~/components/modal";
import { EmptyState, PageHeader, Tabs } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { ValidationError } from "~/modules/core/errors";
import { currentYear, recruitmentName, yearOfVacancy } from "~/modules/reporting/years";
import { adminOverview, extendDeadline, setVacancyStatus } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Job profiles — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const { vacancies } = await adminOverview(user);
  const live = currentYear();
  const rows = vacancies.map((v) => ({ ...v, year: yearOfVacancy(v) }));
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b.localeCompare(a));
  return { vacancies: rows, years, live, now: new Date().toISOString() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const f = Object.fromEntries(form);
  return handleAction(async () => {
    switch (f.intent) {
      case "vacancy-status":
        await setVacancyStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED");
        return { message: "Job profile updated." };
      case "extend": {
        const r = await extendDeadline(user, String(f.id), { closesAt: f.closesAt, reason: f.reason });
        return {
          message: r.reopened
            ? "Last date extended. The job profile is open for applications again."
            : "Last date extended. Candidates can keep applying until the new date.",
        };
      }
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const STATUS_TABS = [
  ["all", "All"],
  ["PUBLISHED", "Published"],
  ["DRAFT", "Drafts"],
  ["CLOSED", "Closed"],
] as const;

/** "YYYY-MM-DDTHH:mm" in IST, for datetime-local inputs. */
const local = (d: Date | string) =>
  new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { vacancies: all, years, live, now } = loaderData;
  const [params] = useSearchParams();
  const year = years.includes(params.get("year") ?? "")
    ? params.get("year")!
    : years.includes(live)
      ? live
      : years[0];
  const inYear = all.filter((v) => v.year === year);
  const tab = STATUS_TABS.find(([k]) => k === params.get("status"))?.[0] ?? "all";
  const vacancies = tab === "all" ? inYear : inYear.filter((v) => v.status === tab);
  const archived = !!year && year !== live;
  const nowMs = new Date(now).getTime();
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const q = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ ...(year ? { year } : {}), ...extra })}`;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Recruitment set-up"
        title="Job profiles"
        description="Create job openings, publish them, and extend the last date whenever needed. Each recruitment year is archived automatically when the next one starts."
        actions={
          <Link to="/admin/vacancies/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New job opening
          </Link>
        }
      />
      {params.get("updated") === "1" && !actionData && <Alert tone="success">Job opening updated.</Alert>}
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}

      {years.length > 0 && (
        <nav aria-label="Recruitment year" className="flex flex-wrap gap-2">
          {years.map((y) => {
            const active = y === year;
            const count = all.filter((v) => v.year === y).length;
            return (
              <Link
                key={y}
                to={`?year=${y}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold no-underline transition-colors ${
                  active
                    ? "border-navy-800 bg-navy-800 text-white"
                    : "border-line bg-paper text-ink hover:border-line-strong hover:bg-soft"
                }`}
              >
                {y !== live && <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                {recruitmentName(y)}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-soft text-muted"}`}
                >
                  {count}
                </span>
                {y === live && (
                  <span className={`text-xs font-medium ${active ? "text-white/80" : "text-success"}`}>
                    Current
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {archived && (
        <Alert tone="info" title={`${recruitmentName(year!)} is archived`}>
          Its job profiles and applications stay available to read, review and export. New job openings are
          added to {recruitmentName(live)}.
        </Alert>
      )}

      <Tabs
        items={STATUS_TABS.map(([k, l]) => ({
          to: k === "all" ? q({}) : q({ status: k }),
          label: l,
          active: k === tab,
          count: k === "all" ? inYear.length : inYear.filter((v) => v.status === k).length,
        }))}
      />

      <section className="card p-0" aria-label="Job profiles">
        {vacancies.length === 0 ? (
          <div className="p-6">
            <EmptyState title={tab === "all" ? "No job openings yet" : "Nothing here"}>
              <Link to="/admin/vacancies/new">Create a job opening</Link> — it starts as a draft.
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Job profiles</caption>
              <thead>
                <tr>
                  <th scope="col">Job profile</th>
                  <th scope="col">Department / Specialisation</th>
                  <th scope="col">Posts</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Applications
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((v) => {
                  const passed = new Date(v.closesAt).getTime() <= nowMs;
                  const days = Math.ceil((new Date(v.closesAt).getTime() - nowMs) / 86400_000);
                  return (
                    <tr key={v.id}>
                      <td>
                        <span className="block min-w-[13rem] font-semibold">{v.title}</span>
                        <span className="block text-sm text-muted">
                          {v.code} ·{" "}
                          {v.position
                            ? (POSITION_LABELS[v.position] ?? v.position)
                            : (v.researchPositionTitle ?? "Research Assistant")}
                        </span>
                      </td>
                      <td>
                        {v.department ? (
                          <>
                            {v.department.name}
                            {v.discipline ? (
                              <span className="block text-sm text-muted">{v.discipline.name}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="font-medium text-ink">
                            {v.researchSpecialisation?.name ?? "Research"}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums">{v.numberOfPosts ?? "—"}</td>
                      <td className="whitespace-nowrap text-sm">
                        {formatDate(v.opensAt)} – {formatDate(v.closesAt)}
                        {v.status === "PUBLISHED" && (
                          <span
                            className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${passed ? "text-danger" : days <= 3 ? "text-warning" : "text-muted"}`}
                          >
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                            {passed ? "Last date passed" : days <= 1 ? "Closes today" : `${days} days left`}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone={passed && v.status === "PUBLISHED" ? "warning" : statusTone(v.status)}>
                          {v.status === "PUBLISHED"
                            ? passed
                              ? "Not accepting"
                              : "Published"
                            : v.status === "DRAFT"
                              ? "Draft"
                              : "Closed"}
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">{v._count.applications}</td>
                      <td>
                        <div className="flex min-w-[9.5rem] flex-wrap justify-end gap-1.5">
                          <Link
                            to={`/admin/vacancies/${v.id}/edit`}
                            className="btn-secondary btn-sm"
                            aria-label={`Edit ${v.code}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                          </Link>
                          {v.status !== "DRAFT" && (
                            <Modal
                              size="sm"
                              triggerClassName={passed ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                              trigger={
                                <>
                                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Extend
                                </>
                              }
                              icon={<CalendarPlus className="h-5 w-5" aria-hidden="true" />}
                              title="Extend the last date"
                              description={`${v.code} · now closes ${formatDateTime(v.closesAt)}`}
                            >
                              <Form method="post" className="space-y-4">
                                <CsrfInput />
                                <input type="hidden" name="intent" value="extend" />
                                <input type="hidden" name="id" value={v.id} />
                                <div>
                                  <label htmlFor={`c-${v.id}`} className="block text-sm font-semibold">
                                    New last date and time (IST)
                                  </label>
                                  <input
                                    id={`c-${v.id}`}
                                    type="datetime-local"
                                    name="closesAt"
                                    required
                                    min={local(new Date(Math.max(nowMs, new Date(v.closesAt).getTime())))}
                                    defaultValue={local(
                                      new Date(
                                        Math.max(nowMs, new Date(v.closesAt).getTime()) + 7 * 86400_000,
                                      ),
                                    )}
                                    className="field-input mt-1"
                                    aria-invalid={!!fe?.closesAt}
                                  />
                                  {fe?.closesAt && (
                                    <p className="mt-1 text-sm text-danger">{fe.closesAt[0]}</p>
                                  )}
                                </div>
                                <div>
                                  <label htmlFor={`r-${v.id}`} className="block text-sm font-semibold">
                                    Reason{" "}
                                    <span className="font-normal text-muted">
                                      (optional, kept in the audit log)
                                    </span>
                                  </label>
                                  <input
                                    id={`r-${v.id}`}
                                    name="reason"
                                    maxLength={500}
                                    className="field-input mt-1"
                                  />
                                </div>
                                <p className="rounded-xl bg-soft p-3 text-sm text-muted">
                                  {v.status === "CLOSED"
                                    ? "This job profile is closed; extending opens it again."
                                    : "Candidates who started an application can finish and submit it until the new date."}
                                </p>
                                <ModalActions>
                                  <ModalClose className="btn-secondary">Cancel</ModalClose>
                                  <button type="submit" className="btn-primary">
                                    Extend last date
                                  </button>
                                </ModalActions>
                              </Form>
                            </Modal>
                          )}
                          {!(v.status === "CLOSED") || !passed ? (
                            <Form method="post">
                              <CsrfInput />
                              <input type="hidden" name="intent" value="vacancy-status" />
                              <input type="hidden" name="id" value={v.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={v.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED"}
                              />
                              <ConfirmDialog
                                trigger={v.status === "PUBLISHED" ? "Close" : "Publish"}
                                triggerClassName="btn-secondary btn-sm"
                                title={`${v.status === "PUBLISHED" ? "Close" : "Publish"} ${v.code}?`}
                                confirmLabel="Confirm"
                                tone={v.status === "PUBLISHED" ? "danger" : "primary"}
                              >
                                <p>
                                  {v.status === "PUBLISHED"
                                    ? "Candidates will no longer be able to start or submit applications. You can open it again later."
                                    : "The job profile becomes public and open for applications within its dates."}
                                </p>
                              </ConfirmDialog>
                            </Form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
