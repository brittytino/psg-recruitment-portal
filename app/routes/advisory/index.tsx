import { Link } from "react-router";
import type { Route } from "./+types/index";
import { Badge, formatDate, formatDateTime } from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { ADVISORY_LABELS, advisoryApplicationList } from "~/modules/reviews/advisory.server";

export const meta: Route.MetaFunction = () => [
  { title: "Advisory reviews — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const apps = await advisoryApplicationList(user);
  return { apps };
}

export default function AdvisoryIndex({ loaderData }: Route.ComponentProps) {
  const { apps } = loaderData;
  const reviewed = apps.filter((a) => a.myOpinion).length;
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="External advisory"
        title="Applicants for advisory review"
        description="Every applicant whose HOD review is complete. Read the application and documents, then record your advisory opinion. Your opinion does not change the application status; the Dean / Principal makes the final decision."
      />
      <p className="text-sm text-muted">
        {apps.length} application{apps.length === 1 ? "" : "s"} · {reviewed} with your opinion recorded
      </p>
      {apps.length === 0 ? (
        <EmptyState title="No applications are waiting for advisory review yet" />
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Link to={`/advisory/${a.id}`} className="text-brand-700 hover:underline">
                    {a.referenceNo ?? "Application"}
                  </Link>
                </p>
                <p className="text-sm text-muted">
                  {a.appliedPosition ? (POSITION_LABELS[a.appliedPosition] ?? a.appliedPosition) : "Research"} ·{" "}
                  {a.department} · {a.vacancyTitle}
                </p>
                <p className="text-sm text-muted">
                  Submitted {a.submittedAt ? formatDate(a.submittedAt) : "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{STATUS_LABELS[a.status as AppStatus] ?? a.status}</Badge>
                {a.myOpinion ? (
                  <Badge tone="success">
                    {ADVISORY_LABELS[a.myOpinion.recommendation as keyof typeof ADVISORY_LABELS] ??
                      a.myOpinion.recommendation}
                    {" · "}
                    {formatDateTime(a.myOpinion.recordedAt)}
                  </Badge>
                ) : (
                  <Badge tone="warning">Awaiting your opinion</Badge>
                )}
                <Link to={`/advisory/${a.id}`} className="btn-secondary btn-sm">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
