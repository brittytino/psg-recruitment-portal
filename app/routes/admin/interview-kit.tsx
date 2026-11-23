import { FileText, Presentation, Upload } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/interview-kit";
import { Alert, ConfirmDialog, CsrfInput, ErrorSummary } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import {
  getInterviewKit,
  INTERVIEW_FILE_MAX_MB,
  saveInterviewKit,
} from "~/modules/settings/interview-kit.server";

export const meta: Route.MetaFunction = () => [
  { title: "Interview kit — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  requireStaff(context, request, "interview_kit:manage");
  return { kit: await getInterviewKit(), maxMb: INTERVIEW_FILE_MAX_MB };
}

const asFile = (v: FormDataEntryValue | null): File | null => (v instanceof File && v.size > 0 ? v : null);

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "interview_kit:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "save":
        await saveInterviewKit(user, {
          pptFile: asFile(form.get("pptFile")),
          datasheetFile: asFile(form.get("datasheetFile")),
          venueTemplate: form.get("venueTemplate"),
          instructionsTemplate: form.get("instructionsTemplate"),
        });
        return { message: "Saved. Every interview call from now on uses this." };
      case "remove-ppt": {
        const kit = await getInterviewKit();
        await saveInterviewKit(user, {
          removePpt: true,
          venueTemplate: kit.venueTemplate,
          instructionsTemplate: kit.instructionsTemplate,
        });
        return { message: "PPT template removed." };
      }
      case "remove-datasheet": {
        const kit = await getInterviewKit();
        await saveInterviewKit(user, {
          removeDatasheet: true,
          venueTemplate: kit.venueTemplate,
          instructionsTemplate: kit.instructionsTemplate,
        });
        return { message: "Datasheet removed." };
      }
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InterviewKit({ loaderData, actionData }: Route.ComponentProps) {
  const { kit, maxMb } = loaderData;
  const busy = useNavigation().state !== "idle";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const fe = a?.fieldErrors ?? {};
  const summary = Object.entries(fe).flatMap(([k, v]) =>
    (v ?? []).map((text) => ({ text, href: `#f-${k}` })),
  );

  return (
    <div className="page-stack max-w-3xl">
      <PageHeader
        eyebrow="HR – N4 Section"
        title="Interview kit"
        description="Maintained by HR – N4 Section. The PPT template and datasheet here are attached automatically to every interview-call e-mail — whoever sends that call (HR, Admin or Dean / Principal) does not attach anything themselves. Common to every candidate, never customised per application. Replacing a file here applies to every interview call sent from then on."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
      <ErrorSummary messages={summary} />

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card space-y-3 p-5" aria-labelledby="ppt">
          <h2 id="ppt" className="flex items-center gap-2 text-lg">
            <Presentation className="h-5 w-5 text-brand-600" aria-hidden="true" /> PPT template
          </h2>
          {kit.pptName ? (
            <div className="rounded-lg bg-soft px-3 py-2 text-sm">
              <p className="font-medium text-ink">{kit.pptName}</p>
              <p className="text-muted">{formatSize(kit.pptSize)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing uploaded yet — no PPT is attached to interview calls.
            </p>
          )}
          {kit.pptName && (
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="remove-ppt" />
              <ConfirmDialog
                trigger="Remove"
                triggerClassName="btn-secondary btn-sm text-danger"
                tone="danger"
                title="Remove the PPT template?"
                confirmLabel="Remove"
                disabled={busy}
              >
                <p>Interview calls stop attaching a PPT until a new one is uploaded.</p>
              </ConfirmDialog>
            </Form>
          )}
        </section>

        <section className="card space-y-3 p-5" aria-labelledby="datasheet">
          <h2 id="datasheet" className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" /> Datasheet (PDF)
          </h2>
          {kit.datasheetName ? (
            <div className="rounded-lg bg-soft px-3 py-2 text-sm">
              <p className="font-medium text-ink">{kit.datasheetName}</p>
              <p className="text-muted">{formatSize(kit.datasheetSize)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing uploaded yet — no datasheet is attached to interview calls.
            </p>
          )}
          {kit.datasheetName && (
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="remove-datasheet" />
              <ConfirmDialog
                trigger="Remove"
                triggerClassName="btn-secondary btn-sm text-danger"
                tone="danger"
                title="Remove the datasheet?"
                confirmLabel="Remove"
                disabled={busy}
              >
                <p>Interview calls stop attaching a datasheet until a new one is uploaded.</p>
              </ConfirmDialog>
            </Form>
          )}
        </section>
      </div>

      <Form method="post" encType="multipart/form-data" className="card space-y-5">
        <CsrfInput />
        <input type="hidden" name="intent" value="save" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div id="f-ppt">
            <label htmlFor="pptFile" className="block text-sm font-semibold">
              Replace PPT template
            </label>
            <input
              id="pptFile"
              name="pptFile"
              type="file"
              accept=".ppt,.pptx,.pdf"
              className="field-input mt-1"
            />
            {fe.ppt && <p className="mt-1 text-sm text-danger">{fe.ppt[0]}</p>}
            <p className="mt-1 text-xs text-muted">.ppt, .pptx or .pdf, up to {maxMb} MB.</p>
          </div>
          <div id="f-datasheet">
            <label htmlFor="datasheetFile" className="block text-sm font-semibold">
              Replace datasheet
            </label>
            <input
              id="datasheetFile"
              name="datasheetFile"
              type="file"
              accept=".pdf"
              className="field-input mt-1"
            />
            {fe.datasheet && <p className="mt-1 text-sm text-danger">{fe.datasheet[0]}</p>}
            <p className="mt-1 text-xs text-muted">PDF only, up to {maxMb} MB.</p>
          </div>
        </div>

        <div>
          <label htmlFor="venueTemplate" className="block text-sm font-semibold">
            Default venue or online meeting link
          </label>
          <input
            id="venueTemplate"
            name="venueTemplate"
            defaultValue={kit.venueTemplate}
            placeholder="Board Room, Admin Block, PSG Tech"
            className="field-input mt-1"
          />
        </div>
        <div>
          <label htmlFor="instructionsTemplate" className="block text-sm font-semibold">
            Default instructions for the candidate
          </label>
          <textarea
            id="instructionsTemplate"
            name="instructionsTemplate"
            rows={3}
            defaultValue={kit.instructionsTemplate}
            placeholder="Report 30 minutes early; prepare a 10-minute presentation…"
            className="field-input mt-1"
          />
          <p className="mt-1 text-xs text-muted">
            Whoever sends the interview call sees this pre-filled, and can still edit it for that candidate
            before sending.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={busy}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Save"}
        </button>
      </Form>
    </div>
  );
}
