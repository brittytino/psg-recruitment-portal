import { useState } from "react";
import { Form, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/new";
import { Alert, CsrfInput, ErrorSummary } from "~/components/forms";
import { AttachmentInput, CandidateHelpDeskShell } from "~/components/helpdesk";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import {
  CANDIDATE_URGENCY,
  CATEGORY_KEYS,
  categoryLabel,
  TICKET_CATEGORIES,
  TICKET_LIMITS,
  type TicketCategory,
} from "~/modules/helpdesk/definitions";
import { createTicket, myApplicationsForTickets } from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Create a support ticket — Help desk" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const apps = await myApplicationsForTickets(user).catch(() => []);
  return {
    // One id per form: a double click or a retried request returns the same ticket.
    requestId: crypto.randomUUID(),
    email: user.email,
    name: user.displayName,
    applications: apps.map((a) => ({
      id: a.id,
      label: `${a.referenceNo} — ${
        (a.appliedPosition ?? a.vacancy.position)
          ? POSITION_LABELS[(a.appliedPosition ?? a.vacancy.position)!]
          : a.vacancy.title
      }, ${a.vacancy.department?.name ?? a.vacancy.researchSpecialisation?.name ?? "Research"}`,
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  const values = Object.fromEntries(
    ["subject", "category", "subcategory", "urgency", "description", "applicationId", "articleSlug"].map(
      (k) => [k, String(form.get(k) ?? "")],
    ),
  );
  const result = await handleAction(async () => {
    const t = await createTicket(user, form);
    throw redirect(`/help-desk/tickets/${t.id}?created=1`);
  });
  return { ...(result as object), values };
}

export default function NewTicket({ loaderData: L, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const a = actionData as
    | {
        formError?: string;
        fieldErrors?: Record<string, string[] | undefined>;
        values?: Record<string, string>;
      }
    | undefined;
  const v = a?.values ?? {};
  const fe = a?.fieldErrors ?? {};
  const busy = useNavigation().state === "submitting";
  const [category, setCategory] = useState<string>(v.category ?? "");
  const [desc, setDesc] = useState(v.description ?? "");
  const subs = category ? (TICKET_CATEGORIES[category as TicketCategory]?.subs ?? []) : [];
  const article = v.articleSlug || params.get("article") || "";
  const summary = Object.entries(fe).flatMap(([k, msgs]) =>
    (msgs ?? []).map((text) => ({ text, href: `#f-${k}` })),
  );
  const err = (k: string) =>
    fe[k]?.[0] ? (
      <p id={`f-${k}-err`} className="mt-1 text-sm text-danger">
        {fe[k]![0]}
      </p>
    ) : null;

  return (
    <CandidateHelpDeskShell signedIn>
      <div className="page-stack max-w-3xl">
        <PageHeader
          crumbs={[["Help desk", "/help-desk"], ["Create ticket"]]}
          title="Create a support ticket"
          description="Tell us what you were trying to do and what happened. The recruitment office replies on this help desk."
        />
        {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
        <ErrorSummary messages={summary} />

        <Form method="post" encType="multipart/form-data" className="card space-y-5" noValidate={false}>
          <CsrfInput />
          <input type="hidden" name="requestId" value={L.requestId} />
          {article && <input type="hidden" name="articleSlug" value={article} />}

          <div>
            <label htmlFor="f-subject" className="block text-sm font-medium">
              Subject <span className="text-danger">*</span>
            </label>
            <input
              id="f-subject"
              name="subject"
              required
              minLength={TICKET_LIMITS.subject.min}
              maxLength={TICKET_LIMITS.subject.max}
              defaultValue={v.subject}
              placeholder="e.g. Signature upload fails with an error"
              aria-invalid={!!fe.subject}
              aria-describedby={fe.subject ? "f-subject-err" : undefined}
              className="field-input mt-1"
            />
            {err("subject")}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="f-category" className="block text-sm font-medium">
                Category <span className="text-danger">*</span>
              </label>
              <select
                id="f-category"
                name="category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-invalid={!!fe.category}
                className="field-input mt-1"
              >
                <option value="">Choose…</option>
                {CATEGORY_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
              {err("category")}
            </div>
            <div>
              <label htmlFor="f-subcategory" className="block text-sm font-medium">
                More specifically <span className="font-normal text-muted">(optional)</span>
              </label>
              <select
                id="f-subcategory"
                name="subcategory"
                defaultValue={v.subcategory}
                disabled={!subs.length}
                className="field-input mt-1"
                key={category}
              >
                <option value="">{subs.length ? "Choose…" : "—"}</option>
                {subs.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {err("subcategory")}
            </div>
          </div>

          <div>
            <label htmlFor="f-applicationId" className="block text-sm font-medium">
              Related application <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              id="f-applicationId"
              name="applicationId"
              defaultValue={v.applicationId}
              className="field-input mt-1"
            >
              <option value="">
                {L.applications.length ? "Not about a submitted application" : "No submitted application yet"}
              </option>
              {L.applications.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            {err("applicationId")}
          </div>

          <div>
            <label htmlFor="f-description" className="block text-sm font-medium">
              Describe the problem <span className="text-danger">*</span>
            </label>
            <p id="f-description-hint" className="mt-0.5 text-xs text-muted">
              What were you doing, what did you expect, and what happened instead? Copy any error message
              exactly. Do not share sign-in codes.
            </p>
            <textarea
              id="f-description"
              name="description"
              required
              rows={7}
              minLength={TICKET_LIMITS.body.min}
              maxLength={TICKET_LIMITS.body.max}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-invalid={!!fe.description}
              aria-describedby="f-description-hint"
              className="field-input mt-1"
            />
            <p className="mt-1 text-right text-xs text-muted">
              {desc.length} / {TICKET_LIMITS.body.max}
            </p>
            {err("description")}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">
              How does this affect you? <span className="font-normal text-muted">(optional)</span>
            </legend>
            <div className="mt-2 space-y-2">
              {CANDIDATE_URGENCY.map((u) => (
                <label
                  key={u}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-brand-200 has-[:checked]:bg-brand-50/40"
                >
                  <input
                    type="radio"
                    name="urgency"
                    value={u}
                    defaultChecked={v.urgency === u}
                    className="h-4 w-4"
                  />
                  {u}
                </label>
              ))}
            </div>
          </fieldset>

          <AttachmentInput error={fe.files?.[0]} />

          <div className="rounded-lg bg-soft p-3 text-sm text-muted">
            Replies are shown on this help desk and a notice is sent to{" "}
            <strong className="text-ink">{L.email}</strong>.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Submit ticket"}
            </button>
            {a?.fieldErrors && (
              <span className="text-sm text-muted">Attachments need to be chosen again.</span>
            )}
          </div>
        </Form>
      </div>
    </CandidateHelpDeskShell>
  );
}
