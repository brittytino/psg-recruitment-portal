import type { Route } from "./+types/export";
import { clientIp, requireStaff } from "~/lib/http.server";
import { audit } from "~/modules/audit/audit.server";
import { exportCsv, parseListQuery } from "~/modules/reporting/applications.server";

/** CSV export of authorised application metadata for the current filters. The export is audited. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:export");
  const q = parseListQuery(new URL(request.url));
  const csv = await exportCsv(user, q);
  await audit({ actorId: user.id, action: "applications.exported", entityType: "application", ip: clientIp(request), metadata: { filters: JSON.stringify({ ...q, page: undefined }) } });
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
