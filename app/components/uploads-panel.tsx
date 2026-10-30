import { DocumentViewer } from "~/components/document-viewer";
import { useRef, useState } from "react";
import { postUpload, tooLargeMessage } from "~/lib/upload-client";
import { useRevalidator } from "react-router";
import { Badge, useCsrf } from "~/components/forms";
import { DOCUMENT_TYPE_LABELS, IMAGE_ONLY_TYPES, type DocType } from "~/modules/documents/policy";
import type { Answers, UploadGroup } from "~/modules/forms/types";
import { uploadRequired } from "~/modules/forms/validation";

export interface UploadedDoc {
  id: string;
  type: DocType;
  name: string;
  size: number;
  scan: string;
}

const SCAN: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  CLEAN: { label: "Checked", tone: "success" },
  PENDING: { label: "Checking…", tone: "warning" },
  FAILED: { label: "Check failed — upload again", tone: "danger" },
  INFECTED: { label: "Rejected — unsafe file", tone: "danger" },
};

/**
 * Documents step of the v2 application: one card per upload group (photograph, signature, resume,
 * salary slip, service certificate, memberships, publication proofs, …) with its own status.
 */
export function UploadsPanel({
  applicationId,
  groups,
  answers,
  documents,
  maxUploadMb,
}: {
  applicationId: string;
  groups: readonly UploadGroup[];
  answers: Answers;
  documents: UploadedDoc[];
  maxUploadMb: number;
}) {
  const required = groups.filter((g) => uploadRequired(g, answers));
  const optional = groups.filter((g) => !uploadRequired(g, answers));
  return (
    <div className="space-y-8">
      <section aria-labelledby="up-req" className="space-y-4">
        <h3 id="up-req">Required documents</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {required.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              required
              applicationId={applicationId}
              documents={documents}
              maxUploadMb={maxUploadMb}
            />
          ))}
        </div>
      </section>
      <section aria-labelledby="up-opt" className="space-y-4">
        <h3 id="up-opt">Other documents (if applicable)</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {optional.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              required={false}
              applicationId={applicationId}
              documents={documents}
              maxUploadMb={maxUploadMb}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function GroupCard({
  group,
  required,
  applicationId,
  documents,
  maxUploadMb,
}: {
  group: UploadGroup;
  required: boolean;
  applicationId: string;
  documents: UploadedDoc[];
  maxUploadMb: number;
}) {
  const csrf = useCsrf();
  const revalidator = useRevalidator();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = group.types[0]!;
  const docs = documents.filter((d) => group.types.includes(d.type));
  const imageOnly = IMAGE_ONLY_TYPES.includes(type);
  const accept = imageOnly
    ? ".jpg,.jpeg,.png,image/jpeg,image/png"
    : type === "RESUME"
      ? ".pdf,application/pdf"
      : ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
  const id = `upload-${group.id}`;

  const send = async (fd: FormData) => {
    setBusy(true);
    setError(null);
    try {
      fd.append("_csrf", csrf);
      const data = await postUpload(`/applications/${applicationId}/attachments`, fd, maxUploadMb);
      if (!data.ok) setError(data.formError ?? "The file could not be uploaded.");
      revalidator.revalidate();
    } catch {
      setError("The upload could not be completed. Please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    const big = imageOnly
      ? file.size > 2 * 1024 * 1024
        ? "The image is larger than 2 MB. Take a smaller photo or reduce its size and upload again."
        : null
      : tooLargeMessage(file, maxUploadMb);
    if (big) {
      setError(big);
      if (input.current) input.current.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("documentType", type);
    fd.append("file", file);
    void send(fd);
  };

  const remove = (documentId: string) => {
    const fd = new FormData();
    fd.append("intent", "remove");
    fd.append("documentId", documentId);
    void send(fd);
  };

  const done = docs.length > 0;
  return (
    <div
      className={`rounded-xl border p-5 ${error ? "border-danger/60 bg-danger-50" : done ? "border-success/30 bg-success-50/40" : "border-line bg-paper"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={id} className="text-base font-semibold">
            {group.title}
            {required && (
              <span className="text-danger" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </label>
          <p id={`${id}-help`} className="mt-1 text-sm text-muted">
            {group.help}
          </p>
        </div>
        {required ? (
          <Badge tone={done ? "success" : "warning"}>{done ? "Uploaded" : "Required"}</Badge>
        ) : done ? (
          <Badge tone="success">Uploaded</Badge>
        ) : (
          <Badge>Optional</Badge>
        )}
      </div>

      {docs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper p-3 text-sm shadow-xs"
            >
              <span className="min-w-0">
                <a href={`/files/documents/${d.id}`} className="block truncate font-medium" title={d.name}>
                  {d.name}
                </a>
                <span className="text-xs text-muted">
                  {DOCUMENT_TYPE_LABELS[d.type]} · {(d.size / 1024).toFixed(0)} KB
                </span>
              </span>
              <span className="flex items-center gap-2">
                <DocumentViewer file={{ href: `/files/documents/${d.id}`, name: d.name }} />
                <Badge tone={SCAN[d.scan]?.tone ?? "warning"}>{SCAN[d.scan]?.label ?? d.scan}</Badge>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => remove(d.id)}
                >
                  Remove <span className="sr-only">{d.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(!group.single || docs.length === 0) && (
        <div className="mt-4">
          <input
            ref={input}
            id={id}
            type="file"
            accept={accept}
            disabled={busy}
            aria-describedby={`${id}-help${error ? ` ${id}-err` : ""}`}
            aria-invalid={!!error}
            onChange={(e) => upload(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-black"
          />
          <p className="mt-1.5 text-xs text-muted">
            {imageOnly
              ? "JPG or PNG · maximum 2 MB."
              : type === "RESUME"
                ? `PDF only · maximum ${maxUploadMb} MB.`
                : `PDF, JPG or PNG · maximum ${maxUploadMb} MB per file.`}
          </p>
        </div>
      )}
      {group.single && docs.length > 0 && (
        <p className="mt-3 text-xs text-muted">To replace this file, remove it and upload the new one.</p>
      )}
      {busy && (
        <p className="mt-2 text-sm font-medium text-brand-700" role="status">
          Uploading and checking the file…
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
