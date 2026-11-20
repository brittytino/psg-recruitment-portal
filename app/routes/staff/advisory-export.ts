import type { Route } from "./+types/advisory-export";
import { clientIp, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { audit } from "~/modules/audit/audit.server";
import { ADVISORY_LABELS } from "~/modules/reviews/advisory-labels";
import { advisoryMyReviews } from "~/modules/reviews/advisory.server";
import { csvCell } from "~/modules/reporting/applications.server";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";

const HOD_LABELS: Record<string, string> = {
  ACCEPT: "Accepted",
  RECOMMEND_CHANGE: "Recommended a change of position",
  REJECT: "Rejected",
};

/**
 * CSV of every opinion this advisor has recorded — her own report, for her own records or to
 * submit to the institution. Scoped to her own reviews only; no general export permission needed.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const rows = await advisoryMyReviews(user);

  const header = [
    "Reference No.",
    "Candidate",
    "Department",
    "Applied for",
    "Application status",
    "HOD decision",
    "HOD rating",
    "My recommendation",
    "My rating",
    "My comments",
    "Recorded on",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.referenceNo ?? "",
        r.candidateName,
        r.department,
        r.appliedPosition ? (POSITION_LABELS[r.appliedPosition] ?? r.appliedPosition) : "Research",
        STATUS_LABELS[r.status as AppStatus] ?? r.status,
        r.hodDecision ? (HOD_LABELS[r.hodDecision] ?? r.hodDecision) : "",
        r.hodRating ?? "",
        ADVISORY_LABELS[r.recommendation as keyof typeof ADVISORY_LABELS] ?? r.recommendation,
        r.rating ?? "",
        r.comments,
        new Date(r.recordedAt).toISOString(),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\r\n");

  await audit({
    actorId: user.id,
    action: "application.advisory_export",
    entityType: "application",
    ip: clientIp(request),
    metadata: { rows: rows.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="advisory_opinions_${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
