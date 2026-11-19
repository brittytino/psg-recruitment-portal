import { Form, Link } from "react-router";
import type { Route } from "./+types/application";
import { Alert, Badge, CsrfInput, ErrorSummary, formatDate, formatDateTime } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { StarRatingInput } from "~/components/star-rating";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import {
  ADVISORY_LABELS,
  advisoryApplicationDetail,
  recordAdvisoryReview,
} from "~/modules/reviews/advisory.server";

export const meta: Route.MetaFunction = () => [
  { title: "Advisory review — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const app = await advisoryApplicationDetail(user, params.id);
  return { app };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const form = await readForm(request, context);
  return handleAction(async () => {
    await recordAdvisoryReview(user, params.id, Object.fromEntries(form), clientIp(request));
    return { message: "Your advisory opinion has been recorded." };
  });
}

const HOD_LABELS: Record<string, string> = {
  ACCEPT: "Accepted",
  RECOMMEND_CHANGE: "Recommended a change of position",
  REJECT: "Rejected",
};

export default function AdvisoryApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app } = loaderData;
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const fe = a?.fieldErrors;
  const opinion = app.myOpinion;
  return (
    <div className="page-stack">
      <Link to="/advisory" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All applications for advisory review
      </Link>
      <PageHeader
        eyebrow={app.referenceNo ?? "Application"}
        title={app.vacancyTitle}
        description={`${app.appliedPosition ? (POSITION_LABELS[app.appliedPosition] ?? app.appliedPosition) : "Research"} · ${app.department}`}
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !fe && <Alert tone="danger">{a.formError}</Alert>}

      <section className="card space-y-3 p-5" aria-labelledby="status">
        <h2 id="status" className="text-xl">
          Application
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{STATUS_LABELS[app.status as AppStatus] ?? app.status}</Badge>
          {app.submittedAt && <Badge tone="neutral">Submitted {formatDate(app.submittedAt)}</Badge>}
        </div>
        <p className="text-sm text-muted">
          The full application form and the candidate's documents are available on the application page.
        </p>
        <Link to={`/staff/applications/${app.id}`} className="btn-secondary btn-sm inline-block">
          Open full application and documents
        </Link>
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="hod">
        <h2 id="hod" className="text-xl">
          Head of Department review
        </h2>
        {app.hod.decision ? (
          <dl className="grid gap-2 text-[15px] sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">Decision</dt>
            <dd>{HOD_LABELS[app.hod.decision] ?? app.hod.decision}</dd>
            {app.hod.rating != null && (
              <>
                <dt className="font-semibold">Rating</dt>
                <dd>{app.hod.rating} / 5</dd>
              </>
            )}
            {app.hod.remarks && (
              <>
                <dt className="font-semibold">Remarks</dt>
                <dd className="whitespace-pre-line">{app.hod.remarks}</dd>
              </>
            )}
            {app.hod.decidedAt && (
              <>
                <dt className="font-semibold">Recorded</dt>
                <dd>{formatDateTime(app.hod.decidedAt)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted">No HOD decision recorded.</p>
        )}
      </section>

      <section className="card space-y-5 p-5" aria-labelledby="opinion">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="opinion" className="text-xl">
            Your advisory opinion
          </h2>
          {opinion && <Badge tone="success">Recorded {formatDateTime(opinion.recordedAt)}</Badge>}
        </div>
        <ErrorSummary
          messages={
            fe
              ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
              : []
          }
        />
        <Form method="post" className="space-y-5">
          <CsrfInput />
          <fieldset id="f-recommendation">
            <legend className="text-sm font-semibold">Recommendation</legend>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {(Object.keys(ADVISORY_LABELS) as (keyof typeof ADVISORY_LABELS)[]).map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-soft"
                >
                  <input
                    type="radio"
                    name="recommendation"
                    value={r}
                    required
                    defaultChecked={opinion?.recommendation === r}
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">{ADVISORY_LABELS[r]}</span>
                </label>
              ))}
            </div>
            {fe?.recommendation && <p className="mt-1 text-sm text-danger">{fe.recommendation[0]}</p>}
          </fieldset>
          <div id="f-rating">
            <StarRatingInput
              name="rating"
              label="Rating out of 5"
              defaultValue={opinion?.rating ?? null}
              error={fe?.rating?.[0]}
            />
          </div>
          <div>
            <label htmlFor="f-comments" className="block text-sm font-semibold">
              Comments <span className="text-danger">*</span>
            </label>
            <textarea
              id="f-comments"
              name="comments"
              required
              minLength={10}
              maxLength={3000}
              rows={6}
              defaultValue={opinion?.comments ?? ""}
              className="field-input mt-1 w-full"
            />
            {fe?.comments && <p className="mt-1 text-sm text-danger">{fe.comments[0]}</p>}
          </div>
          <button type="submit" className="btn-primary">
            {opinion ? "Update my opinion" : "Record my opinion"}
          </button>
        </Form>
      </section>
    </div>
  );
}
