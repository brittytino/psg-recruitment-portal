import type { Route } from "./+types/export";
import { clientIp, requireStaff } from "~/lib/http.server";
import { referenceDeptCode } from "~/modules/applications/reference";
import { audit } from "~/modules/audit/audit.server";
import { prisma } from "~/modules/core/db.server";
import { exportCsv, parseColumns, parseListQuery } from "~/modules/reporting/applications.server";
import { academicYearOf } from "~/modules/applications/reference";

/**
 * Excel-compatible CSV of the filtered applications with the columns chosen on the summary page.
 * Admin and HR only (HODs download their own approved sheet instead). Audited; the column choice
 * is remembered for the user.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:export");
  const url = new URL(request.url);
  const q = parseListQuery(url);
  const columns = parseColumns(url.searchParams.getAll("cols"));
  const { csv, rows } = await exportCsv(user, q, columns);
  await prisma.user.update({ where: { id: user.id }, data: { exportColumns: columns } });
  await audit({
    actorId: user.id,
    action: "applications.exported",
    entityType: "application",
    ip: clientIp(request),
    metadata: {
      filters: JSON.stringify({ ...q, page: undefined, size: undefined }),
      columns: columns.join(","),
      rows,
    },
  });
  const dept = q.departmentId
    ? referenceDeptCode(
        (await prisma.department.findUnique({ where: { id: q.departmentId } }))?.code ?? "DEPT",
      )
    : "ALL";
  const ist = new Date(Date.now() + 5.5 * 3600_000).toISOString();
  const stamp = `${ist.slice(0, 10).replace(/-/g, "")}-${ist.slice(11, 16).replace(":", "")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="PSGCT_${academicYearOf(new Date())}_${dept}_summary_${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
