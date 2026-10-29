import { Form, useNavigation } from "react-router";
import { ExternalLink, FileText, Upload } from "lucide-react";
import type { Route } from "./+types/notices";
import { Alert, Badge, CsrfInput, ErrorSummary, formatDateTime, TextInput } from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import {
  listNotices,
  NOTICE_CATEGORIES,
  NOTICE_LABELS,
  NOTICE_MAX_MB,
  NOTICE_PATHS,
  setNoticeActive,
  uploadNotice,
} from "~/modules/notices/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Open positions PDFs — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "notice:manage");
  return {
    notices: await listNotices(user),
    maxMb: NOTICE_MAX_MB,
    categories: NOTICE_CATEGORIES.map((c) => ({ value: c, label: NOTICE_LABELS[c], path: NOTICE_PATHS[c] })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "notice:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "upload":
        await uploadNotice(user, form.get("category"), form.get("title"), form.get("file"));
        return {
          message:
            form.get("category") === "RESEARCH"
              ? "Published. The “Research positions” button on the home page now opens this PDF."
              : "Published. The “Faculty positions” button on the home page now opens this PDF.",
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
  const { notices, maxMb, categories } = loaderData;
  const busy = useNavigation().state === "submitting";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const fe = a?.fieldErrors;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
    : [];
  const label = (c: string) => categories.find((x) => x.value === c)?.label ?? c;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="HR – N4 Section"
        title="Open positions PDFs"
        description="Upload the recruitment advertisements as PDFs: one for faculty positions and one for research positions. Each opens from its own button on the home page."
        actions={
          <div className="flex flex-wrap gap-2">
            {categories
              .filter((c) => notices.some((n) => n.active && n.category === c.value))
              .map((c) => (
                <a key={c.value} href={c.path} target="_blank" rel="noreferrer" className="btn-secondary">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> View {c.label.toLowerCase()} PDF
                </a>
              ))}
          </div>
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
                Until a PDF is uploaded, the home page buttons open the list of vacancies instead.
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
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {n.title}
                      <Badge tone="info">{label(n.category)}</Badge>
                    </span>
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
            <h2 className="text-lg">Upload a PDF</h2>
          </div>
          <Form method="post" encType="multipart/form-data" className="space-y-4">
            <CsrfInput />
            <input type="hidden" name="intent" value="upload" />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Positions{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((c, i) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
                  >
                    <input type="radio" name="category" value={c.value} defaultChecked={i === 0} required />
                    {c.value === "RESEARCH" ? "Research" : "Faculty"}
                  </label>
                ))}
              </div>
              {fe?.category?.[0] && <p className="text-sm text-danger">{fe.category[0]}</p>}
            </fieldset>
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
                PDF only, up to {maxMb} MB. It replaces the PDF currently shown for the chosen positions.
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
              {busy ? "Uploading…" : "Publish PDF"}
            </button>
          </Form>
        </aside>
      </div>
    </div>
  );
}
