import { useState } from "react";
import { ArrowLeftRight, CheckCircle2, Clock, Download, FileText, Plus, Users, XCircle } from "lucide-react";
import { Form, Link, redirect, useLocation, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDate, statusTone } from "~/components/forms";
import { EmptyState, FilterSelect, PageHeader, StatTile } from "~/components/staff";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import {
  ASSIGNABLE,
  PROCESSING_LABELS,
  STATUS_LABELS,
  type AppStatus,
} from "~/modules/applications/workflow";
import { prisma } from "~/modules/core/db.server";
import { hasPermission, isAdmin, isHodReviewer, isHrOfficer } from "~/modules/auth/permissions";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";
import {
  dashboardCounts,
  departmentCounts,
  filteredIds,
  filterOptions,
  listApplications,
  parseListQuery,
} from "~/modules/reporting/applications.server";
import { PAGE_SIZES } from "~/modules/reporting/constants";
import { assignToDepartmentHods, assignToHod } from "~/modules/reviews/service.server";
import { hodsForDepartment } from "~/modules/users/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Applications — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  // HODs work from their own review queue.
  if (isHodReviewer(user.grants) && !isAdmin(user.grants) && !isHrOfficer(user.grants))
    throw redirect("/staff/review");
  const q = parseListQuery(new URL(request.url));
  const [list, counts, departments, options] = await Promise.all([
    listApplications(user, q),
    dashboardCounts(user),
    departmentCounts(user, { position: q.position }),
    filterOptions(),
  ]);
  const canAssign = hasPermission(user.grants, "application:assign");
  return {
    list,
    counts,
    departments,
    options,
    q,
    canExport: hasPermission(user.grants, "application:export"),
    canAssign,
    hods: canAssign && q.departmentId ? await hodsForDepartment(q.departmentId) : [],
    isAdmin: isAdmin(user.grants),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "application:assign");
  const form = await readForm(request, context);
  return handleAction(async () => {
    let ids = form.getAll("applicationId").map(String);
    if (form.get("scope") === "filtered") {
      const q = parseListQuery(new URL(request.url));
      // A department row's "Assign" button narrows to that department.
      const departmentId = form.get("departmentId") ? String(form.get("departmentId")) : q.departmentId;
      ids = await filteredIds(user, { ...q, departmentId, status: undefined, hod: undefined });
      const assignable = await prisma.application.findMany({
        where: { id: { in: ids }, status: { in: [...ASSIGNABLE] } },
        select: { id: true },
      });
      ids = assignable.map((a) => a.id);
    }
    if (form.get("intent") === "auto") {
      const r = await assignToDepartmentHods(user, ids, clientIp(request));
      const skipped = r.skipped.map((x) => `${x.department} (${x.count}) ${x.reason}`);
      if (!r.assigned && skipped.length) return { formError: `Nothing was assigned: ${skipped.join("; ")}.` };
      return {
        message: `${r.assigned} application${r.assigned === 1 ? "" : "s"} sent to their department HOD${r.assigned === 1 ? "" : "s"}. Each HOD has been notified by e-mail.${skipped.length ? ` Not assigned: ${skipped.join("; ")}.` : ""}`,
      };
    }
    const n = await assignToHod(
      user,
      { hodId: String(form.get("hodId") ?? ""), applicationIds: ids },
      clientIp(request),
    );
    return {
      message: `${n} application${n === 1 ? "" : "s"} moved to the HOD. The HOD has been notified by e-mail.`,
    };
  });
}

const SORTABLE: Record<string, string> = {
  referenceNo: "Reference No.",
  candidate: "Candidate",
  status: "Status",
  submittedAt: "Submitted",
};

export default function StaffIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { list, counts, departments, options, q, canExport, canAssign, hods, isAdmin: admin } = loaderData;
  const [params] = useSearchParams();
  const location = useLocation();
  const nav = useNavigation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const withParams = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null || v === "" ? p.delete(k) : p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const sortLink = (key: string) => {
    const current = q.sort.replace(/^-/, "");
    const desc = q.sort.startsWith("-");
    return withParams({
      sort: current === key ? (desc ? key : `-${key}`) : key === "submittedAt" ? "-submittedAt" : key,
      page: 1,
    });
  };
  const ariaSort = (key: string): "ascending" | "descending" | "none" =>
    q.sort.replace(/^-/, "") === key ? (q.sort.startsWith("-") ? "descending" : "ascending") : "none";

  const deptName = options.departments.find((d) => d.id === q.departmentId)?.name;
  const chips: [string, string][] = [];
  if (q.q) chips.push(["q", `Search: ${q.q}`]);
  if (deptName) chips.push(["departmentId", deptName]);
  if (q.position) chips.push(["position", POSITION_LABELS[q.position]!]);
  if (q.status) chips.push(["status", STATUS_LABELS[q.status]]);
  if (q.phd) chips.push(["phd", `Ph.D.: ${q.phd}`]);
  if (q.exam) chips.push(["exam", `Exam: ${q.exam}`]);
  if (q.minExp !== undefined) chips.push(["minExp", `Experience ≥ ${q.minExp} years`]);
  if (q.hod) chips.push(["hod", q.hod === "assigned" ? "With a HOD" : "Not yet with a HOD"]);
  if (q.from) chips.push(["from", `From ${q.from}`]);
  if (q.to) chips.push(["to", `To ${q.to}`]);

  const assignableRows = list.rows.filter((r) => ASSIGNABLE.includes(r.status as AppStatus));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allOnPage = assignableRows.length > 0 && assignableRows.every((r) => selected.has(r.id));

  return (
    <div className="page-stack">
      <PageHeader
        crumbs={[["Dashboard", "/staff"], ["Applications"]]}
        eyebrow={admin ? "Admin" : "HR – N4 Section"}
        title="Applications"
        description="All submitted applications for faculty and research positions. Filter, review, assign to a HOD and track status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/staff/summary" className="btn-secondary">
              <Download className="h-4 w-4" aria-hidden="true" /> Summary &amp; export
            </Link>
            <Link to="/admin/vacancies/new" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden="true" /> New job profile
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Link
          to={withParams({ recruitmentCategory: null, page: 1 })}
          className={`chip font-semibold transition-colors ${!q.recruitmentCategory ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}
        >
          All Applications
        </Link>
        <Link
          to={withParams({ recruitmentCategory: "FACULTY", page: 1 })}
          className={`chip font-semibold transition-colors ${q.recruitmentCategory === "FACULTY" ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}
        >
          Faculty
        </Link>
        <Link
          to={withParams({ recruitmentCategory: "RESEARCH", page: 1 })}
          className={`chip font-semibold transition-colors ${q.recruitmentCategory === "RESEARCH" ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}
        >
          Research
        </Link>
      </div>

      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["Submitted", counts.total, "?", FileText, "blue"],
            [
              "Not yet with a HOD",
              counts.submitted,
              withParams({ hod: "unassigned", status: null, page: 1 }),
              Users,
              "blue",
            ],
            ["With HOD", counts.withHod, withParams({ status: "ASSIGNED_TO_HOD", page: 1 }), Clock, "orange"],
            [
              "Accepted by HOD",
              counts.hodAccepted,
              withParams({ status: "HOD_ACCEPTED", page: 1 }),
              CheckCircle2,
              "green",
            ],
            [
              "Position change",
              counts.hodChanged,
              withParams({ status: "HOD_RECOMMENDED_CHANGE", page: 1 }),
              ArrowLeftRight,
              "purple",
            ],
            [
              "Rejected by HOD",
              counts.hodRejected,
              withParams({ status: "HOD_REJECTED", page: 1 }),
              XCircle,
              "red",
            ],
          ] as const
        ).map(([label, value, to, icon, accent], i) => (
          <StatTile
            key={label}
            label={label}
            value={value}
            to={to}
            icon={icon}
            accent={accent}
            share={i > 0 && counts.total ? Math.round((value / counts.total) * 100) : undefined}
          />
        ))}
      </section>

      {departments.length > 0 && (
        <section className="card p-4 sm:p-5" aria-labelledby="by-dept">
          <h2 id="by-dept" className="text-lg">
            Department-wise
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Applications by department</caption>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">HOD</th>
                  <th scope="col" className="text-right">
                    Total
                  </th>
                  <th scope="col" className="text-right">
                    Not with HOD
                  </th>
                  <th scope="col" className="text-right">
                    With HOD
                  </th>
                  <th scope="col" className="text-right">
                    Accepted
                  </th>
                  <th scope="col" className="text-right">
                    Change
                  </th>
                  <th scope="col" className="text-right">
                    Rejected
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr
                    key={d.id}
                    aria-current={d.id === q.departmentId ? "true" : undefined}
                    className="aria-[current=true]:bg-brand-50/50"
                  >
                    <td className="font-medium">
                      {d.name} <span className="text-muted">({d.code})</span>
                    </td>
                    <td className="text-sm">
                      {d.hods.length === 1 ? (
                        d.hods[0]
                      ) : d.hods.length ? (
                        <span className="text-warning">{d.hods.length} HODs — choose when assigning</span>
                      ) : (
                        <span className="text-warning">No HOD yet</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{d.total}</td>
                    <td className="text-right tabular-nums">{d.unassigned}</td>
                    <td className="text-right tabular-nums">{d.withHod}</td>
                    <td className="text-right tabular-nums">{d.accepted}</td>
                    <td className="text-right tabular-nums">{d.changed}</td>
                    <td className="text-right tabular-nums">{d.rejected}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canAssign && d.unassigned > 0 && d.hods.length === 1 && (
                          <Form method="post">
                            <CsrfInput />
                            <input type="hidden" name="intent" value="auto" />
                            <input type="hidden" name="scope" value="filtered" />
                            <input type="hidden" name="departmentId" value={d.id} />
                            <ConfirmDialog
                              trigger={`Assign ${d.unassigned}`}
                              triggerClassName="btn-primary btn-sm whitespace-nowrap"
                              title={`Send ${d.name} applications to the HOD?`}
                              confirmLabel="Send to HOD"
                              disabled={nav.state !== "idle"}
                            >
                              <p>
                                {d.unassigned} application{d.unassigned === 1 ? "" : "s"} of {d.name} not yet
                                with a HOD will be sent to <strong>{d.hods[0]}</strong> for department review.
                                The HOD is notified by e-mail and the step is recorded in the audit log.
                              </p>
                            </ConfirmDialog>
                          </Form>
                        )}
                        <Link
                          to={withParams({ departmentId: d.id, page: 1 })}
                          className="whitespace-nowrap text-sm font-semibold"
                        >
                          Show
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Form method="get" className="card space-y-4 p-4 sm:p-5" aria-label="Filter applications">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="f-q" className="block text-sm font-semibold">
              Search
            </label>
            <input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q.q ?? ""}
              placeholder="Reference no., candidate name or e-mail"
              className="field-input mt-1"
            />
          </div>
          <FilterSelect
            name="departmentId"
            label="Department"
            value={q.departmentId}
            options={options.departments.map((d) => [d.id, d.name])}
          />
          <FilterSelect
            name="position"
            label="Applied for"
            value={q.position}
            options={Object.entries(POSITION_LABELS)}
          />
          <FilterSelect
            name="status"
            label="Status"
            value={q.status}
            options={(Object.keys(STATUS_LABELS) as AppStatus[])
              .filter((s) => s !== "DRAFT")
              .map((s) => [s, STATUS_LABELS[s]])}
          />
          <FilterSelect
            name="phd"
            label="Ph.D."
            value={q.phd}
            allLabel="Any or none"
            options={[
              ["awarded", "Awarded"],
              ["submitted", "Thesis submitted"],
              ["pursuing", "Pursuing"],
              ["any", "Awarded, submitted or pursuing"],
              ["none", "No Ph.D."],
            ]}
          />
          <FilterSelect
            name="exam"
            label="GATE / competitive exam"
            value={q.exam}
            allLabel="Any or none"
            options={[
              ["any", "Any exam"],
              ...options.exams.map((e) => [e, e] as [string, string]),
              ["none", "No exam"],
            ]}
          />
          <FilterSelect
            name="minExp"
            label="Minimum experience"
            value={q.minExp}
            allLabel="Any"
            options={[1, 2, 3, 5, 8, 10, 15].map((n) => [String(n), `${n}+ years`])}
          />
          <FilterSelect
            name="hod"
            label="HOD assignment"
            value={q.hod}
            options={[
              ["unassigned", "Not yet with a HOD"],
              ["assigned", "With a HOD"],
            ]}
          />
          <div>
            <label htmlFor="f-from" className="block text-sm font-semibold">
              Submitted from
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              defaultValue={q.from ?? ""}
              className="field-input mt-1"
            />
          </div>
          <div>
            <label htmlFor="f-to" className="block text-sm font-semibold">
              Submitted to
            </label>
            <input id="f-to" name="to" type="date" defaultValue={q.to ?? ""} className="field-input mt-1" />
          </div>
        </div>
        <input type="hidden" name="sort" value={q.sort} />
        <input type="hidden" name="size" value={q.size} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary">
            Apply filters
          </button>
          {chips.length > 0 && (
            <Link to="/staff" className="btn-secondary">
              Clear all
            </Link>
          )}
        </div>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map(([k, label]) => (
              <li key={k}>
                <Link
                  to={withParams({ [k]: null, page: 1 })}
                  className="chip no-underline"
                  aria-label={`Remove filter ${label}`}
                >
                  {label} <span aria-hidden="true">✕</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Form>

      <section aria-labelledby="results" className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-5">
          <h2 id="results" className="text-lg">
            <span role="status">
              {list.total} application{list.total === 1 ? "" : "s"}
              {nav.state === "loading" ? " — updating…" : ""}
            </span>
          </h2>
          {canExport && (
            <a href={`/staff/summary${location.search}#export`} className="btn-secondary py-2 text-sm">
              Export these to Excel (CSV)
            </a>
          )}
        </div>

        {canAssign && (
          <div className="border-b border-line bg-soft/60 p-4 sm:px-5">
            {q.departmentId ? (
              <Form method="post" className="flex flex-wrap items-end gap-3">
                <CsrfInput />
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="applicationId" value={id} />
                ))}
                <div>
                  <label htmlFor="hodId" className="block text-sm font-semibold">
                    Move to HOD of {deptName}
                  </label>
                  <select
                    id="hodId"
                    name="hodId"
                    required
                    className="field-input mt-1 min-w-64"
                    defaultValue={hods.length === 1 ? hods[0]!.id : ""}
                  >
                    {hods.length !== 1 && <option value="">Choose a HOD…</option>}
                    {hods.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.profile?.fullName ?? h.email}
                      </option>
                    ))}
                  </select>
                </div>
                <input type="hidden" name="scope" value={selected.size ? "selected" : "filtered"} />
                <ConfirmDialog
                  trigger={
                    selected.size
                      ? `Move ${selected.size} selected`
                      : "Move all not-yet-assigned in this department"
                  }
                  title="Move applications to the HOD?"
                  confirmLabel="Move applications"
                  disabled={!hods.length || nav.state !== "idle"}
                >
                  <p>
                    {selected.size
                      ? `${selected.size} selected application${selected.size === 1 ? "" : "s"}`
                      : "Every application of this department that matches the filters and is not yet with a HOD"}{" "}
                    will be moved to the HOD for review. The HOD is notified by e-mail. This is recorded in
                    the audit log.
                  </p>
                </ConfirmDialog>
                {!hods.length && (
                  <p className="text-sm text-warning">
                    No HOD is set up for this department yet.{" "}
                    {admin ? <Link to="/admin/users">Add a HOD</Link> : "Ask the Admin to add one."}
                  </p>
                )}
              </Form>
            ) : (
              <Form method="post" className="flex flex-wrap items-center gap-3">
                <CsrfInput />
                <input type="hidden" name="intent" value="auto" />
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="applicationId" value={id} />
                ))}
                <input type="hidden" name="scope" value={selected.size ? "selected" : "filtered"} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-ink">Send to department HODs</p>
                  <p className="text-muted">
                    Each application goes to the HOD of its own department. Tick rows below to send only
                    those, or use the <strong>Assign</strong> button of a department in the table above.
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    selected.size
                      ? `Send ${selected.size} selected to their HODs`
                      : "Send all not-yet-assigned to their HODs"
                  }
                  title="Send applications to their department HODs?"
                  confirmLabel="Send to HODs"
                  disabled={
                    nav.state !== "idle" || (!selected.size && departments.every((d) => d.unassigned === 0))
                  }
                >
                  <p>
                    {selected.size
                      ? `The ${selected.size} selected application${selected.size === 1 ? "" : "s"}`
                      : "Every faculty application matching the current filters that is not yet with a HOD"}{" "}
                    will be sent to the HOD of its department. Each HOD is notified by e-mail.
                  </p>
                  <p className="text-muted">
                    Departments without a HOD, or with more than one, are skipped and listed afterwards.
                    Research applications are not sent to HODs.
                  </p>
                </ConfirmDialog>
              </Form>
            )}
          </div>
        )}

        {list.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No applications match these filters">
              Change or <Link to="/staff">clear the filters</Link>.
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Applications, sortable by column</caption>
              <thead>
                <tr>
                  {canAssign && (
                    <th scope="col" className="w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label="Select all assignable applications on this page"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected(allOnPage ? new Set() : new Set(assignableRows.map((r) => r.id)))
                        }
                      />
                    </th>
                  )}
                  {(["referenceNo", "candidate"] as const).map((k) => (
                    <th key={k} scope="col" aria-sort={ariaSort(k)}>
                      <Link to={sortLink(k)} className="text-muted no-underline">
                        {SORTABLE[k]} <SortIcon dir={ariaSort(k)} />
                      </Link>
                    </th>
                  ))}
                  <th scope="col">Department</th>
                  <th scope="col">Applied for</th>
                  <th scope="col">Ph.D.</th>
                  <th scope="col">Exam</th>
                  <th scope="col">Experience</th>
                  <th scope="col" aria-sort={ariaSort("submittedAt")}>
                    <Link to={sortLink("submittedAt")} className="text-muted no-underline">
                      Submitted <SortIcon dir={ariaSort("submittedAt")} />
                    </Link>
                  </th>
                  <th scope="col" aria-sort={ariaSort("status")}>
                    <Link to={sortLink("status")} className="text-muted no-underline">
                      Status <SortIcon dir={ariaSort("status")} />
                    </Link>
                  </th>
                  <th scope="col">HOD</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const isResearch = r.recruitmentCategory === "RESEARCH" || !r.vacancy.department;
                  const applied = r.appliedPosition
                    ? (POSITION_LABELS[r.appliedPosition] ?? r.appliedPosition)
                    : (r.vacancy.researchPositionTitle ??
                      (r.vacancy.position
                        ? (POSITION_LABELS[r.vacancy.position] ?? r.vacancy.position)
                        : "Research Assistant"));
                  const rev = r.currentRevision;
                  return (
                    <tr key={r.id}>
                      {canAssign && (
                        <td>
                          {!isResearch && ASSIGNABLE.includes(r.status as AppStatus) && (
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                              aria-label={`Select ${r.referenceNo}`}
                            />
                          )}
                        </td>
                      )}
                      <td>
                        <Link
                          to={`/staff/applications/${r.id}`}
                          state={{ back: location.pathname + location.search }}
                          className="whitespace-nowrap font-semibold"
                        >
                          {r.referenceNo}
                        </Link>
                      </td>
                      <td className="font-medium">{rev?.candidateName}</td>
                      <td>
                        {r.vacancy.department?.code ? (
                          <span title={r.vacancy.department.name}>{r.vacancy.department.code}</span>
                        ) : (
                          <span className="rounded bg-soft px-2 py-0.5 text-xs font-semibold text-ink">
                            RA
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {applied}
                        {r.effectivePosition && (
                          <span className="block text-xs text-brand-700">
                            → {POSITION_LABELS[r.effectivePosition]}
                          </span>
                        )}
                      </td>

                      <td>{rev?.phdStatus ?? "—"}</td>
                      <td>{rev?.competitiveExams.length ? rev.competitiveExams.join(", ") : "—"}</td>
                      <td className="whitespace-nowrap">
                        {rev?.totalExperienceMonths != null
                          ? formatYearsMonths(splitMonths(rev.totalExperienceMonths))
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap">{formatDate(r.submittedAt)}</td>
                      <td>
                        <Badge tone={statusTone(r.status)}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                        {r.processingStatus !== "READY" && (
                          <span className="mt-1 block text-xs text-muted">
                            {PROCESSING_LABELS[r.processingStatus]}
                          </span>
                        )}
                      </td>
                      <td className="text-sm">
                        {r.assignedHod ? (r.assignedHod.profile?.fullName ?? r.assignedHod.email) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm sm:px-5"
        >
          <Form method="get" className="flex items-center gap-2">
            {[...params]
              .filter(([k]) => k !== "size" && k !== "page")
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <label htmlFor="size">Rows per page</label>
            <select
              id="size"
              name="size"
              defaultValue={q.size}
              className="field-input w-20 py-1"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Form>
          <span className="flex items-center gap-2">
            <span>
              Page {q.page} of {list.pages}
            </span>
            {q.page > 1 && (
              <Link to={withParams({ page: q.page - 1 })} className="btn-secondary py-1">
                Previous
              </Link>
            )}
            {q.page < list.pages && (
              <Link to={withParams({ page: q.page + 1 })} className="btn-secondary py-1">
                Next
              </Link>
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
