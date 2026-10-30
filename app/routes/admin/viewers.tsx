import { Eye, UserPlus } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/viewers";
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
import { addViewer, listViewers, removeViewer } from "~/modules/users/viewers.server";

export const meta: Route.MetaFunction = () => [
  { title: "Viewers (read only) — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "viewer:manage");
  return { viewers: await listViewers(user) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "viewer:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "add":
        await addViewer(user, { email: form.get("email"), fullName: form.get("fullName") });
        return { message: "Viewer added. They have been e-mailed how to sign in." };
      case "remove":
        await removeViewer(user, String(form.get("userId") ?? ""));
        return { message: "Read-only access removed. The person has been signed out." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function Viewers({ loaderData, actionData }: Route.ComponentProps) {
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
        title="Viewers (read only)"
        description="People who may read submitted applications and their documents, and nothing else: no changes, assignments, decisions or exports."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
      <ErrorSummary messages={summary} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="card p-0" aria-labelledby="list">
          <h2 id="list" className="border-b border-line px-5 py-4 text-lg">
            {loaderData.viewers.length} viewer{loaderData.viewers.length === 1 ? "" : "s"}
          </h2>
          {loaderData.viewers.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No viewers yet">Add someone who only needs to read applications.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {loaderData.viewers.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info-50 text-info">
                    <Eye className="h-4 w-4" aria-hidden="true" />
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
                      title={`Remove ${v.name}'s access?`}
                      confirmLabel="Remove access"
                      disabled={busy}
                    >
                      <p>
                        They are signed out immediately and can no longer open applications.
                        {v.otherRoles.length
                          ? " Their other staff role is kept."
                          : " Their account is disabled."}
                      </p>
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
            <UserPlus className="h-5 w-5 text-brand-600" aria-hidden="true" /> Add a viewer
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
            hint="Use an official address. They sign in with a code sent to it."
          />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Adding…" : "Add viewer"}
          </button>
        </Form>
      </div>
    </div>
  );
}
