import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useCsrf } from "~/components/forms";
import { DOCUMENT_TYPE_LABELS, type DocType } from "~/modules/documents/policy";
import type {
  Answers,
  FieldDef,
  ListField,
  ScalarField,
  SectionDef,
  SelectField,
  TableAttachmentConfig,
  TableField,
  TableRow,
} from "~/modules/forms/types";
import { conditionMet, rowDuration, type FieldIssue } from "~/modules/forms/validation";

const todayIso = () => new Date().toISOString().slice(0, 10);
/** Scalars sit in a two-column grid; tables, lists, long text and wide fields span both columns. */
const fullWidth = (f: FieldDef) =>
  f.kind === "table" || f.kind === "list" || f.kind === "textarea" || !!f.wide;

/**
 * Renders one section of an official form definition as accessible inputs. The component is
 * controlled by the parent editor (which owns the full answers object and saving).
 */
export function SectionFields({
  section,
  answers,
  derived,
  issues,
  onChange,
  applicationId,
  csrf,
  maxUploadMb,
}: {
  section: SectionDef;
  answers: Answers;
  derived: Record<string, string | number | null>;
  issues: FieldIssue[];
  onChange: (key: string, value: Answers[string]) => void;
  applicationId?: string;
  csrf?: string;
  maxUploadMb?: number;
}) {
  const visible = section.fields.filter((f) => conditionMet(f.when, answers));
  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {visible.map((f) => (
        <div key={f.key} className={fullWidth(f) ? "md:col-span-2" : undefined}>
          <FieldRenderer
            field={f}
            value={answers[f.key]}
            derived={derived[f.key]}
            issues={issues}
            onChange={(v) => onChange(f.key, v)}
            applicationId={applicationId}
            csrf={csrf}
            maxUploadMb={maxUploadMb}
          />
        </div>
      ))}
    </div>
  );
}

const issueFor = (issues: FieldIssue[], path: string) => issues.find((i) => i.path === path)?.message;

function FieldRenderer({
  field,
  value,
  derived,
  issues,
  onChange,
  applicationId,
  csrf,
  maxUploadMb,
}: {
  field: FieldDef;
  value: Answers[string] | undefined;
  derived: string | number | null | undefined;
  issues: FieldIssue[];
  onChange: (v: Answers[string]) => void;
  applicationId?: string;
  csrf?: string;
  maxUploadMb?: number;
}) {
  if (field.kind === "table")
    return (
      <TableEditor
        field={field}
        rows={Array.isArray(value) ? (value as TableRow[]) : []}
        issues={issues}
        onChange={onChange}
        applicationId={applicationId}
        csrf={csrf}
        maxUploadMb={maxUploadMb}
      />
    );
  if (field.kind === "list")
    return (
      <ListEditor
        field={field}
        items={Array.isArray(value) ? (value as string[]) : []}
        issues={issues}
        onChange={onChange}
      />
    );
  return (
    <ScalarInput
      field={field}
      path={field.key}
      value={
        field.kind === "derived" ? (derived ?? null) : ((value as string | number | null | undefined) ?? null)
      }
      error={issueFor(issues, field.key)}
      onChange={onChange}
    />
  );
}

export function ScalarInput({
  field,
  path,
  value,
  error,
  onChange,
  compact,
}: {
  field: ScalarField;
  path: string;
  value: string | number | null;
  error?: string;
  onChange: (v: string | number | null) => void;
  compact?: boolean;
}) {
  const id = `q-${path.replace(/\./g, "-")}`;
  const hintId = field.help ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const required = field.requirement === "required";
  const common = {
    id,
    name: path,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    "aria-required": required,
    className: "field-input",
  };
  const str = value == null ? "" : String(value);
  const set = (s: string | null) => onChange(s === "" || s == null ? null : s);
  let input: React.ReactNode;
  switch (field.kind) {
    case "derived":
      input = (
        <p
          id={id}
          className="rounded-xl border border-dashed border-brand-600/30 bg-brand-50 px-4 py-2.5 text-sm"
          aria-describedby={describedBy}
        >
          {str || "Calculated automatically from your answers"}
        </p>
      );
      break;
    case "textarea":
      input = (
        <textarea
          {...common}
          rows={field.rows ?? 4}
          maxLength={field.maxLength}
          value={str}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case "date":
      input = <input {...common} type="date" value={str} onChange={(e) => set(e.target.value)} />;
      break;
    case "monthYear":
      input = (
        <input
          {...common}
          type="month"
          value={str}
          placeholder="YYYY-MM"
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case "number":
      input = (
        <input
          {...common}
          type="number"
          inputMode={field.integer ? "numeric" : "decimal"}
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : "any"}
          placeholder={field.placeholder}
          value={str}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
      break;
    case "select":
      input = field.allowOther ? (
        <SelectWithOther
          field={field}
          id={id}
          path={path}
          value={value}
          common={common}
          describedBy={describedBy}
          error={error}
          onChange={set}
        />
      ) : (
        <select {...common} value={str} onChange={(e) => set(e.target.value)}>
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    default:
      input = (
        <input
          {...common}
          type={field.inputMode === "email" ? "email" : field.inputMode === "tel" ? "tel" : "text"}
          inputMode={field.inputMode}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={str}
          className={`field-input ${field.uppercase ? "uppercase" : ""}`}
          onChange={(e) => set(field.uppercase ? e.target.value.toUpperCase() : e.target.value)}
        />
      );
  }
  return (
    <div className={compact ? "space-y-1" : "space-y-1"}>
      <label htmlFor={id} className="block text-[15px] font-semibold text-ink">
        {field.label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : field.requirement === "policy" ? (
          <span className="font-normal text-muted"> (optional — awaiting policy)</span>
        ) : field.kind === "derived" ? null : (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {field.help && (
        <p id={hintId} className="text-sm text-muted">
          {field.help}
        </p>
      )}
      {input}
      {error && (
        <p id={errId} className="text-sm text-danger">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}

function SelectWithOther({
  field,
  id,
  path,
  value,
  common,
  describedBy,
  error,
  onChange,
}: {
  field: SelectField;
  id: string;
  path: string;
  value: string | number | null;
  common: Record<string, unknown>;
  describedBy?: string;
  error?: string;
  onChange: (v: string | null) => void;
}) {
  const otherVal = field.otherOptionValue ?? "Others";
  const otherInputId = `${id}-other`;
  const otherErrId = error ? `${otherInputId}-err` : undefined;

  const rawStr = value == null ? "" : String(value);

  // Check if rawStr matches an existing predefined option (case-insensitive for resilience)
  const matchedOption = useMemo(() => {
    if (!rawStr) return null;
    return field.options.find((o) => o.value.toLowerCase() === rawStr.toLowerCase());
  }, [field.options, rawStr]);

  const isCustom = rawStr !== "" && (!matchedOption || matchedOption.value === otherVal);

  const [isOtherSelected, setIsOtherSelected] = useState<boolean>(() => isCustom || rawStr === otherVal);
  const [customText, setCustomText] = useState<string>(() => {
    if (isCustom && rawStr !== otherVal) return rawStr;
    return "";
  });

  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (rawStr === lastEmittedRef.current) return;
    if (!rawStr) {
      setIsOtherSelected(false);
      setCustomText("");
      return;
    }
    const matched = field.options.find((o) => o.value.toLowerCase() === rawStr.toLowerCase());
    if (matched && matched.value !== otherVal) {
      setIsOtherSelected(false);
      setCustomText("");
    } else {
      setIsOtherSelected(true);
      setCustomText(rawStr === otherVal ? "" : rawStr);
    }
  }, [rawStr, field.options, otherVal]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === otherVal) {
      setIsOtherSelected(true);
      const nextVal = customText.trim() === "" ? otherVal : customText.trim();
      lastEmittedRef.current = nextVal;
      onChange(nextVal);
    } else if (selected === "") {
      setIsOtherSelected(false);
      setCustomText("");
      lastEmittedRef.current = null;
      onChange(null);
    } else {
      setIsOtherSelected(false);
      setCustomText("");
      lastEmittedRef.current = selected;
      onChange(selected);
    }
  };

  const handleCustomTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomText(val);
    const nextVal = val.trim() === "" ? otherVal : val;
    lastEmittedRef.current = nextVal;
    onChange(nextVal);
  };

  const selectValue = isOtherSelected ? otherVal : (matchedOption?.value ?? "");

  return (
    <div className="space-y-2">
      <select {...common} value={selectValue} onChange={handleSelectChange}>
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isOtherSelected && (
        <div className="mt-2 space-y-1.5 rounded-xl border border-line bg-soft/60 p-3.5 animate-in fade-in duration-200">
          <label htmlFor={otherInputId} className="block text-xs font-semibold text-ink">
            {field.otherLabel ?? `Please specify ${field.label.toLowerCase()}`}
            {field.requirement === "required" && (
              <span className="text-danger" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </label>
          <input
            id={otherInputId}
            name={`${path}_other`}
            type="text"
            className="field-input bg-white"
            placeholder={field.otherPlaceholder ?? `Type your ${field.label.toLowerCase()} here`}
            maxLength={field.otherMaxLength ?? 60}
            value={customText}
            onChange={handleCustomTextChange}
            autoFocus={!customText}
            aria-describedby={[describedBy, otherErrId].filter(Boolean).join(" ") || undefined}
            aria-invalid={!!error}
          />
          <p className="text-xs text-muted">
            If your {field.label.toLowerCase()} is not in the list above, type it in this field.
          </p>
        </div>
      )}
    </div>
  );
}

function RemoveButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className="btn-secondary py-1 text-danger"
        onClick={() => ref.current?.showModal()}
      >
        Remove <span className="sr-only">{label}</span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-full max-w-md rounded-3xl border-0 p-0 shadow-2xl"
      >
        <div className="p-6">
          <h2 id={titleId}>Remove {label}?</h2>
          <p className="mt-2 text-sm">The entry will be removed from your draft when you next save.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                ref.current?.close();
                onConfirm();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function TableEditor({
  field,
  rows,
  issues,
  onChange,
  applicationId,
  csrf,
  maxUploadMb,
}: {
  field: TableField;
  rows: TableRow[];
  issues: FieldIssue[];
  onChange: (v: TableRow[]) => void;
  applicationId?: string;
  csrf?: string;
  maxUploadMb?: number;
}) {
  const headingId = `t-${field.key}`;
  const tableError = issueFor(issues, field.key);
  const update = (i: number, key: string, v: string | number | null) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const updateAttachment = (i: number, doc: { id: string; name: string; type: string } | null) =>
    onChange(
      rows.map((r, j) =>
        j === i
          ? {
              ...r,
              documentId: doc ? doc.id : null,
              documentName: doc ? doc.name : null,
              documentType: doc ? doc.type : null,
            }
          : r,
      ),
    );
  const item = field.itemLabel ?? "Entry";
  const canRemove = rows.length > (field.minRows ?? 0);
  const add = () =>
    onChange([
      ...rows,
      {
        ...Object.fromEntries(field.columns.filter((c) => c.kind !== "derived").map((c) => [c.key, null])),
        ...(field.attachment ? { documentId: null, documentName: null, documentType: null } : {}),
      },
    ]);
  const rootCsrf = useCsrf();
  const routeParams = useParams();
  const effectiveAppId = applicationId ?? routeParams.id;
  const effectiveCsrf = csrf || rootCsrf;

  const remove = (i: number) => {
    const rowToRemove = rows[i];
    if (rowToRemove?.documentId && effectiveAppId && effectiveCsrf) {
      const fd = new FormData();
      fd.append("_csrf", effectiveCsrf);
      fd.append("intent", "remove");
      fd.append("documentId", String(rowToRemove.documentId));
      fetch(`/applications/${effectiveAppId}/attachments`, { method: "POST", body: fd }).catch(() => {});
    }
    onChange(rows.filter((_, j) => j !== i));
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r!);
    onChange(next);
  };
  return (
    <fieldset className="space-y-3 rounded-2xl bg-soft p-5" aria-labelledby={headingId}>
      <legend id={headingId} className="px-1 text-base font-semibold">
        {field.label}
        {field.requirement === "required" && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {field.minRows && field.minRows > 0
            ? `Add at least ${field.minRows}${field.maxRows <= 10 ? ` and at most ${field.maxRows}` : ""} ${item.toLowerCase()}${field.minRows === 1 ? "" : "s"}.`
            : field.templateRows > 0
              ? `The printed form has ${field.templateRows} rows; additional entries are added to the same table.`
              : "Add an entry for each item. Leave empty if not applicable."}
        </p>
        {field.countLabel && (
          <span
            className="rounded-full bg-white px-3 py-1 text-sm font-semibold shadow-xs"
            aria-live="polite"
          >
            {field.countLabel}: {rows.length}
          </span>
        )}
      </div>
      {field.help && <p className="text-sm text-muted">{field.help}</p>}
      {tableError && (
        <p className="text-sm text-danger" role="alert">
          {tableError}
        </p>
      )}
      {rows.length === 0 && <p className="text-sm text-muted">No entries yet.</p>}
      <ol className="space-y-4">
        {rows.map((row, i) => (
          <li key={i} className="rounded-2xl bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-semibold">
                {item} {i + 1}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary py-1"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move entry ${i + 1} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn-secondary py-1"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move entry ${i + 1} down`}
                >
                  Down
                </button>
                {canRemove && (
                  <RemoveButton label={`${item.toLowerCase()} ${i + 1}`} onConfirm={() => remove(i)} />
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field.columns
                .filter((c) => conditionMet(c.when, row))
                .map((c) => (
                  <ScalarInput
                    key={c.key}
                    compact
                    field={c}
                    path={`${field.key}.${i}.${c.key}`}
                    value={
                      c.kind === "derived"
                        ? rowDuration(row, todayIso()) || null
                        : ((row[c.key] as string | number | null | undefined) ?? null)
                    }
                    error={issueFor(issues, `${field.key}.${i}.${c.key}`)}
                    onChange={(v) => update(i, c.key, v)}
                  />
                ))}
            </div>
            {field.attachment && (
              <InlineAttachmentEditor
                config={field.attachment}
                row={row}
                rowIndex={i}
                fieldKey={field.key}
                error={issueFor(issues, `${field.key}.${i}.documentId`)}
                applicationId={effectiveAppId}
                csrf={effectiveCsrf}
                maxUploadMb={maxUploadMb}
                onAttached={(doc) => updateAttachment(i, doc)}
                onRemoved={() => updateAttachment(i, null)}
              />
            )}
          </li>
        ))}
      </ol>
      {rows.length < field.maxRows ? (
        <button type="button" className="btn-secondary" onClick={add}>
          + Add {rows.length ? "another " : ""}
          {item.toLowerCase()}
        </button>
      ) : (
        <p className="text-sm text-muted">The maximum of {field.maxRows} entries has been reached.</p>
      )}
    </fieldset>
  );
}

function InlineAttachmentEditor({
  config,
  row,
  rowIndex,
  fieldKey,
  error,
  applicationId,
  csrf,
  maxUploadMb,
  onAttached,
  onRemoved,
}: {
  config: TableAttachmentConfig;
  row: TableRow;
  rowIndex: number;
  fieldKey: string;
  error?: string;
  applicationId?: string;
  csrf?: string;
  maxUploadMb?: number;
  onAttached: (doc: { id: string; name: string; type: string }) => void;
  onRemoved: () => void;
}) {
  const rootCsrf = useCsrf();
  const routeParams = useParams();
  const effectiveAppId = applicationId ?? routeParams.id;
  const effectiveCsrf = csrf || rootCsrf;

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocType>(
    config.docType ?? config.allowedDocTypes?.[0] ?? "DEGREE_CERTIFICATE",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDoc = Boolean(row.documentId);
  const docName = row.documentName ? String(row.documentName) : "Attached document";
  const docId = row.documentId ? String(row.documentId) : null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!effectiveAppId || !effectiveCsrf) {
      setUploadError("Unable to upload document: session context is missing. Please reload the page.");
      return;
    }
    const maxBytes = (maxUploadMb ?? 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`File is too large. Maximum allowed size is ${maxUploadMb ?? 10} MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("_csrf", effectiveCsrf);
      fd.append("documentType", selectedDocType);
      fd.append("file", file);
      const res = await fetch(`/applications/${effectiveAppId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.ok && data.document) {
        onAttached(data.document);
      } else {
        setUploadError(data.formError || "Upload failed. Please check that the file is not damaged.");
      }
    } catch {
      setUploadError("Could not connect to upload file. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!docId || !effectiveAppId || !effectiveCsrf) {
      onRemoved();
      return;
    }
    setRemoving(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("_csrf", effectiveCsrf);
      fd.append("intent", "remove");
      fd.append("documentId", docId);
      await fetch(`/applications/${effectiveAppId}/attachments`, {
        method: "POST",
        body: fd,
      });
    } catch {
      // Soft fail network error; detach locally
    } finally {
      setRemoving(false);
      onRemoved();
    }
  };

  const inputId = `file-${fieldKey}-${rowIndex}`;
  const errId = `err-${fieldKey}-${rowIndex}`;

  if (hasDoc && docId) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-soft/70 p-3.5 sm:flex sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800 font-bold text-xs">
            DOC
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink" title={docName}>
              {docName}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Attached to Entry {rowIndex + 1}
              </span>
              <span>·</span>
              <a
                href={`/files/documents/${docId}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline hover:text-brand-900"
              >
                View document
              </a>
            </div>
          </div>
        </div>
        <div className="mt-2.5 sm:mt-0 shrink-0">
          <button
            type="button"
            className="btn-secondary py-1 text-xs text-danger hover:bg-danger/10"
            disabled={removing}
            onClick={handleRemove}
          >
            {removing ? "Removing…" : "Remove / Replace file"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mt-4 rounded-xl border border-dashed p-4 transition-colors ${
        error || uploadError ? "border-danger/60 bg-danger/5" : "border-line bg-soft/40"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <label htmlFor={inputId} className="block text-sm font-semibold text-ink">
            {config.label ?? "Supporting document / certificate"}
            {config.required && (
              <span className="text-danger" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </label>
          <p className="mt-0.5 text-xs text-muted">
            {config.help ?? `Upload PDF, JPEG, or PNG up to ${maxUploadMb ?? 10} MB`}
          </p>
        </div>
        {config.allowedDocTypes && config.allowedDocTypes.length > 1 && (
          <div className="w-full sm:w-auto">
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value as DocType)}
              className="field-input py-1 text-xs"
              aria-label="Document type for this certificate"
            >
              {config.allowedDocTypes.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          id={inputId}
          name={`${fieldKey}_file_${rowIndex}`}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={handleUpload}
          disabled={uploading}
          className="text-xs file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          aria-invalid={!!(error || uploadError)}
          aria-describedby={
            [uploadError ? `${errId}-up` : undefined, error ? errId : undefined].filter(Boolean).join(" ") ||
            undefined
          }
        />
        {uploading && (
          <span className="text-xs text-brand-700 font-medium animate-pulse">
            Uploading and inspecting document…
          </span>
        )}
      </div>

      {uploadError && (
        <p id={`${errId}-up`} className="mt-2 text-xs font-medium text-danger" role="alert">
          {uploadError}
        </p>
      )}
      {error && !uploadError && (
        <p id={errId} className="mt-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ListEditor({
  field,
  items,
  issues,
  onChange,
}: {
  field: ListField;
  items: string[];
  issues: FieldIssue[];
  onChange: (v: string[]) => void;
}) {
  const headingId = `l-${field.key}`;
  return (
    <fieldset className="space-y-3 rounded-2xl bg-soft p-5" aria-labelledby={headingId}>
      <legend id={headingId} className="px-1 text-base font-semibold">
        {field.label}
      </legend>
      {field.templateCapacity > 0 && (
        <p className="text-sm text-muted">
          Space for about {field.templateCapacity} entries is printed; longer lists continue on additional
          lines without truncation.
        </p>
      )}
      {field.help && <p className="text-xs text-muted">{field.help}</p>}
      {items.length === 0 && <p className="text-sm text-muted">No entries yet.</p>}
      <ol className="space-y-3">
        {items.map((it, i) => {
          const id = `q-${field.key}-${i}`;
          const err = issueFor(issues, `${field.key}.${i}`);
          return (
            <li key={i} className="space-y-1">
              <label htmlFor={id} className="block text-sm font-medium">
                {field.itemLabel} {i + 1}
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id={id}
                  rows={2}
                  maxLength={field.itemMaxLength}
                  className="field-input"
                  aria-invalid={!!err}
                  aria-describedby={err ? `${id}-err` : undefined}
                  value={it}
                  onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <RemoveButton
                  label={`${field.itemLabel.toLowerCase()} ${i + 1}`}
                  onConfirm={() => onChange(items.filter((_, j) => j !== i))}
                />
              </div>
              {err && (
                <p id={`${id}-err`} className="text-sm text-danger">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => onChange([...items, ""])}
        disabled={items.length >= field.maxItems}
      >
        Add {field.itemLabel.toLowerCase()}
      </button>
    </fieldset>
  );
}

/** Read-only rendering of answers for the review page (HTML preview of the official form content). */
export function AnswerView({ field, value }: { field: FieldDef; value: Answers[string] | undefined }) {
  const empty = <span className="text-muted">Not provided</span>;
  const fmt = (f: ScalarField, v: unknown) => {
    if (v == null || v === "") return null;
    if (f.kind === "select") {
      const match = f.options.find((o) => o.value === v);
      if (match) return match.label;
      if (f.allowOther) return `Other: ${String(v)}`;
      return String(v);
    }
    return String(v);
  };
  if (field.kind === "table") {
    const rows = Array.isArray(value) ? (value as TableRow[]) : [];
    if (!rows.length) return empty;
    const hasAttachments = field.attachment || rows.some((r) => r.documentId);
    return (
      <div className="overflow-x-auto">
        <table className="table">
          <caption className="sr-only">{field.label}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              {field.columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              {hasAttachments && <th scope="col">Certificate / Document</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {field.columns.map((c) => (
                  <td key={c.key}>
                    {c.kind === "derived"
                      ? rowDuration(r, todayIso()) || "—"
                      : conditionMet(c.when, r)
                        ? (fmt(c, r[c.key]) ?? "—")
                        : "—"}
                  </td>
                ))}
                {hasAttachments && (
                  <td>
                    {r.documentId ? (
                      <a
                        href={`/files/documents/${r.documentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        <span aria-hidden="true">📄</span>
                        <span>{r.documentName ? String(r.documentName) : "Attached document"}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted">Not attached</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (field.kind === "list") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    if (!items.length) return empty;
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {items.map((x, i) => (
          <li key={i} className="whitespace-pre-line">
            {x}
          </li>
        ))}
      </ol>
    );
  }
  const v = fmt(field, value);
  return v ? <span className="whitespace-pre-line">{v}</span> : empty;
}
