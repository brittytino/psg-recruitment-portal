import { ChevronLeft, ChevronRight } from "lucide-react";
import { Form, Link, redirect, useLocation } from "react-router";
import type { Route } from "./+types/advisory-application";
import { Alert, Badge, CsrfInput, ErrorSummary, formatDate, formatDateTime } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { StarRatingInput } from "~/components/star-rating";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { ADVISORY_LABELS } from "~/modules/reviews/advisory-labels";
import {
  advisoryApplicationDetail,
  advisoryQueueIds,
  parseAdvisoryFilters,
  recordAdvisoryReview,
} from "~/modules/reviews/advisory.server";

export const meta: Route.MetaFunction = () => [
  { title: "Advisory review — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const url = new URL(request.url);
  const filters = parseAdvisoryFilters(url.searchParams);
  const [app, queue] = await Promise.all([
    advisoryApplicationDetail(user, params.id),
    advisoryQueueIds(user, filters),
  ]);
  const position = queue.indexOf(params.id);
  return {
    app,
    qs: url.search,
    queue: {
      position: position >= 0 ? position + 1 : null,
      total: queue.length,
      prevId: position > 0 ? (queue[position - 1] ?? null) : null,
      nextId: position >= 0 && position + 1 < queue.length ? (queue[position + 1] ?? null) : null,
    },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const form = await readForm(request, context);
  const url = new URL(request.url);
  const intent = String(form.get("intent") ?? "save");
  return handleAction(async () => {
    // The next item in the queue is found before saving: once this application is reviewed it
    // drops out of the "awaiting" tab, which would otherwise shift the index.
    let nextId: string | null = null;
    if (intent === "save-next") {
      const filters = parseAdvisoryFilters(url.searchParams);
      const queue = await advisoryQueueIds(user, filters);
      const position = queue.indexOf(params.id);
      nextId = position >= 0 && position + 1 < queue.length ? (queue[position + 1] ?? null) : null;
    }
    await recordAdvisoryReview(user, params.id, Object.fromEntries(form), clientIp(request));
    if (intent === "save-next")
      return redirect(nextId ? `/staff/advisory/${nextId}${url.search}` : `/staff/advisory${url.search}`);
    return { message: "Your advisory opinion has been recorded." };
  });
}

const HOD_LABELS: Record<string, string> = {
  ACCEPT: "Accepted",
  RECOMMEND_CHANGE: "Recommended a change of position",
  REJECT: "Rejected",
};

export default function AdvisoryApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app, qs, queue } = loaderData;
  const location = useLocation();
  const back = (location.state as { back?: string } | null)?.back ?? "/staff/advisory";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const fe = a?.fieldErrors;
  const opinion = app.myOpinion;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={back} className="text-sm font-semibold text-brand-700 hover:underline">
          ← Back to advisory review
        </Link>
        {queue.position != null && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <span className="tabular-nums">
              {queue.position} of {queue.total} in this queue
            </span>
            <Link
              to={queue.prevId ? `/staff/advisory/${queue.prevId}${qs}` : "#"}
              aria-disabled={!queue.prevId}
              state={{ back }}
              className={`grid h-8 w-8 place-items-center rounded-lg border border-line ${
                queue.prevId ? "hover:bg-soft" : "pointer-events-none opacity-40"
              }`}
              aria-label="Previous application in queue"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to={queue.nextId ? `/staff/advisory/${queue.nextId}${qs}` : "#"}
              aria-disabled={!queue.nextId}
              state={{ back }}
              className={`grid h-8 w-8 place-items-center rounded-lg border border-line ${
                queue.nextId ? "hover:bg-soft" : "pointer-events-none opacity-40"
              }`}
              aria-label="Next application in queue"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
      <PageHeader
        eyebrow={app.referenceNo ?? "Application"}
        title={app.vacancyTitle}
        description={`${app.appliedPosition ? (POSITION_LABELS[app.appliedPosition] ?? app.appliedPosition) : "Research"} · ${app.department}`}
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !fe && <Alert tone="danger">{a.formError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
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
        </div>

        <section className="card space-y-5 p-5 lg:sticky lg:top-24" aria-labelledby="opinion">
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
              <div className="mt-2 space-y-2">
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
            <div className="flex flex-col gap-2">
              <button type="submit" name="intent" value="save-next" className="btn-primary w-full">
                {queue.nextId ? "Save & review next" : "Save & back to list"}
              </button>
              <button type="submit" name="intent" value="save" className="btn-secondary w-full">
                {opinion ? "Save (stay on this page)" : "Record (stay on this page)"}
              </button>
            </div>
          </Form>
        </section>
      </div>
    </div>
  );
}
