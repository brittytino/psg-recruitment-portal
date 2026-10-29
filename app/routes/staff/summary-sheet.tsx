import { Form, Link } from "react-router";
import type { Route } from "./+types/summary-sheet";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { hasPermission } from "~/modules/auth/permissions";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { csvCell } from "~/modules/reporting/applications.server";
import { listSummarySheets, reopenSummarySheet, type SummaryRow } from "~/modules/reviews/service.server";
import { SummaryTable } from "~/components/summary-table";

export const meta: Route.MetaFunction = () => [{ title: "Summary sheet — PSG Tech Recruitment" }];

async function loadSheet(user: Parameters<typeof listSummarySheets>[0], id: string) {
  // listSummarySheets applies the role scope (HODs see only their own departments).
  const sheet = (await listSummarySheets(user)).find((s) => s.id === id);
  if (!sheet) throw new Response("Not found", { status: 404 });
  return sheet;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  const sheet = await loadSheet(user, params.id);
  const rows = sheet.rows as unknown as SummaryRow[];
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const header = [
      "S. No.",
      "Reference No.",
      "Candidate Name",
      "Department",
      "Applied For",
      "Recommended / Approved",
      "HOD Decision",
      "Reason / Remarks",
      "Status",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...rows.map((r) =>
        [
          r.sNo,
          r.referenceNo,
          r.candidateName,
          r.department,
          r.appliedFor,
          r.recommendedFor,
          r.decision,
          r.reason,
          r.status,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    await audit({
      actorId: user.id,
      action: "summary.exported",
      entityType: "summary_sheet",
      entityId: sheet.id,
      ip: clientIp(request),
      metadata: { rows: rows.length },
    });
    return new Response("﻿" + lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="PSGCT_${sheet.academicYear}_${sheet.department.code}_summary_v${sheet.version}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const approver = await prisma.user.findUnique({
    where: { id: sheet.approvedById },
    select: { email: true, profile: { select: { fullName: true } } },
  });
  return {
    sheet: { ...sheet, rows },
    approver: approver?.profile?.fullName ?? approver?.email ?? "—",
    canReopen: hasPermission(user.grants, "summary:reopen") && sheet.status === "APPROVED",
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "summary:reopen");
  const form = await readForm(request, context);
  return handleAction(async () => {
    await reopenSummarySheet(user, params.id, String(form.get("reason") ?? ""), clientIp(request));
    return { message: "The sheet is reopened. The HOD can change decisions and approve a new version." };
  });
}

export default function SummarySheetPage({ loaderData, actionData }: Route.ComponentProps) {
  const { sheet, approver, canReopen } = loaderData;
  return (
    <div className="page-stack">
      <p className="text-sm">
        <Link to="/staff/summary">← Summary sheets</Link>
      </p>
      <PageHeader
        eyebrow={`Summary sheet · version ${sheet.version}`}
        title={`${sheet.department.name} — ${sheet.academicYear}`}
        description={`Approved by ${approver} on ${formatDateTime(sheet.approvedAt)}. This copy never changes; a newer approval creates a new version.`}
        actions={
          <>
            <Badge tone={sheet.status === "APPROVED" ? "success" : "neutral"}>
              {sheet.status === "APPROVED" ? "Current" : "Superseded"}
            </Badge>
            <a href="?format=csv" className="btn-primary">
              Download CSV
            </a>
          </>
        }
      />
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <section className="card">
        <SummaryTable rows={sheet.rows} />
      </section>
      {canReopen && (
        <section className="card space-y-3" aria-labelledby="reopen">
          <h2 id="reopen" className="text-xl">
            Reopen for changes
          </h2>
          <p className="text-sm text-muted">
            Reopening marks this version as superseded so the HOD can change decisions and approve a new
            version. The reason is recorded in the audit log.
          </p>
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <CsrfInput />
            <div className="min-w-72 flex-1">
              <label htmlFor="reason" className="block text-sm font-semibold">
                Reason
              </label>
              <input id="reason" name="reason" required minLength={5} className="field-input mt-1" />
            </div>
            <ConfirmDialog
              trigger="Reopen sheet"
              tone="danger"
              title="Reopen this summary sheet?"
              confirmLabel="Reopen"
            >
              <p>
                The HOD will be able to change decisions. This version stays in the history as superseded.
              </p>
            </ConfirmDialog>
          </Form>
        </section>
      )}
    </div>
  );
}
