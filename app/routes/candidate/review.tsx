import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/review";
import { AnswerView } from "~/components/application-form";
import { Alert, ConfirmDialog, CsrfInput, ErrorSummary } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { FORM_LABELS } from "~/lib/labels";
import { getOwnApplication, submissionIssues, submit } from "~/modules/applications/service.server";
import { EDITABLE, type AppStatus } from "~/modules/applications/workflow";
import { DOCUMENT_TYPE_LABELS, type DocType } from "~/modules/documents/policy";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { withDerived } from "~/modules/forms/validation";

export const meta: Route.MetaFunction = () => [{ title: "Review and submit — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  if (!EDITABLE.includes(app.status as AppStatus)) throw redirect(`/applications/${app.id}/receipt`);
  const issues = await submissionIssues(app);
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  const answers = withDerived(def, app.draftAnswers as Answers, {
    department: app.vacancy.department.name,
    asOf: new Date().toISOString().slice(0, 10),
  });
  return {
    id: app.id,
    status: app.status,
    formCode: app.formTemplate.code as FormCode,
    formVersion: app.formTemplate.version,
    title: app.vacancy.title,
    answers,
    version: app.draftVersion,
    issues,
    documents: app.documents.map((d) => ({ type: d.documentType as DocType, name: d.originalName })),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    if (form.get("confirm") !== "yes")
      return { formError: "Please confirm the declaration before submitting." };
    await submit(user, params.id, Number(form.get("version")));
    throw redirect(`/applications/${params.id}/receipt?submitted=1`);
  });
}

export default function Review({ loaderData, actionData }: Route.ComponentProps) {
  const L = loaderData;
  const def = getFormDefinition(L.formCode, L.formVersion);
  const nav = useNavigation();
  const blocking = L.issues.field.length + L.issues.documents.length;
  const sectionTitle = (id: string) => def.sections.find((s) => s.id === id)?.title ?? "Form";
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to={`/applications/${L.id}`}>Application form</Link> <span aria-hidden="true">/</span> Review
        and submit
      </nav>
      <div>
        <p className="text-sm text-muted">{FORM_LABELS[L.formCode]}</p>
        <h1>Review your application</h1>
        <p className="mt-1 text-sm text-muted">{L.title}</p>
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
          ...L.issues.documents.map((text) => ({ text, href: `/applications/${L.id}/documents` })),
        ]}
      />

      {def.sections.map((s) => (
        <section key={s.id} className="card" aria-labelledby={`r-${s.id}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id={`r-${s.id}`}>{s.title}</h2>
            <Link to={`/applications/${L.id}?section=${s.id}`}>
              Change <span className="sr-only">{s.title}</span>
            </Link>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            {s.fields.map((f) => (
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

      <section className="card" aria-labelledby="r-docs">
        <div className="flex items-baseline justify-between">
          <h2 id="r-docs">Documents</h2>
          <Link to={`/applications/${L.id}/documents`}>Change documents</Link>
        </div>
        {L.documents.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {L.documents.map((d, i) => (
              <li key={i}>
                {DOCUMENT_TYPE_LABELS[d.type]} — {d.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No documents uploaded.</p>
        )}
      </section>

      <section className="card space-y-4" aria-labelledby="r-submit">
        <h2 id="r-submit">Submit</h2>
        <p className="text-sm">
          The official form is completed with your answers, printed with your photograph and combined with
          your supporting documents into one PDF for the recruitment office. The printed form has spaces for
          your signature and for the endorsement of your present employer.
        </p>
        <Form method="post">
          <CsrfInput />
          <input type="hidden" name="version" value={L.version} />
          <input type="hidden" name="confirm" value="yes" />
          <ConfirmDialog
            trigger={L.status === "NEEDS_CLARIFICATION" ? "Resubmit application" : "Submit application"}
            title="Submit your application?"
            confirmLabel="Yes, submit"
            disabled={blocking > 0 || nav.state !== "idle"}
          >
            <p>
              When you submit, your answers and documents become a submitted snapshot. You will not be able to
              edit them unless the recruitment office returns the application to you for clarification.
            </p>
            <p>
              I declare that the information given in this application is true and complete to the best of my
              knowledge.
            </p>
          </ConfirmDialog>
        </Form>
        {blocking > 0 && (
          <p className="text-sm text-muted">
            Complete the items listed at the top of this page to enable submission.
          </p>
        )}
      </section>
    </div>
  );
}
