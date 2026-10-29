import { useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/summary";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { EmptyState, FilterSelect, PageHeader } from "~/components/staff";
import { SummaryTable } from "~/components/summary-table";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { hasPermission, hodDepartments, isHodReviewer } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";
import { ValidationError } from "~/modules/core/errors";
import {
  departmentCounts,
  filterOptions,
  listApplications,
  parseColumns,
  parseListQuery,
} from "~/modules/reporting/applications.server";
import { EXPORT_COLUMNS } from "~/modules/reporting/columns";
import {
  approveSummarySheet,
  decidePositionChange,
  departmentSummary,
  listSummarySheets,
  pendingPositionChanges,
} from "~/modules/reviews/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Summary — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  const office = hasPermission(user.grants, "summary:read");
  const hodDepts = isHodReviewer(user.grants) ? hodDepartments(user.grants) : [];
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
  const q = parseListQuery(new URL(request.url));
  const [departments, options, list, approvals, me] = await Promise.all([
    departmentCounts(user, { position: q.position, departmentId: q.departmentId }),
    filterOptions(),
    listApplications(user, { ...q, size: q.size < 50 ? 50 : q.size, sort: "referenceNo" }),
    pendingPositionChanges(user),
    prisma.user.findUnique({ where: { id: user.id }, select: { exportColumns: true } }),
  ]);
  return {
    office: true as const,
    hod,
    sheets,
    departments,
    options,
    list,
    q,
    approvals,
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Department-wise summary"
        title="Summary sheets"
        description={
          L.office
            ? "Department-wise progress, HOD-approved summary sheets, position-change approvals and Excel export."
            : "Your department's decisions. When every application is decided, approve the summary sheet; it is then shared with HR – N4 Section and the Admin."
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

      {L.office && (
        <>
          <section aria-label="Department totals" className="space-y-3">
            <h2 className="text-xl">Department-wise</h2>
            {L.departments.length === 0 ? (
              <EmptyState title="No submitted applications yet" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {L.departments.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-line bg-white p-4 shadow-xs">
                    <p className="font-semibold">
                      {d.name} <span className="text-muted">({d.code})</span>
                    </p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                      {[
                        ["Total", d.total],
                        ["Not with HOD", d.unassigned],
                        ["With HOD", d.withHod],
                        ["Accepted", d.accepted],
                        ["Change", d.changed],
                        ["Rejected", d.rejected],
                      ].map(([l, v]) => (
                        <div key={l} className="rounded-xl bg-soft p-2">
                          <dt className="text-xs text-muted">{l}</dt>
                          <dd className="text-lg font-bold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>

          {L.approvals.length > 0 && (
            <section className="card space-y-4" aria-labelledby="approvals">
              <h2 id="approvals" className="text-xl">
                Position changes waiting for approval ({L.approvals.length})
              </h2>
              <ul className="space-y-3">
                {L.approvals.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-line p-4">
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
                        <button
                          type="submit"
                          name="approve"
                          value="yes"
                          className="btn-primary py-2"
                          disabled={busy}
                        >
                          Approve
                        </button>
                        <button
                          type="submit"
                          name="approve"
                          value="no"
                          className="btn-secondary py-2"
                          disabled={busy}
                        >
                          Decline
                        </button>
                      </Form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

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

      {L.office && <OfficeSummary L={L} />}
    </div>
  );
}

type OfficeData = Extract<Route.ComponentProps["loaderData"], { office: true }>;

function OfficeSummary({ L }: { L: OfficeData }) {
  const [params] = useSearchParams();
  const [cols, setCols] = useState<Set<string>>(new Set(L.columns));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const groups = [...new Set(EXPORT_COLUMNS.map((c) => c.group))];
  const filterKeys = ["departmentId", "position", "status", "phd", "exam", "minExp", "q"];

  const allVisibleIds = L.list.rows.map((r) => r.id);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedRows.has(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(allVisibleIds));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCount = selectedRows.size > 0 ? selectedRows.size : L.list.total;
  const selectedColsList = EXPORT_COLUMNS.filter((c) => cols.has(c.key));

  return (
    <>
      <section className="card space-y-4" aria-labelledby="all">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="all" className="text-xl">
              Summary of applications
            </h2>
            <p className="mt-1 text-sm text-muted">
              Select specific rows to export, or export all matching applications directly.
            </p>
          </div>
          <Form method="get" className="flex flex-wrap items-end gap-3">
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
            <button type="submit" className="btn-secondary">
              Show
            </button>
          </Form>
        </div>

        {L.list.rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-soft p-3 text-sm">
            <div className="flex items-center gap-3">
              <button type="button" onClick={toggleSelectAllVisible} className="btn-secondary py-1 text-xs">
                {allVisibleSelected ? "Deselect all visible" : "Select all on page"}
              </button>
              {selectedRows.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedRows(new Set())}
                  className="btn-secondary py-1 text-xs"
                >
                  Clear selection
                </button>
              )}
            </div>
            <span className="text-muted font-medium">
              {selectedRows.size > 0
                ? `${selectedRows.size} application${selectedRows.size === 1 ? "" : "s"} selected for export`
                : `No specific rows selected (all ${L.list.total} will be exported)`}
            </span>
          </div>
        )}

        {L.list.rows.length === 0 ? (
          <EmptyState title="No applications for these filters" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Summary of applications</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all applications on this page"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 rounded"
                    />
                  </th>
                  <th scope="col" className="text-right">
                    S. No.
                  </th>
                  <th scope="col">Candidate Name</th>
                  <th scope="col">Department</th>
                  <th scope="col">Applied For</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {L.list.rows.map((r, i) => (
                  <tr key={r.id} className={selectedRows.has(r.id) ? "bg-brand-50/50" : undefined}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.currentRevision?.candidateName ?? r.referenceNo}`}
                        checked={selectedRows.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                        className="h-4 w-4 rounded"
                      />
                    </td>
                    <td className="text-right tabular-nums">{(L.q.page - 1) * L.list.rows.length + i + 1}</td>
                    <td>
                      <Link to={`/staff/applications/${r.id}`} className="font-semibold">
                        {r.currentRevision?.candidateName}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{r.referenceNo}</span>
                    </td>
                    <td>
                      {r.vacancy.department ? (
                        r.vacancy.department.name
                      ) : (
                        <span className="font-medium">
                          {r.vacancy.researchSpecialisation?.name ?? "Research"}
                        </span>
                      )}
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
            {L.list.pages > 1 && (
              <p className="mt-3 text-sm text-muted">
                Showing {L.list.rows.length} of {L.list.total}. The export below includes {exportCount} row
                {exportCount === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        )}
      </section>

      {L.canExport && (
        <section id="export" className="card space-y-5" aria-labelledby="exp">
          <div>
            <h2 id="exp" className="text-xl">
              Export to Excel (CSV)
            </h2>
            <p className="mt-1 text-[15px] text-muted">
              Choose the columns and export either selected rows (
              {selectedRows.size > 0 ? selectedRows.size : "all"}) or all matching filters ({L.list.total}).
              Safe from spreadsheet formula injection.
            </p>
          </div>
          <Form method="get" action="/staff/export.csv" reloadDocument className="space-y-5">
            {filterKeys
              .filter((k) => params.get(k))
              .map((k) => (
                <input key={k} type="hidden" name={k} value={params.get(k)!} />
              ))}
            {Array.from(selectedRows).map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary py-1.5 text-sm"
                onClick={() => setCols(new Set(EXPORT_COLUMNS.map((c) => c.key)))}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-secondary py-1.5 text-sm"
                onClick={() =>
                  setCols(new Set(["sNo", "candidateName", "department", "appliedFor", "status"]))
                }
              >
                Summary columns only
              </button>
              <button
                type="button"
                className="btn-secondary py-1.5 text-sm"
                onClick={() => setCols(new Set())}
              >
                Clear
              </button>
              <span className="self-center text-sm text-muted" aria-live="polite">
                {cols.size} column{cols.size === 1 ? "" : "s"} selected
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <fieldset key={g} className="rounded-2xl border border-line p-4">
                  <legend className="px-1 text-sm font-semibold">{g}</legend>
                  <div className="mt-1 space-y-1.5">
                    {EXPORT_COLUMNS.filter((c) => c.group === g).map((c) => (
                      <label key={c.key} className="flex items-center gap-2.5 text-[15px]">
                        <input
                          type="checkbox"
                          name="cols"
                          value={c.key}
                          className="h-4 w-4"
                          checked={cols.has(c.key)}
                          onChange={(e) =>
                            setCols((s) => {
                              const n = new Set(s);
                              e.target.checked ? n.add(c.key) : n.delete(c.key);
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

            {/* Export Preview Area */}
            <div className="rounded-2xl border border-line bg-soft/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Export Preview</h3>
                  <p className="text-xs text-muted">
                    {cols.size} columns, {exportCount} row{exportCount === 1 ? "" : "s"} ready for export
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="btn-secondary py-1 text-xs"
                >
                  {showPreview ? "Hide preview" : "Show preview"}
                </button>
              </div>

              {showPreview && (
                <div className="overflow-x-auto border-t border-line pt-3">
                  <p className="mb-2 text-xs text-muted">Previewing first 3 rows with selected columns:</p>
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        {selectedColsList.map((c) => (
                          <th key={c.key} scope="col">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {L.list.rows.slice(0, 3).map((r, i) => (
                        <tr key={r.id}>
                          {selectedColsList.map((c) => {
                            let val: string | number;
                            if (c.key === "sNo") val = i + 1;
                            else if (c.key === "referenceNo") val = r.referenceNo ?? "—";
                            else if (c.key === "candidateName") val = r.currentRevision?.candidateName ?? "";
                            else if (c.key === "department")
                              val =
                                r.vacancy.department?.name ??
                                r.vacancy.researchSpecialisation?.name ??
                                "Research";
                            else if (c.key === "appliedFor")
                              val =
                                (r.appliedPosition && POSITION_LABELS[r.appliedPosition]) ??
                                (r.vacancy.position && POSITION_LABELS[r.vacancy.position]) ??
                                r.vacancy.researchPositionTitle ??
                                "Research Assistant";
                            else if (c.key === "status") val = STATUS_LABELS[r.status as AppStatus];
                            else if (c.key === "phdStatus") val = r.currentRevision?.phdStatus ?? "None";
                            else val = "—";
                            return (
                              <td key={c.key} className="whitespace-nowrap">
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={cols.size === 0}>
                Download CSV ({exportCount} row{exportCount === 1 ? "" : "s"})
              </button>
              {selectedRows.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedRows(new Set())}
                  className="btn-secondary text-sm"
                >
                  Reset to export all {L.list.total}
                </button>
              )}
            </div>
          </Form>
        </section>
      )}
    </>
  );
}
