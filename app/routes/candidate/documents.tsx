import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/documents";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { getOwnApplication } from "~/modules/applications/service.server";
import { EDITABLE, type AppStatus } from "~/modules/applications/workflow";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import {
  DOCUMENT_TYPE_LABELS,
  INLINE_ENTRY_DOC_TYPES,
  STANDALONE_DOCUMENT_TYPES,
  type DocType,
} from "~/modules/documents/policy";
import { removeDocument, uploadDocument } from "~/modules/documents/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Documents — PSG Tech Recruitment" }];

const SCAN_LABEL: Record<string, string> = {
  PENDING: "Scan pending",
  CLEAN: "Scanned — clean",
  INFECTED: "Rejected by malware scan",
  FAILED: "Scan failed",
};

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  if (!EDITABLE.includes(app.status as AppStatus)) throw redirect(`/applications/${app.id}/receipt`);
  return {
    id: app.id,
    title: app.vacancy.title,
    required: app.vacancy.requiredDocuments.map((r) => ({
      type: r.documentType as DocType,
      label: r.label,
      required: r.required,
    })),
    documents: app.documents.map((d) => ({
      id: d.id,
      type: d.documentType as DocType,
      name: d.originalName,
      size: d.sizeBytes,
      scan: d.scanStatus,
      uploadedAt: d.uploadedAt,
    })),
    maxMb: env().MAX_UPLOAD_MB,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    const intent = form.get("intent");
    if (intent === "remove") {
      await removeDocument(user, params.id, String(form.get("documentId")));
      return { message: "The document was removed." };
    }
    const docType = form.get("documentType");
    if (docType && (INLINE_ENTRY_DOC_TYPES as readonly string[]).includes(String(docType))) {
      throw new ValidationError(
        "Qualification and experience certificates must be uploaded directly with their respective entries in the application form.",
      );
    }
    const file = form.get("file");
    await uploadDocument(user, params.id, docType, file instanceof File ? file : null);
    return { message: "The document was uploaded. It will be scanned for malware shortly." };
  });
}

export default function Documents({ loaderData, actionData }: Route.ComponentProps) {
  const { id, title, required, documents, maxMb } = loaderData;
  const nav = useNavigation();
  const uploading = nav.state === "submitting" && nav.formEncType === "multipart/form-data";
  const standaloneRequired = required.filter(
    (r) => !(INLINE_ENTRY_DOC_TYPES as readonly string[]).includes(r.type),
  );
  const checklist: { type: DocType; label: string; required: boolean }[] = [
    { type: "PHOTOGRAPH", label: DOCUMENT_TYPE_LABELS.PHOTOGRAPH, required: true },
    ...standaloneRequired,
  ];
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to={`/applications/${id}`}>Application form</Link> <span aria-hidden="true">/</span> Documents
      </nav>
      <h1>Documents and photograph</h1>
      <p className="text-sm text-muted">{title}</p>
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}

      <div className="rounded-2xl border border-line bg-soft/70 p-4 text-sm text-muted">
        <span className="font-semibold text-ink">Qualification &amp; experience certificates:</span> Supporting
        documents for academic qualifications (degree certificates, mark sheets) and employment experience
        testimonials are attached directly to each entry in the respective sections of your form.
      </div>

      <section className="card" aria-labelledby="checklist">
        <h2 id="checklist">Checklist</h2>
        <ul className="mt-3 space-y-2">
          {checklist.map((c) => {
            const have = documents.filter((d) => d.type === c.type);
            return (
              <li key={c.type} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {c.label}
                  {c.required ? "" : " (if applicable)"}
                </span>
                {have.length ? (
                  <Badge tone="success">Uploaded ({have.length})</Badge>
                ) : c.required ? (
                  <Badge tone="warning">Required — not uploaded</Badge>
                ) : (
                  <Badge>Optional</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="upload">
        <h2 id="upload">Upload a document</h2>
        <p className="mt-1 text-sm text-muted">
          PDF, JPEG or PNG, up to {maxMb} MB each. The photograph must be a JPEG or PNG image (up to 2 MB) and
          is printed in the photograph box of the official form. Password-protected PDFs cannot be accepted.
        </p>
        <Form
          method="post"
          encType="multipart/form-data"
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <CsrfInput />
          <div>
            <label htmlFor="documentType" className="block text-sm font-medium">
              Document type
            </label>
            <select id="documentType" name="documentType" required className="field-input mt-1">
              {STANDALONE_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="file" className="block text-sm font-medium">
              File
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="field-input mt-1"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </Form>
      </section>

      <section className="card overflow-x-auto" aria-labelledby="uploaded">
        <h2 id="uploaded">Uploaded documents</h2>
        {documents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No documents uploaded yet.</p>
        ) : (
          <table className="table mt-3">
            <caption className="sr-only">Uploaded documents</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">File</th>
                <th scope="col">Malware scan</th>
                <th scope="col">Uploaded</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{DOCUMENT_TYPE_LABELS[d.type]}</td>
                  <td>
                    <a href={`/files/documents/${d.id}`}>{d.name}</a>
                    <span className="block text-xs text-muted">{(d.size / 1024).toFixed(0)} KB</span>
                  </td>
                  <td>
                    <Badge tone={statusTone(d.scan)}>{SCAN_LABEL[d.scan]}</Badge>
                  </td>
                  <td>{formatDateTime(d.uploadedAt)}</td>
                  <td>
                    <Form method="post">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="remove" />
                      <input type="hidden" name="documentId" value={d.id} />
                      <ConfirmDialog
                        trigger="Remove"
                        triggerClassName="btn-secondary py-1"
                        tone="danger"
                        title="Remove this document?"
                        confirmLabel="Remove document"
                      >
                        <p>
                          “{d.name}” will be removed from your application. You can upload a replacement
                          afterwards.
                        </p>
                      </ConfirmDialog>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="flex justify-between">
        <Link to={`/applications/${id}`} className="btn-secondary">
          Back to the form
        </Link>
        <Link to={`/applications/${id}/review`} className="btn-primary">
          Review and submit
        </Link>
      </div>
    </div>
  );
}
