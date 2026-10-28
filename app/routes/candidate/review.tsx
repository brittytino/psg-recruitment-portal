import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/review";
import { AnswerView } from "~/components/application-form";
import { Alert, CsrfInput, ErrorSummary } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { FORM_LABELS } from "~/lib/labels";
import {
  derivedContext,
  getOwnApplication,
  submissionIssues,
  submit,
} from "~/modules/applications/service.server";
import { EDITABLE, type AppStatus } from "~/modules/applications/workflow";
import { DOCUMENT_TYPE_LABELS, type DocType } from "~/modules/documents/policy";
import { getFormDefinition, isDocxForm } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { conditionMet, withDerived } from "~/modules/forms/validation";

export const meta: Route.MetaFunction = () => [{ title: "Review and submit — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  if (!EDITABLE.includes(app.status as AppStatus)) throw redirect(`/applications/${app.id}/receipt`);
  const issues = await submissionIssues(app);
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  return {
    id: app.id,
    status: app.status,
    formCode: app.formTemplate.code as FormCode,
    formVersion: app.formTemplate.version,
    title: app.vacancy.title,
    department: app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research",
    answers: withDerived(def, app.draftAnswers as Answers, derivedContext(app)),

    version: app.draftVersion,
    issues,
    documents: app.documents.map((d) => ({ type: d.documentType as DocType, name: d.originalName })),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    if (form.get("declaration") !== "yes")
      return { formError: "Tick the declaration to confirm that the information is correct." };
    await submit(user, params.id, Number(form.get("version")));
    throw redirect(`/applications/${params.id}/receipt?submitted=1`);
  });
}

export default function Review({ loaderData: L, actionData }: Route.ComponentProps) {
  const def = getFormDefinition(L.formCode, L.formVersion);
  const v2 = !isDocxForm(def);
  const nav = useNavigation();
  const [agree, setAgree] = useState(false);
  const blocking = L.issues.field.length + L.issues.documents.length;
  const sectionTitle = (id: string) => def.sections.find((s) => s.id === id)?.title ?? "Form";
  const docsStep = def.sections.find((s) => s.kind === "uploads")?.id;
  const docsHref =
    v2 && docsStep ? `/applications/${L.id}?section=${docsStep}` : `/applications/${L.id}/documents`;
  const declaration =
    def.preservedText.find((p) => p.id === "declaration")?.text ??
    "I declare that the information given in this application is true and complete to the best of my knowledge.";
  const submitting = nav.state !== "idle";
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to={`/applications/${L.id}`}>Application form</Link> <span aria-hidden="true">/</span> Review
        and submit
      </nav>
      <div>
        <p className="text-sm font-medium text-muted">{FORM_LABELS[L.formCode]}</p>
        <h1 className="text-2xl sm:text-3xl">Review your application</h1>
        <p className="mt-1 text-muted">
          {L.title} · {L.department}
        </p>
      </div>
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}

      <ErrorSummary
        title={`${blocking} item${blocking === 1 ? "" : "s"} must be completed before you can submit`}
        messages={[
          ...L.issues.field.map((i) => ({
            text: `${sectionTitle(i.sectionId)}: ${i.message}`,
            href: `/applications/${L.id}?section=${i.sectionId}`,
          })),
          ...L.issues.documents.map((text) => ({ text, href: docsHref })),
        ]}
      />
      {blocking === 0 && (
        <Alert tone="success" title="Everything required is filled in">
          Check the preview below. If anything is wrong, go back and correct it before you submit.
        </Alert>
      )}

      {def.sections
        .filter((s) => s.kind !== "uploads")
        .map((s) => (
          <section key={s.id} className="card" aria-labelledby={`r-${s.id}`}>
            <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
              <h2 id={`r-${s.id}`} className="text-xl">
                {s.title}
              </h2>
              <Link
                to={`/applications/${L.id}?section=${s.id}`}
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                Change <span className="sr-only">{s.title}</span>
              </Link>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              {s.fields
                .filter((f) => conditionMet(f.when, L.answers))
                .map((f) => (
                  <div
                    key={f.key}
                    className={
                      f.kind === "table" || f.kind === "list" ? "" : "grid gap-1 sm:grid-cols-[16rem_1fr]"
                    }
                  >
                    <dt className="font-medium">{f.label}</dt>
                    <dd>
                      <AnswerView field={f} value={L.answers[f.key]} />
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}

      <section className="card space-y-4" aria-labelledby="preview">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="preview" className="text-xl">
              Application PDF preview
            </h2>
            <p className="mt-1 text-sm text-muted">
              This preview reflects your currently saved draft answers and documents. It is watermarked as a
              preview until formal submission.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/applications/${L.id}/preview.pdf`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              Open preview in a new tab
            </a>
            <Link to={`/applications/${L.id}`} className="btn-secondary">
              Go back and edit
            </Link>
          </div>
        </div>
        <iframe
          title="Preview of your application (PDF)"
          src={`/applications/${L.id}/preview.pdf#view=FitH`}
          className="h-[75vh] min-h-[480px] w-full rounded-2xl border border-line bg-soft"
        />
        <p className="text-sm text-muted">
          Cannot view the embedded PDF?{" "}
          <a href={`/applications/${L.id}/preview.pdf`}>Download the preview PDF</a>.
        </p>
      </section>

      <section className="card" aria-labelledby="r-docs">
        <div className="flex items-baseline justify-between">
          <h2 id="r-docs" className="text-xl">
            Documents
          </h2>
          <Link to={docsHref}>Change documents</Link>
        </div>
        {L.documents.length ? (
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {L.documents.map((d, i) => (
              <li key={i} className="rounded-xl bg-soft px-3 py-2">
                <span className="font-medium">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                <span className="block truncate text-muted">{d.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No documents uploaded.</p>
        )}
      </section>

      <section className="card space-y-4" aria-labelledby="r-submit">
        <h2 id="r-submit" className="text-xl">
          Declaration and submission
        </h2>
        <p className="text-[15px] text-muted">
          After you submit, your answers and documents are kept as a fixed copy and a reference number is
          given. You cannot change them unless the recruitment office asks you for clarification.
        </p>
        <Form method="post" className="space-y-4">
          <CsrfInput />
          <input type="hidden" name="version" value={L.version} />
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-soft p-4 text-[15px]">
            <input
              type="checkbox"
              name="declaration"
              value="yes"
              className="mt-1 h-5 w-5 shrink-0"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={blocking > 0}
            />
            <span>{declaration}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={blocking > 0 || !agree || submitting}>
              {submitting
                ? "Submitting…"
                : L.status === "NEEDS_CLARIFICATION"
                  ? "Confirm and resubmit"
                  : "Confirm and submit"}
            </button>
            <Link to={`/applications/${L.id}`} className="btn-secondary">
              Go back and edit
            </Link>
          </div>
          {blocking > 0 && (
            <p className="text-sm text-muted">
              Complete the items listed at the top of this page to enable submission.
            </p>
          )}
        </Form>
      </section>
    </div>
  );
}
