import { Scale, UserPlus } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/advisors";
import {
  Alert,
  Badge,
  ConfirmDialog,
  CsrfInput,
  ErrorSummary,
  formatDateTime,
  TextInput,
} from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import { addAdvisor, listAdvisors, removeAdvisor } from "~/modules/users/advisors.server";

export const meta: Route.MetaFunction = () => [
  { title: "External advisors — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisor:manage");
  return { advisors: await listAdvisors(user) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "advisor:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "add":
        await addAdvisor(user, { email: form.get("email"), fullName: form.get("fullName") });
        return { message: "Advisor added. They have been e-mailed how to sign in." };
      case "remove":
        await removeAdvisor(user, String(form.get("userId") ?? ""));
        return { message: "Advisory access removed. The person has been signed out." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function Advisors({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const fe = a?.fieldErrors ?? {};
  const summary = Object.entries(fe).flatMap(([k, v]) =>
    (v ?? []).map((text) => ({ text, href: `#f-${k}` })),
  );

  return (
    <div className="page-stack max-w-5xl">
      <PageHeader
        eyebrow="Set-up"
        title="External advisors"
        description="External advisors review applicants after the HOD review and record an advisory opinion with a rating. They can see nothing else, and their opinion does not change the application status."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
      <ErrorSummary messages={summary} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="card p-0" aria-labelledby="list">
          <h2 id="list" className="border-b border-line px-5 py-4 text-lg">
            {loaderData.advisors.length} advisor{loaderData.advisors.length === 1 ? "" : "s"}
          </h2>
          {loaderData.advisors.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No external advisors yet">
                Add an external advisor to review applicants.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {loaderData.advisors.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info-50 text-info">
                    <Scale className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{v.name}</span>
                    <span className="block truncate text-sm text-muted">{v.email}</span>
                    <span className="block text-xs text-muted">
                      {v.lastLoginAt
                        ? `Last signed in ${formatDateTime(v.lastLoginAt)}`
                        : "Not signed in yet"}
                      {v.grantedBy ? ` · added by ${v.grantedBy}` : ""}
                    </span>
                  </span>
                  <Badge tone={v.active ? "success" : "neutral"}>{v.active ? "Active" : "Disabled"}</Badge>
                  <Form method="post">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="userId" value={v.id} />
                    <ConfirmDialog
                      trigger="Remove access"
                      triggerClassName="btn-secondary btn-sm"
                      tone="danger"
                      title={`Remove ${v.name}'s advisory access?`}
                      confirmLabel="Remove access"
                      disabled={busy}
                    >
                      <p>They are signed out immediately and their account is disabled.</p>
                    </ConfirmDialog>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Form method="post" className="card space-y-4 lg:sticky lg:top-24" aria-labelledby="add">
          <CsrfInput />
          <input type="hidden" name="intent" value="add" />
          <h2 id="add" className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-brand-600" aria-hidden="true" /> Add an external advisor
          </h2>
          <TextInput
            label="Full name"
            name="fullName"
            required
            error={fe.fullName?.[0]}
            autoComplete="name"
          />
          <TextInput
            label="E-mail address"
            name="email"
            type="email"
            required
            error={fe.email?.[0]}
            autoComplete="email"
            hint="They sign in with a code sent to this address."
          />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Adding…" : "Add advisor"}
          </button>
        </Form>
      </div>
    </div>
  );
}
