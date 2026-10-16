import { Form, Link, useLocation, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { Badge, formatDateTime, statusTone } from "~/components/forms";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { APPLICATION_STATUSES, PROCESSING_LABELS, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { hasPermission } from "~/modules/auth/permissions";
import { dashboardCounts, filterOptions, listApplications, parseListQuery } from "~/modules/reporting/applications.server";
import { PAGE_SIZES } from "~/modules/reporting/constants";

export const meta: Route.MetaFunction = () => [{ title: "Applications — Recruitment workspace" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  const q = parseListQuery(new URL(request.url));
  const [list, counts, options] = await Promise.all([listApplications(user, q), dashboardCounts(user, q.cycleId), filterOptions()]);
  return { list, counts, options, q, canExport: hasPermission(user.grants, "application:export") };
}

const SORTABLE: { key: string; label: string }[] = [
  { key: "referenceNo", label: "Reference" },
  { key: "candidate", label: "Candidate" },
  { key: "status", label: "Status" },
  { key: "submittedAt", label: "Submitted" },
];

export default function StaffIndex({ loaderData }: Route.ComponentProps) {
  const { list, counts, options, q, canExport } = loaderData;
  const [params] = useSearchParams();
  const location = useLocation();
  const nav = useNavigation();
  const withParams = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null || v === "" ? p.delete(k) : p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const sortLink = (key: string) => {
    const current = q.sort.replace(/^-/, "");
    const desc = q.sort.startsWith("-");
    const next = current === key ? (desc ? key : `-${key}`) : key === "submittedAt" ? "-submittedAt" : key;
    return withParams({ sort: next, page: 1 });
  };
  const ariaSort = (key: string): "ascending" | "descending" | "none" => (q.sort.replace(/^-/, "") === key ? (q.sort.startsWith("-") ? "descending" : "ascending") : "none");
  const tiles: [string, number | null, string][] = [
    ["Total (non-draft)", counts.total, ""],
    ["Drafts in progress", counts.drafts, ""],
    ["Pending screening", counts.pendingScreening, "UNDER_HR_REVIEW"],
    ["Awaiting department", counts.awaitingDepartment, "UNDER_DEPARTMENT_REVIEW"],
    ["Clarification requested", counts.clarification, "NEEDS_CLARIFICATION"],
    ["Shortlisted", counts.shortlisted, "SHORTLISTED"],
    ["Rejected", counts.rejected, "REJECTED"],
    ["PDF processing failures", counts.processingFailures, ""],
  ];
  return (
    <div className="space-y-6">
      <h1>Applications</h1>
      <section aria-label="Summary">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles
            .filter(([, v]) => v !== null)
            .map(([label, value, status]) => (
              <li key={label} className="card p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {status ? (
                    <Link to={withParams({ status, page: 1 })} className="no-underline text-ink">
                      {value}
                    </Link>
                  ) : label.startsWith("PDF") && value ? (
                    <Link to={withParams({ processing: "FAILED", page: 1 })} className="text-danger">
                      {value}
                    </Link>
                  ) : (
                    value
                  )}
                </p>
              </li>
            ))}
        </ul>
      </section>

      <Form method="get" className="card grid gap-3 md:grid-cols-4" aria-label="Filter applications">
        <div className="md:col-span-2">
          <label htmlFor="q" className="block text-sm font-medium">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={q.q ?? ""} placeholder="Reference, candidate name or e-mail" className="field-input mt-1" />
        </div>
        <Select name="cycleId" label="Recruitment cycle" value={q.cycleId} options={options.cycles.map((c) => [c.id, c.title])} />
        <Select name="vacancyId" label="Vacancy" value={q.vacancyId} options={options.vacancies.map((v) => [v.id, `${v.code} — ${v.title}`])} />
        <Select name="position" label="Position" value={q.position} options={Object.entries(POSITION_LABELS)} />
        <Select name="departmentId" label="Department" value={q.departmentId} options={options.departments.map((d) => [d.id, d.name])} />
        <Select name="disciplineId" label="Discipline" value={q.disciplineId} options={options.departments.flatMap((d) => d.disciplines.map((x) => [x.id, `${d.name} — ${x.name}`] as [string, string]))} />
        <Select name="status" label="Status" value={q.status} options={APPLICATION_STATUSES.filter((s) => s !== "DRAFT").map((s) => [s, STATUS_LABELS[s]])} />
        <Select name="processing" label="PDF status" value={q.processing} options={Object.entries(PROCESSING_LABELS)} />
        <div>
          <label htmlFor="from" className="block text-sm font-medium">
            Submitted from
          </label>
          <input id="from" name="from" type="date" defaultValue={q.from ?? ""} className="field-input mt-1" />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-medium">
            Submitted to
          </label>
          <input id="to" name="to" type="date" defaultValue={q.to ?? ""} className="field-input mt-1" />
        </div>
        <input type="hidden" name="sort" value={q.sort} />
        <input type="hidden" name="size" value={q.size} />
        <div className="flex items-end gap-2 md:col-span-2">
          <button type="submit" className="btn-primary">
            Apply filters
          </button>
          <Link to="/staff" className="btn-secondary">
            Clear
          </Link>
          {canExport && (
            <a href={`/staff/export.csv${location.search}`} className="btn-secondary">
              Export CSV
            </a>
          )}
        </div>
      </Form>

      <section aria-labelledby="results" className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 id="results" className="text-base">
            <span role="status">
              {list.total} application{list.total === 1 ? "" : "s"}
              {nav.state === "loading" ? " — updating…" : ""}
            </span>
          </h2>
          <Form method="get" className="flex items-center gap-2 text-sm">
            {[...params].filter(([k]) => k !== "size" && k !== "page").map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label htmlFor="size">Rows per page</label>
            <select id="size" name="size" defaultValue={q.size} className="field-input w-20 py-1">
              {PAGE_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary py-1">
              Set
            </button>
          </Form>
        </div>
        {list.rows.length === 0 ? (
          <p className="p-4 text-muted">No applications match these filters.</p>
        ) : (
          <table className="table">
            <caption className="sr-only">Applications, sortable by column</caption>
            <thead>
              <tr>
                {SORTABLE.slice(0, 2).map((c) => (
                  <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                    <Link to={sortLink(c.key)} className="no-underline text-ink">
                      {c.label} <SortIcon dir={ariaSort(c.key)} />
                    </Link>
                  </th>
                ))}
                <th scope="col">Vacancy</th>
                {SORTABLE.slice(2).map((c) => (
                  <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                    <Link to={sortLink(c.key)} className="no-underline text-ink">
                      {c.label} <SortIcon dir={ariaSort(c.key)} />
                    </Link>
                  </th>
                ))}
                <th scope="col">PDF</th>
                <th scope="col">Reviews</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/staff/applications/${r.id}`} state={{ back: location.pathname + location.search }}>
                      {r.referenceNo}
                    </Link>
                  </td>
                  <td>{r.currentRevision?.candidateName}</td>
                  <td>
                    {r.vacancy.code}
                    <span className="block text-xs text-muted">
                      {POSITION_LABELS[r.vacancy.position]} · {r.vacancy.department.code}
                      {r.vacancy.discipline ? ` · ${r.vacancy.discipline.name}` : ""}
                    </span>
                  </td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                  </td>
                  <td>{formatDateTime(r.submittedAt)}</td>
                  <td>
                    <Badge tone={statusTone(r.processingStatus)}>{PROCESSING_LABELS[r.processingStatus]}</Badge>
                  </td>
                  <td>{r._count.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2 p-4 text-sm">
          <span>
            Page {q.page} of {list.pages}
          </span>
          <span className="flex gap-2">
            {q.page > 1 ? (
              <Link to={withParams({ page: q.page - 1 })} className="btn-secondary py-1">
                Previous
              </Link>
            ) : (
              <span className="btn-secondary py-1 opacity-50" aria-disabled="true">
                Previous
              </span>
            )}
            {q.page < list.pages ? (
              <Link to={withParams({ page: q.page + 1 })} className="btn-secondary py-1">
                Next
              </Link>
            ) : (
              <span className="btn-secondary py-1 opacity-50" aria-disabled="true">
                Next
              </span>
            )}
          </span>
        </nav>
      </section>
    </div>
  );
}

function SortIcon({ dir }: { dir: "ascending" | "descending" | "none" }) {
  return <span aria-hidden="true">{dir === "ascending" ? "▲" : dir === "descending" ? "▼" : "↕"}</span>;
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <select id={name} name={name} defaultValue={value ?? ""} className="field-input mt-1">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
