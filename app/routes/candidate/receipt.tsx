import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/receipt";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { getOwnApplication, withdraw } from "~/modules/applications/service.server";
import {
  availableTransitions,
  PROCESSING_LABELS,
  STATUS_LABELS,
  type AppStatus,
} from "~/modules/applications/workflow";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = () => [{ title: "Application status — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  const bundle = app.currentRevisionId
    ? await prisma.generatedDocument.findFirst({
        where: {
          revisionId: app.currentRevisionId,
          status: "READY",
          // v1 forms have no separate application PDF; their bundle is the candidate copy.
          kind: app.formTemplate.version === 1 ? "CONSOLIDATED_BUNDLE" : "APPLICATION_PDF",
        },
        orderBy: { version: "desc" },
        select: { id: true, pageCount: true },
      })
    : null;
  return {
    id: app.id,
    referenceNo: app.referenceNo,
    status: app.status as AppStatus,
    processingStatus: app.processingStatus,
    submittedAt: app.submittedAt,
    revisionNo: app.currentRevision?.revisionNo ?? null,
    title: app.vacancy.title,
    department: app.vacancy.department.name,
    history: app.statusHistory.map((h) => ({
      to: h.toStatus as AppStatus,
      at: h.createdAt,
      candidateVisibleReason: h.toStatus === "NEEDS_CLARIFICATION" ? h.reason : null,
    })),
    bundle,
    canWithdraw: availableTransitions(app.status as AppStatus, "candidate").some((t) => t.to === "WITHDRAWN"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    await withdraw(user, params.id, String(form.get("reason") ?? ""));
    return { message: "Your application has been withdrawn." };
  });
}

export default function Receipt({ loaderData: L, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <div className="space-y-6">
      {params.get("submitted") === "1" && (
        <Alert tone="success" title="Application submitted">
          Your application has been submitted. A confirmation has been sent to your e-mail address.
        </Alert>
      )}
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <section className="card" aria-labelledby="rcpt">
        <h1 id="rcpt">Application {L.referenceNo ?? "(not yet submitted)"}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Vacancy</dt>
            <dd className="font-medium">
              {L.title} — {L.department}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd>
              <Badge tone={statusTone(L.status)}>{STATUS_LABELS[L.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Submitted</dt>
            <dd className="font-medium">
              {formatDateTime(L.submittedAt)}
              {L.revisionNo ? ` (revision ${L.revisionNo})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Application PDF</dt>
            <dd>
              {L.bundle ? (
                <a href={`/files/bundles/${L.bundle.id}`}>
                  Download your submitted application (PDF, {L.bundle.pageCount} pages)
                </a>
              ) : (
                <span>{PROCESSING_LABELS[L.processingStatus] ?? L.processingStatus}</span>
              )}
            </dd>
          </div>
        </dl>
        {(L.status === "DRAFT" || L.status === "NEEDS_CLARIFICATION") && (
          <p className="mt-4">
            <Link to={`/applications/${L.id}`} className="btn-primary">
              {L.status === "DRAFT" ? "Continue application" : "Update and resubmit"}
            </Link>
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="hist">
        <h2 id="hist">History</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {L.history.map((h, i) => (
            <li key={i}>
              <span className="font-medium">{STATUS_LABELS[h.to]}</span> — {formatDateTime(h.at)}
              {h.candidateVisibleReason && (
                <span className="block whitespace-pre-line text-muted">
                  Message: {h.candidateVisibleReason}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {L.canWithdraw && (
        <section className="card" aria-labelledby="wd">
          <h2 id="wd">Withdraw application</h2>
          <Form method="post" className="mt-3 space-y-3">
            <CsrfInput />
            <div>
              <label htmlFor="reason" className="block text-sm font-medium">
                Reason for withdrawing
              </label>
              <textarea id="reason" name="reason" rows={2} maxLength={500} className="field-input mt-1" />
            </div>
            <ConfirmDialog
              trigger="Withdraw application"
              tone="danger"
              title="Withdraw this application?"
              confirmLabel="Yes, withdraw"
            >
              <p>
                Withdrawing cannot be undone. Your application will no longer be considered for this vacancy.
              </p>
            </ConfirmDialog>
          </Form>
        </section>
      )}
      <p>
        <Link to="/account">Back to my applications</Link>
      </p>
    </div>
  );
}
