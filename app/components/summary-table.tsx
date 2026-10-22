import { Link } from "react-router";
import { Badge } from "~/components/forms";
import { EmptyState } from "~/components/staff";

/** HOD summary sheet table (live preview and approved snapshots). */
export function SummaryTable({
  rows,
}: {
  rows: {
    sNo: number;
    referenceNo: string;
    candidateName: string;
    appliedFor: string;
    recommendedFor: string;
    decision: string;
    reason: string;
    status: string;
    applicationId: string;
  }[];
}) {
  if (!rows.length) return <EmptyState title="No applications have been assigned yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <caption className="sr-only">Summary sheet</caption>
        <thead>
          <tr>
            <th scope="col" className="text-right">
              S. No.
            </th>
            <th scope="col">Reference No.</th>
            <th scope="col">Candidate Name</th>
            <th scope="col">Applied For</th>
            <th scope="col">Recommended / Approved</th>
            <th scope="col">HOD Decision</th>
            <th scope="col">Reason / Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.applicationId}>
              <td className="text-right tabular-nums">{r.sNo}</td>
              <td className="whitespace-nowrap font-mono text-sm">{r.referenceNo}</td>
              <td className="font-semibold">
                <Link to={`/staff/applications/${r.applicationId}`}>{r.candidateName}</Link>
              </td>
              <td className="whitespace-nowrap">{r.appliedFor}</td>
              <td>{r.recommendedFor}</td>
              <td>
                <Badge
                  tone={
                    r.decision === "Pending"
                      ? "warning"
                      : r.decision === "Rejected"
                        ? "danger"
                        : r.decision.startsWith("Accepted")
                          ? "success"
                          : "info"
                  }
                >
                  {r.decision}
                </Badge>
              </td>
              <td className="max-w-sm whitespace-pre-line text-sm">{r.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
