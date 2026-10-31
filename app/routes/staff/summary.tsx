import {
  Archive,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Gavel,
  Hourglass,
  Printer,
  Star,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/summary";
import { BarList, ColumnTrend, Ring } from "~/components/charts";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { Modal } from "~/components/modal";
import { EmptyState, FilterSelect, ListPagination, PageHeader, StatTile } from "~/components/staff";
import { SummaryTable } from "~/components/summary-table";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { hasPermission, hodDepartments, isHodReviewer, isSuperAdmin } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";
import { ValidationError } from "~/modules/core/errors";
import {
  departmentCounts,
  filterOptions,
  listApplications,
  parseColumns,
  parseListQuery,
  recruitmentYears,
  reportStats,
} from "~/modules/reporting/applications.server";
import { EXPORT_COLUMNS } from "~/modules/reporting/columns";
import { currentYear, recruitmentName } from "~/modules/reporting/years";
import {
  approveSummarySheet,
  decidePositionChange,
  departmentSummary,
  listSummarySheets,
  pendingPositionChanges,
} from "~/modules/reviews/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Summary and reports — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  // Read-only viewers work from the applications list only.
  if (!hasPermission(user.grants, "summary:read") && !hasPermission(user.grants, "review:record"))
    throw redirect("/staff");
  const office = hasPermission(user.grants, "summary:read");
  const hodDepts = isSuperAdmin(user.grants)
    ? (
        await prisma.application.findMany({
          where: { assignedHodId: { not: null }, departmentId: { not: null } },
          distinct: ["departmentId"],
          select: { departmentId: true },
        })
      ).map((a) => a.departmentId!)
    : isHodReviewer(user.grants)
      ? hodDepartments(user.grants)
      : [];
  const hod = await Promise.all(
    hodDepts.map(async (id) => {
      const dept = await prisma.department.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true },
      });
      return { dept, ...(await departmentSummary(id)) };
    }),
  );
  const sheets = await listSummarySheets(user);
  if (!office) return { office: false as const, hod, sheets };

  // Recruitment year: the latest year by default, every year with ?year=all.
  const url = new URL(request.url);
  const years = await recruitmentYears();
  const yearParam = url.searchParams.get("year");
  if (!yearParam && years[0]) url.searchParams.set("year", years[0].year);
  if (yearParam === "all") url.searchParams.delete("year");
  const q = parseListQuery(url);

  const [departments, options, list, approvals, me, stats] = await Promise.all([
    departmentCounts(user, q),
    filterOptions(),
    listApplications(user, { ...q, sort: "referenceNo" }),
    pendingPositionChanges(user),
    prisma.user.findUnique({ where: { id: user.id }, select: { exportColumns: true } }),
    reportStats(user, q),
  ]);
  return {
    office: true as const,
    hod,
    sheets,
    departments,
    options,
    list,
    q,
    years,
    live: currentYear(),
    yearSelected: yearParam === "all" ? "all" : (q.year ?? "all"),
    approvals,
    stats,
    canExport: hasPermission(user.grants, "application:export"),
    columns: parseColumns(Array.isArray(me?.exportColumns) ? (me.exportColumns as string[]) : null),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "application:list");
  const form = await readForm(request, context);
  const ip = clientIp(request);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "approve-sheet": {
        const s = await approveSummarySheet(user, String(form.get("departmentId")), ip);
        return {
          message: `Summary sheet version ${s.version} approved. HR – N4 Section and the Admin have been notified.`,
        };
      }
      case "position":
        await decidePositionChange(
          user,
          String(form.get("requestId")),
          form.get("approve") === "yes",
          String(form.get("note") ?? ""),
          ip,
        );
        return { message: "Recommendation decided." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function Summary({ loaderData, actionData }: Route.ComponentProps) {
  const L = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={L.office ? "Reports" : "Department-wise summary"}
        title={L.office ? "Summary and reports" : "Summary sheets"}
        description={
          L.office
            ? "Where every application stands, department by department, with HOD summary sheets and Excel export."
            : "Your department's decisions. When every application is decided, approve the summary sheet; it is then shared with HR – N4 Section and the Admin."
        }
        actions={
          L.office ? (
            <>
              <YearSwitch years={L.years} selected={L.yearSelected} live={L.live} />
              <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" /> Print
              </button>
            </>
          ) : undefined
        }
      />
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}

      {L.hod.map((h) => (
        <section key={h.dept.id} className="card space-y-4" aria-labelledby={`hod-${h.dept.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id={`hod-${h.dept.id}`} className="text-xl">
                {h.dept.name} — {h.academicYear}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {h.rows.length} application{h.rows.length === 1 ? "" : "s"} · {h.pending.length} waiting for
                your decision
              </p>
            </div>
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="approve-sheet" />
              <input type="hidden" name="departmentId" value={h.dept.id} />
              <ConfirmDialog
                trigger="Generate and approve summary sheet"
                title="Approve the summary sheet?"
                confirmLabel="Approve"
                disabled={busy || h.pending.length > 0 || h.rows.length === 0}
              >
                <p>
                  The sheet below is saved as an approved, unchangeable version and shared with HR – N4
                  Section and the Admin. To change a decision afterwards, the Admin has to reopen the sheet.
                </p>
              </ConfirmDialog>
            </Form>
          </div>
          {h.pending.length > 0 && (
            <Alert tone="warning" title="Decide every application first">
              Waiting: {h.pending.join(", ")}. <Link to="/staff/review">Go to your review queue</Link>.
            </Alert>
          )}
          <SummaryTable rows={h.rows} />
        </section>
      ))}

      {L.office && <OfficeReport L={L} busy={busy} />}

      <section className="card space-y-3" aria-labelledby="sheets">
        <h2 id="sheets" className="text-xl">
          Approved summary sheets
        </h2>
        {L.sheets.length === 0 ? (
          <EmptyState title="No summary sheet has been approved yet">
            HODs approve a sheet after deciding every application.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Academic year</th>
                  <th scope="col" className="text-right">
                    Version
                  </th>
                  <th scope="col" className="text-right">
                    Candidates
                  </th>
                  <th scope="col">Approved</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {L.sheets.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.department.name}</td>
                    <td>{s.academicYear}</td>
                    <td className="text-right tabular-nums">{s.version}</td>
                    <td className="text-right tabular-nums">{(s.rows as unknown[]).length}</td>
                    <td className="whitespace-nowrap">{formatDateTime(s.approvedAt)}</td>
                    <td>
                      <Badge tone={s.status === "APPROVED" ? "success" : "neutral"}>
                        {s.status === "APPROVED" ? "Current" : "Superseded"}
                      </Badge>
                    </td>
                    <td>
                      <Link to={`/staff/summary/${s.id}`} className="whitespace-nowrap text-sm font-semibold">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type OfficeData = Extract<Route.ComponentProps["loaderData"], { office: true }>;

/** Recruitment-year switcher: the live year, archived years and "all years". */
function YearSwitch({
  years,
  selected,
  live,
}: {
  years: { year: string; vacancies: number; applications: number }[];
  selected: string;
  live: string;
}) {
  const [params] = useSearchParams();
  return (
    <Form method="get" className="flex items-center gap-2 print:hidden">
      {[...params.entries()]
        .filter(([k]) => k !== "year" && k !== "page")
        .map(([k, v]) => (
          <input key={`${k}-${v}`} type="hidden" name={k} value={v} />
        ))}
      <label htmlFor="year" className="sr-only">
        Recruitment year
      </label>
      <select
        id="year"
        name="year"
        defaultValue={selected}
        className="field-input py-2 font-semibold"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {years.map((y) => (
          <option key={y.year} value={y.year}>
            {recruitmentName(y.year)}
            {y.year === live ? " (current)" : " (archived)"} · {y.applications}
          </option>
        ))}
        <option value="all">All years</option>
      </select>
      <noscript>
        <button type="submit" className="btn-secondary">
          Show
        </button>
      </noscript>
    </Form>
  );
}

function OfficeReport({ L, busy }: { L: OfficeData; busy: boolean }) {
  const s = L.stats;
  const decided = s.pipeline
    .filter((p) => ["accepted", "changed", "rejected", "shortlisted"].includes(p.key))
    .reduce((t, p) => t + p.value, 0);
  const withHod = s.pipeline.find((p) => p.key === "hod")?.value ?? 0;
  const notYet = s.pipeline.find((p) => p.key === "new")?.value ?? 0;
  const archived = L.yearSelected !== "all" && L.yearSelected !== L.live;
  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);
  const listHref = (extra: Record<string, string>) =>
    `/staff?${new URLSearchParams({ ...(L.q.year ? { year: L.q.year } : {}), ...extra })}`;

  return (
    <>
      {archived && (
        <Alert tone="info" title={`${recruitmentName(L.yearSelected)} is archived`}>
          Everything from this year stays available to read and export. New vacancies belong to{" "}
          {recruitmentName(L.live)}.
        </Alert>
      )}

      {/* Headline numbers */}
      <section aria-label="Headline numbers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Applications" value={s.total.toLocaleString("en-IN")} icon={Users} accent="brand" />
        <StatTile
          label="Not yet with a HOD"
          value={notYet}
          share={pct(notYet)}
          icon={Hourglass}
          accent="orange"
          to={listHref({ hod: "unassigned" })}
        />
        <StatTile
          label="With HODs now"
          value={withHod}
          share={pct(withHod)}
          icon={BarChart3}
          accent="blue"
          to={listHref({ status: "ASSIGNED_TO_HOD" })}
        />
        <div className="flex items-center gap-4 rounded-xl border border-line bg-paper p-4 shadow-xs">
          <Ring value={decided} total={s.total} label={`${pct(decided)}% decided by HODs`} />
          <div>
            <p className="text-sm text-muted">Decided by HODs</p>
            <p className="text-2xl font-bold text-ink tabular-nums">
              {decided}
              <span className="ml-1.5 text-sm font-semibold text-muted">{pct(decided)}%</span>
            </p>
          </div>
        </div>
      </section>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3" aria-labelledby="pipeline">
          <h2 id="pipeline" className="text-lg">
            Where applications are
          </h2>
          <p className="mt-0.5 text-sm text-muted">Current stage of every submitted application.</p>
          <BarList className="mt-5" data={s.pipeline} total={s.total} />
        </section>
        <section className="card lg:col-span-2" aria-labelledby="trend">
          <h2 id="trend" className="text-lg">
            Submissions per week
          </h2>
          <p className="mt-0.5 text-sm text-muted">Last 12 weeks with submissions.</p>
          <div className="mt-5">
            <ColumnTrend data={s.trend} label="Applications submitted per week" />
          </div>
        </section>
        <section className="card lg:col-span-2" aria-labelledby="positions">
          <h2 id="positions" className="text-lg">
            Applied for
          </h2>
          <BarList className="mt-4" data={s.positions} total={s.total} />
          {s.categories.length > 1 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-muted">Stream</h3>
              <BarList className="mt-3" data={s.categories} total={s.total} />
            </>
          )}
        </section>
        <section className="card lg:col-span-3" aria-labelledby="reviews">
          <h2 id="reviews" className="text-lg">
            Reviews and ratings
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Dean / Principal accepted", s.final.accepted, CheckCircle2, "text-success"],
                ["Dean / Principal rejected", s.final.rejected, Gavel, "text-danger"],
              ] as const
            ).map(([label, v, Icon, tone]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl bg-soft p-3">
                <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
                <div>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums">{v}</dd>
                </div>
              </div>
            ))}
            {(
              [
                ["Average HOD rating", s.avgHodRating],
                ["Average Dean / Principal rating", s.avgFinalRating],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl bg-soft p-3">
                <Star className="h-5 w-5 shrink-0 fill-gold-400 text-gold-400" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums">
                    {v ? v.toFixed(1) : "—"}
                    {v ? <span className="text-sm font-semibold text-muted"> / 5</span> : null}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* Department report */}
      <section className="card space-y-4" aria-labelledby="dept">
        <div>
          <h2 id="dept" className="text-lg">
            Department report
          </h2>
          <p className="mt-0.5 text-sm text-muted">Select a number to open those applications.</p>
        </div>
        {L.departments.length === 0 ? (
          <EmptyState title="No submitted applications for this selection" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Department</th>
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
                  <th scope="col" className="min-w-36">
                    Decided
                  </th>
                </tr>
              </thead>
              <tbody>
                {L.departments.map((d) => {
                  const done = d.accepted + d.changed + d.rejected + d.shortlisted;
                  const share = d.total ? Math.round((done / d.total) * 100) : 0;
                  const cell = (v: number, extra: Record<string, string>) =>
                    v ? (
                      <Link to={listHref({ departmentId: d.id, ...extra })} className="font-semibold">
                        {v}
                      </Link>
                    ) : (
                      <span className="text-muted">0</span>
                    );
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="font-semibold">{d.name}</span>
                        <span className="block text-xs text-muted">
                          {d.hods.length ? `HOD: ${d.hods.join(", ")}` : "No HOD set up"}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{cell(d.total, {})}</td>
                      <td className="text-right tabular-nums">{cell(d.unassigned, { hod: "unassigned" })}</td>
                      <td className="text-right tabular-nums">
                        {cell(d.withHod, { status: "ASSIGNED_TO_HOD" })}
                      </td>
                      <td className="text-right tabular-nums">
                        {cell(d.accepted, { status: "HOD_ACCEPTED" })}
                      </td>
                      <td className="text-right tabular-nums">
                        {cell(d.changed, { status: "HOD_RECOMMENDED_CHANGE" })}
                      </td>
                      <td className="text-right tabular-nums">
                        {cell(d.rejected, { status: "HOD_REJECTED" })}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <progress
                            className="usage-bar w-24"
                            max={100}
                            value={share}
                            aria-label={`${d.name}: ${share}% decided`}
                          />
                          <span className="text-xs font-semibold tabular-nums">{share}%</span>
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

      {L.approvals.length > 0 && (
        <section className="card space-y-4" aria-labelledby="approvals">
          <h2 id="approvals" className="text-lg">
            Position changes waiting for approval ({L.approvals.length})
          </h2>
          <ul className="space-y-3">
            {L.approvals.map((p) => (
              <li key={p.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/staff/applications/${p.application.id}`} className="font-semibold">
                      {p.application.referenceNo} — {p.application.currentRevision?.candidateName}
                    </Link>
                    <p className="text-sm">
                      {p.application.vacancy.department?.name ?? "Research"}:{" "}
                      {POSITION_LABELS[p.fromPosition] ?? p.fromPosition} →{" "}
                      <strong>{POSITION_LABELS[p.toPosition] ?? p.toPosition}</strong>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted">{p.reason}</p>
                  </div>
                  <Form method="post" className="flex flex-wrap items-end gap-2">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="position" />
                    <input type="hidden" name="requestId" value={p.id} />
                    <label className="sr-only" htmlFor={`n-${p.id}`}>
                      Note
                    </label>
                    <input
                      id={`n-${p.id}`}
                      name="note"
                      placeholder="Note (required to decline)"
                      className="field-input w-56 py-2"
                    />
                    <ConfirmDialog
                      trigger="Approve"
                      triggerClassName="btn-primary py-2"
                      title="Approve the position change?"
                      confirmLabel="Approve change"
                      confirmName="approve"
                      confirmValue="yes"
                      disabled={busy}
                    >
                      <p>
                        The application will be considered for {POSITION_LABELS[p.toPosition] ?? p.toPosition}
                        . This is recorded in the audit log.
                      </p>
                    </ConfirmDialog>
                    <ConfirmDialog
                      trigger="Decline"
                      triggerClassName="btn-secondary py-2"
                      tone="danger"
                      title="Decline the recommendation?"
                      confirmLabel="Decline"
                      confirmName="approve"
                      confirmValue="no"
                      disabled={busy}
                    >
                      <p>
                        The application stays at the position the candidate applied for. Add a note explaining
                        why.
                      </p>
                    </ConfirmDialog>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ApplicationsReport L={L} />
    </>
  );
}

function ApplicationsReport({ L }: { L: OfficeData }) {
  const [params] = useSearchParams();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const allVisibleIds = L.list.rows.map((r) => r.id);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedRows.has(id));
  const toggleAll = () => setSelectedRows(allVisibleSelected ? new Set() : new Set(allVisibleIds));
  const toggleRow = (id: string) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="card space-y-4" aria-labelledby="all">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="all" className="text-lg">
            Applications
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Filter, tick rows if you need only some, then export to Excel.
          </p>
        </div>
        {L.canExport && <ExportDialog L={L} selected={selectedRows} />}
      </div>

      <Form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-soft/70 p-3 print:hidden">
        {L.q.year && <input type="hidden" name="year" value={L.q.year} />}
        <FilterSelect
          name="recruitmentCategory"
          label="Stream"
          value={L.q.recruitmentCategory}
          options={[
            ["FACULTY", "Faculty"],
            ["RESEARCH", "Research"],
          ]}
        />
        <FilterSelect
          name="departmentId"
          label="Department"
          value={L.q.departmentId}
          options={L.options.departments.map((d) => [d.id, d.name])}
        />
        {L.options.specialisations?.length > 0 && (
          <FilterSelect
            name="researchSpecialisationId"
            label="Specialisation"
            value={L.q.researchSpecialisationId}
            options={L.options.specialisations.map((s: { id: string; name: string }) => [s.id, s.name])}
          />
        )}
        <FilterSelect
          name="position"
          label="Applied for"
          value={L.q.position}
          options={Object.entries(POSITION_LABELS)}
        />
        <fieldset>
          <legend className="block text-sm font-medium">Mode of study</legend>
          <div className="mt-1 flex h-[2.625rem] items-center gap-1 rounded-lg border border-line-strong bg-paper px-1.5">
            {(
              [
                ["full", "Full-time", "Every degree and the Ph.D. were full-time"],
                ["part", "Part-time", "At least one degree or the Ph.D. was part-time"],
                ["distance", "Distance", "At least one degree was by distance education"],
              ] as const
            ).map(([v, label, hint]) => (
              <label
                key={v}
                title={hint}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm has-[:checked]:bg-brand-50 has-[:checked]:font-semibold has-[:checked]:text-brand-800"
              >
                <input
                  type="checkbox"
                  name="mode"
                  value={v}
                  defaultChecked={L.q.mode?.includes(v)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn-secondary">
          Apply filters
        </button>
      </Form>

      {L.list.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm print:hidden">
          <span className="text-muted" aria-live="polite">
            {selectedRows.size > 0
              ? `${selectedRows.size} selected for export`
              : `All ${L.list.total} matching applications will be exported`}
          </span>
          {selectedRows.size > 0 && (
            <button type="button" onClick={() => setSelectedRows(new Set())} className="btn-ghost btn-sm">
              Clear selection
            </button>
          )}
        </div>
      )}

      {L.list.rows.length === 0 ? (
        <EmptyState title="No applications for these filters" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Applications</caption>
            <thead>
              <tr>
                <th scope="col" className="w-10 text-center print:hidden">
                  <input
                    type="checkbox"
                    aria-label="Select all applications on this page"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded"
                  />
                </th>
                <th scope="col" className="text-right">
                  S. No.
                </th>
                <th scope="col">Candidate</th>
                <th scope="col">Department</th>
                <th scope="col">Applied for</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {L.list.rows.map((r, i) => (
                <tr key={r.id} className={selectedRows.has(r.id) ? "bg-brand-50/50" : undefined}>
                  <td className="text-center print:hidden">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.currentRevision?.candidateName ?? r.referenceNo}`}
                      checked={selectedRows.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      className="h-4 w-4 rounded"
                    />
                  </td>
                  <td className="text-right tabular-nums">{(L.q.page - 1) * L.q.size + i + 1}</td>
                  <td>
                    <Link to={`/staff/applications/${r.id}`} className="font-semibold">
                      {r.currentRevision?.candidateName}
                    </Link>
                    <span className="block font-mono text-xs text-muted">{r.referenceNo}</span>
                  </td>
                  <td>
                    {r.vacancy.department?.name ?? r.vacancy.researchSpecialisation?.name ?? "Research"}
                  </td>
                  <td>
                    {r.appliedPosition
                      ? (POSITION_LABELS[r.appliedPosition] ?? r.appliedPosition)
                      : r.vacancy.position
                        ? (POSITION_LABELS[r.vacancy.position] ?? r.vacancy.position)
                        : (r.vacancy.researchPositionTitle ?? "Research Assistant")}
                    {r.effectivePosition && (
                      <span className="block text-xs text-brand-700">
                        → {POSITION_LABELS[r.effectivePosition] ?? r.effectivePosition}
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {L.list.total > 0 && (
        <div className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6 lg:-mx-7 lg:-mb-7 print:hidden">
          <ListPagination
            page={L.q.page}
            pages={L.list.pages}
            total={L.list.total}
            pageSize={L.q.size}
            href={(n) => {
              const sp = new URLSearchParams(params);
              sp.set("page", String(n));
              return `?${sp}`;
            }}
          />
        </div>
      )}
    </section>
  );
}

/** Export to Excel (CSV): columns, preview and download, in a dialog. */
function ExportDialog({ L, selected }: { L: OfficeData; selected: Set<string> }) {
  const [params] = useSearchParams();
  const [cols, setCols] = useState<Set<string>>(new Set(L.columns));
  const groups = [...new Set(EXPORT_COLUMNS.map((c) => c.group))];
  const filterKeys = [
    "year",
    "recruitmentCategory",
    "departmentId",
    "researchSpecialisationId",
    "position",
    "status",
    "phd",
    "exam",
    "minExp",
    "q",
    "mode",
  ];
  const rows = selected.size > 0 ? selected.size : L.list.total;
  const chosen = EXPORT_COLUMNS.filter((c) => cols.has(c.key));
  const sample = L.list.rows.slice(0, 3);
  const valueOf = (key: string, r: (typeof L.list.rows)[number], i: number): string | number => {
    if (key === "sNo") return i + 1;
    if (key === "referenceNo") return r.referenceNo ?? "—";
    if (key === "candidateName") return r.currentRevision?.candidateName ?? "";
    if (key === "department")
      return r.vacancy.department?.name ?? r.vacancy.researchSpecialisation?.name ?? "Research";
    if (key === "appliedFor")
      return (
        (r.appliedPosition && POSITION_LABELS[r.appliedPosition]) ??
        (r.vacancy.position && POSITION_LABELS[r.vacancy.position]) ??
        r.vacancy.researchPositionTitle ??
        "Research Assistant"
      );
    if (key === "status") return STATUS_LABELS[r.status as AppStatus];
    if (key === "phdStatus") return r.currentRevision?.phdStatus ?? "None";
    return "…";
  };

  return (
    <Modal
      size="xl"
      trigger={
        <>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Export to Excel
        </>
      }
      icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
      title="Export to Excel"
      description={`${rows} row${rows === 1 ? "" : "s"} · ${cols.size} column${cols.size === 1 ? "" : "s"}. Safe to open in Excel (formula injection is blocked).`}
      closeOnSuccess={false}
    >
      <Form method="get" action="/staff/export.csv" reloadDocument className="space-y-5">
        {filterKeys.flatMap((k) =>
          params
            .getAll(k)
            .filter(Boolean)
            .map((v) => <input key={`${k}-${v}`} type="hidden" name={k} value={v} />),
        )}
        {L.q.year && !params.get("year") && <input type="hidden" name="year" value={L.q.year} />}
        {Array.from(selected).map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setCols(new Set(EXPORT_COLUMNS.map((c) => c.key)))}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setCols(new Set(["sNo", "candidateName", "department", "appliedFor", "status"]))}
          >
            Summary columns
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setCols(new Set())}>
            Clear
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <fieldset key={g} className="rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold">{g}</legend>
              <div className="mt-1 space-y-1.5">
                {EXPORT_COLUMNS.filter((c) => c.group === g).map((c) => (
                  <label key={c.key} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="cols"
                      value={c.key}
                      className="h-4 w-4"
                      checked={cols.has(c.key)}
                      onChange={(e) =>
                        setCols((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(c.key);
                          else n.delete(c.key);
                          return n;
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {chosen.length > 0 && sample.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Preview (first rows)</p>
            <div className="table-wrap">
              <table className="table text-xs">
                <thead>
                  <tr>
                    {chosen.map((c) => (
                      <th key={c.key} scope="col" className="whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((r, i) => (
                    <tr key={r.id}>
                      {chosen.map((c) => (
                        <td key={c.key} className="whitespace-nowrap">
                          {valueOf(c.key, r, i)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="-mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-line bg-soft/60 px-5 py-4 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted">
            <Archive className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Your column choice is remembered for next time.
          </p>
          <button type="submit" className="btn-primary" disabled={cols.size === 0}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download CSV ({rows} row
            {rows === 1 ? "" : "s"})
          </button>
        </div>
      </Form>
    </Modal>
  );
}
