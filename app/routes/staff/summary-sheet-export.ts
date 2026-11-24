import type { Route } from "./+types/summary-sheet-export";
import { auditBestEffort } from "~/modules/audit/audit.server";
import { clientIp, requireStaff } from "~/lib/http.server";
import { isDomainError, ValidationError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";
import { csvCell } from "~/modules/reporting/applications.server";
import {
  DEFAULT_SUMMARY_SHEET_COLUMNS,
  SUMMARY_SHEET_COLUMNS,
  type SummarySheetColumnKey,
} from "~/modules/reporting/columns";
import { listSummarySheets, type SummaryRow } from "~/modules/reviews/service.server";

function parseSummaryColumns(raw: string[]): readonly SummarySheetColumnKey[] {
  const valid = new Set(SUMMARY_SHEET_COLUMNS.map((c) => c.key));
  const cols = raw.filter((k): k is SummarySheetColumnKey => valid.has(k as SummarySheetColumnKey));
  // No (valid) selection: keep the whole sheet, exactly as a plain "Download CSV" has always worked.
  return cols.length ? cols : DEFAULT_SUMMARY_SHEET_COLUMNS;
}

/**
 * CSV of one approved summary sheet. A dedicated resource route (no component) — kept apart from
 * the summary-sheet UI route on purpose: a loader that sometimes returns a file and sometimes
 * page data, on the same route, is exactly the kind of route that can end up rendering its React
 * component with no page data when the file branch runs. A plain resource route cannot.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  // listSummarySheets applies the role scope (HODs see only their own departments).
  const sheet = (await listSummarySheets(user)).find((s) => s.id === params.id);
  if (!sheet) throw new Response("Not found", { status: 404 });
  const rows = Array.isArray(sheet.rows) ? (sheet.rows as unknown as SummaryRow[]) : [];
  if (!rows.length) throw new ValidationError("This summary sheet has no rows to export");
  const cols = parseSummaryColumns(new URL(request.url).searchParams.getAll("cols"));
  const columns = SUMMARY_SHEET_COLUMNS.filter((c) => cols.includes(c.key));

  try {
    const valueOf = (r: SummaryRow, key: SummarySheetColumnKey) => {
      switch (key) {
        case "sNo":
          return r.sNo;
        case "referenceNo":
          return r.referenceNo;
        case "candidateName":
          return r.candidateName;
        case "department":
          return r.department;
        case "appliedFor":
          return r.appliedFor;
        case "recommendedFor":
          return r.recommendedFor;
        case "decision":
          return r.decision;
        case "reason":
          return r.reason;
        case "status":
          return r.status;
      }
    };
    const lines = [
      columns.map((c) => csvCell(c.label)).join(","),
      ...rows.map((r) => columns.map((c) => csvCell(valueOf(r, c.key))).join(",")),
    ];
    // A safe filename regardless of what is stored: the academic year and department code are
    // normally short and plain, but a header built from unvalidated text can otherwise throw
    // deep inside Node's HTTP implementation instead of failing with a readable message here.
    const safe = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "_").slice(0, 40) || "sheet";
    const filename = `PSGCT_${safe(sheet.academicYear)}_${safe(sheet.department.code)}_summary_v${sheet.version}.csv`;

    await auditBestEffort({
      actorId: user.id,
      action: "summary.exported",
      entityType: "summary_sheet",
      entityId: sheet.id,
      ip: clientIp(request),
      metadata: { rows: rows.length, columns: columns.map((c) => c.key) },
    });
    return new Response("﻿" + lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response || isDomainError(err)) throw err;
    logger.error(
      {
        event: "summary_csv_export_failed",
        sheetId: sheet.id,
        department: sheet.department.code,
        err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
      },
      "summary sheet CSV export failed",
    );
    throw new ValidationError(
      "This summary sheet's CSV could not be generated. The details were recorded in the system log; try again, or ask the Super Admin to check System Logs for this sheet.",
    );
  }
}
