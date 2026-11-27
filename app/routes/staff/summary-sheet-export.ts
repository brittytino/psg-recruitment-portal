import type { Prisma } from "@prisma/client";
import type { Route } from "./+types/summary-sheet-export";
import { auditBestEffort } from "~/modules/audit/audit.server";
import { clientIp, requireStaff } from "~/lib/http.server";
import { prisma } from "~/modules/core/db.server";
import { isDomainError, ValidationError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";
import { csvCell, exportValue, type ExportRecord } from "~/modules/reporting/applications.server";
import {
  DEFAULT_SUMMARY_SHEET_COLUMNS,
  EXPORT_COLUMNS,
  type ExportColumnKey,
} from "~/modules/reporting/columns";
import { listSummarySheets, type SummaryRow } from "~/modules/reviews/service.server";

function parseSummaryColumns(raw: string[]): readonly ExportColumnKey[] {
  const valid = new Set(EXPORT_COLUMNS.map((c) => c.key));
  const cols = raw.filter((k): k is ExportColumnKey => valid.has(k as ExportColumnKey));
  // No (valid) selection: keep the whole sheet, exactly as a plain "Download CSV" has always worked.
  return cols.length ? cols : DEFAULT_SUMMARY_SHEET_COLUMNS;
}

/**
 * CSV of one approved summary sheet. A dedicated resource route (no component) — kept apart from
 * the summary-sheet UI route on purpose: a loader that sometimes returns a file and sometimes
 * page data, on the same route, is exactly the kind of route that can end up rendering its React
 * component with no page data when the file branch runs. A plain resource route cannot.
 *
 * Every column is read live from the current application record with the same computation the
 * office "Applications" export uses (see exportValue) — never from the sheet's own frozen
 * snapshot, whose rows exist only to say which candidates belong to this sheet and in what order.
 * A HOD's rating, a position-change recommendation, and above all the external advisor's opinion
 * and whether an interview call has actually gone out can all change after a sheet is approved;
 * the export always reflects the latest state, not a stale one.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  // listSummarySheets applies the role scope (HODs see only their own departments).
  const sheet = (await listSummarySheets(user)).find((s) => s.id === params.id);
  if (!sheet) throw new Response("Not found", { status: 404 });
  const snapshotRows = Array.isArray(sheet.rows) ? (sheet.rows as unknown as SummaryRow[]) : [];
  if (!snapshotRows.length) throw new ValidationError("This summary sheet has no rows to export");
  const cols = parseSummaryColumns(new URL(request.url).searchParams.getAll("cols"));
  const columns = EXPORT_COLUMNS.filter((c) => cols.includes(c.key));

  try {
    const applicationIds = snapshotRows.map((r) => r.applicationId);
    const records = await prisma.application.findMany({
      where: { id: { in: applicationIds } },
      include: {
        vacancy: {
          select: {
            code: true,
            position: true,
            recruitmentCategory: true,
            researchPositionTitle: true,
            researchSpecialisation: { select: { name: true } },
            department: { select: { name: true, code: true } },
            academicYear: true,
            opensAt: true,
          },
        },
        candidate: { select: { email: true } },
        assignedHod: { select: { email: true, profile: { select: { fullName: true } } } },
        currentRevision: true,
        positionChanges: { orderBy: { createdAt: "desc" }, take: 1 },
        reviews: {
          where: { stage: "ADVISORY" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            recommendation: true,
            score: true,
            reviewer: { select: { email: true, profile: { select: { fullName: true } } } },
          },
        },
      } satisfies Prisma.ApplicationInclude,
    });
    const byId = new Map(records.map((r) => [r.id, r]));
    // Same candidate order the HOD originally approved; a candidate removed from the system since
    // (should never happen — applications are never hard-deleted) is simply skipped, not an error.
    const ordered = snapshotRows
      .map((r) => ({ sNo: r.sNo, record: byId.get(r.applicationId) }))
      .filter((x): x is { sNo: number; record: ExportRecord } => !!x.record);

    const lines = [
      columns.map((c) => csvCell(c.label)).join(","),
      ...ordered.map(({ sNo, record }) =>
        columns.map((c) => csvCell(exportValue(c.key, record, sNo))).join(","),
      ),
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
      metadata: { rows: ordered.length, columns: columns.map((c) => c.key) },
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
