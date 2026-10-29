import { Form, useNavigation } from "react-router";
import { ExternalLink, FileText, Upload } from "lucide-react";
import type { Route } from "./+types/notices";
import { Alert, Badge, CsrfInput, ErrorSummary, formatDateTime, TextInput } from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import { listNotices, NOTICE_MAX_MB, setNoticeActive, uploadNotice } from "~/modules/notices/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Open positions notice — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "notice:manage");
  return { notices: await listNotices(user), maxMb: NOTICE_MAX_MB };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "notice:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "upload":
        await uploadNotice(user, form.get("title"), form.get("file"));
        return {
          message: "Notice published. The “Open positions” button on the home page now opens this PDF.",
        };
      case "toggle":
        await setNoticeActive(user, String(form.get("id")), form.get("active") === "true");
        return {
          message: form.get("active") === "true" ? "Notice is now shown on the home page." : "Notice hidden.",
        };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const kb = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

export default function Notices({ loaderData, actionData }: Route.ComponentProps) {
  const { notices, maxMb } = loaderData;
  const busy = useNavigation().state === "submitting";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const fe = a?.fieldErrors;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
    : [];
  const live = notices.find((n) => n.active);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="HR – N4 Section"
        title="Open positions notice"
        description="Upload the recruitment advertisement as a PDF. The newest visible notice opens from the “Open positions” button on the home page."
        actions={
          live ? (
            <a href="/open-positions.pdf" target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> View public PDF
            </a>
          ) : null
        }
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
      <ErrorSummary messages={summary} />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem] xl:items-start">
        <section className="card p-0" aria-label="Uploaded notices">
          {notices.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No notice uploaded yet">
                Until a notice is uploaded the home page does not show the “Open positions” PDF button.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {notices.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <span className="icon-tile">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{n.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {n.originalName} · {kb(n.sizeBytes)} · {formatDateTime(n.uploadedAt)}
                    </span>
                  </span>
                  <Badge tone={n.active ? "success" : "neutral"}>
                    {n.active ? "On home page" : "Hidden"}
                  </Badge>
                  <Form method="post">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="active" value={n.active ? "false" : "true"} />
                    <button type="submit" className="btn-secondary btn-sm" disabled={busy}>
                      {n.active ? "Hide" : "Show on home page"}
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="card space-y-4 xl:sticky xl:top-24">
          <div className="flex items-center gap-3">
            <span className="icon-tile">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg">Upload a new notice</h2>
          </div>
          <Form method="post" encType="multipart/form-data" className="space-y-4">
            <CsrfInput />
            <input type="hidden" name="intent" value="upload" />
            <TextInput
              label="Title"
              name="title"
              required
              placeholder="Faculty recruitment 2026-27 — advertisement"
              error={fe?.title?.[0]}
            />
            <div className="space-y-1">
              <label htmlFor="f-file" className="block text-sm font-medium">
                PDF file{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </label>
              <p id="f-file-hint" className="text-xs text-muted">
                PDF only, up to {maxMb} MB. It replaces the notice currently on the home page.
              </p>
              <input
                id="f-file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                aria-describedby="f-file-hint"
                aria-invalid={!!fe?.file}
                className="file-input"
              />
              {fe?.file?.[0] && <p className="text-sm text-danger">{fe.file[0]}</p>}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Uploading…" : "Publish notice"}
            </button>
          </Form>
        </aside>
      </div>
    </div>
  );
}
