import { useId, useRef } from "react";
import type { Answers, FieldDef, ListField, ScalarField, SectionDef, TableField, TableRow } from "~/modules/forms/types";
import type { FieldIssue } from "~/modules/forms/validation";

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
}: {
  section: SectionDef;
  answers: Answers;
  derived: Record<string, string | number | null>;
  issues: FieldIssue[];
  onChange: (key: string, value: Answers[string]) => void;
}) {
  return (
    <div className="space-y-6">
      {section.fields.map((f) => (
        <FieldRenderer key={f.key} field={f} value={answers[f.key]} derived={derived[f.key]} issues={issues} onChange={(v) => onChange(f.key, v)} />
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
}: {
  field: FieldDef;
  value: Answers[string] | undefined;
  derived: string | number | null | undefined;
  issues: FieldIssue[];
  onChange: (v: Answers[string]) => void;
}) {
  if (field.kind === "table") return <TableEditor field={field} rows={Array.isArray(value) ? (value as TableRow[]) : []} issues={issues} onChange={onChange} />;
  if (field.kind === "list") return <ListEditor field={field} items={Array.isArray(value) ? (value as string[]) : []} issues={issues} onChange={onChange} />;
  return (
    <ScalarInput
      field={field}
      path={field.key}
      value={field.kind === "derived" ? (derived ?? null) : ((value as string | number | null | undefined) ?? null)}
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
  const set = (s: string) => onChange(s === "" ? null : s);
  let input: React.ReactNode;
  switch (field.kind) {
    case "derived":
      input = (
        <p id={id} className="rounded border border-dashed border-line bg-brand-50 px-3 py-2 text-sm" aria-describedby={describedBy}>
          {str || "Calculated automatically"}
        </p>
      );
      break;
    case "textarea":
      input = <textarea {...common} rows={field.rows ?? 4} maxLength={field.maxLength} value={str} onChange={(e) => set(e.target.value)} />;
      break;
    case "date":
      input = <input {...common} type="date" value={str} onChange={(e) => set(e.target.value)} />;
      break;
    case "monthYear":
      input = <input {...common} type="month" value={str} placeholder="YYYY-MM" onChange={(e) => set(e.target.value)} />;
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
          value={str}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
      break;
    case "select":
      input = (
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
          value={str}
          className={`field-input ${field.uppercase ? "uppercase" : ""}`}
          onChange={(e) => set(field.uppercase ? e.target.value.toUpperCase() : e.target.value)}
        />
      );
  }
  return (
    <div className={compact ? "space-y-1" : "space-y-1"}>
      <label htmlFor={id} className="block text-sm font-medium">
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
      {!compact && (
        <p className="text-xs text-muted">
          Official form, page {field.source.page}: “{field.source.label}”
        </p>
      )}
      {field.help && (
        <p id={hintId} className="text-xs text-muted">
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

function RemoveButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className="btn-secondary py-1 text-danger" onClick={() => ref.current?.showModal()}>
        Remove <span className="sr-only">{label}</span>
      </button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-full max-w-md rounded-md border border-line p-0">
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

function TableEditor({ field, rows, issues, onChange }: { field: TableField; rows: TableRow[]; issues: FieldIssue[]; onChange: (v: TableRow[]) => void }) {
  const headingId = `t-${field.key}`;
  const tableError = issueFor(issues, field.key);
  const update = (i: number, key: string, v: string | number | null) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const add = () => onChange([...rows, Object.fromEntries(field.columns.map((c) => [c.key, null]))]);
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r!);
    onChange(next);
  };
  return (
    <fieldset className="space-y-3 rounded border border-line p-4" aria-labelledby={headingId}>
      <legend id={headingId} className="px-1 text-base font-semibold">
        {field.label}
        {field.requirement === "required" && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </legend>
      <p className="text-xs text-muted">
        Official form, page {field.source.page}: “{field.source.label}”. The printed form has {field.templateRows} rows; additional entries are added to
        the same table. Up to {field.maxRows} entries.
      </p>
      {field.help && <p className="text-xs text-muted">{field.help}</p>}
      {tableError && (
        <p className="text-sm text-danger" role="alert">
          {tableError}
        </p>
      )}
      {rows.length === 0 && <p className="text-sm text-muted">No entries yet.</p>}
      <ol className="space-y-4">
        {rows.map((row, i) => (
          <li key={i} className="rounded border border-line bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Entry {i + 1}</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move entry ${i + 1} up`}>
                  Up
                </button>
                <button type="button" className="btn-secondary py-1" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move entry ${i + 1} down`}>
                  Down
                </button>
                <RemoveButton label={`entry ${i + 1}`} onConfirm={() => remove(i)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {field.columns.map((c) => (
                <ScalarInput
                  key={c.key}
                  compact
                  field={c}
                  path={`${field.key}.${i}.${c.key}`}
                  value={(row[c.key] as string | number | null | undefined) ?? null}
                  error={issueFor(issues, `${field.key}.${i}.${c.key}`)}
                  onChange={(v) => update(i, c.key, v)}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary" onClick={add} disabled={rows.length >= field.maxRows}>
        Add entry to “{field.label}”
      </button>
    </fieldset>
  );
}

function ListEditor({ field, items, issues, onChange }: { field: ListField; items: string[]; issues: FieldIssue[]; onChange: (v: string[]) => void }) {
  const headingId = `l-${field.key}`;
  return (
    <fieldset className="space-y-3 rounded border border-line p-4" aria-labelledby={headingId}>
      <legend id={headingId} className="px-1 text-base font-semibold">
        {field.label}
      </legend>
      <p className="text-xs text-muted">
        Official form, page {field.source.page}: “{field.source.label}”. Space for about {field.templateCapacity} entries is printed; longer lists
        continue on additional lines without truncation.
      </p>
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
                <RemoveButton label={`${field.itemLabel.toLowerCase()} ${i + 1}`} onConfirm={() => onChange(items.filter((_, j) => j !== i))} />
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
      <button type="button" className="btn-secondary" onClick={() => onChange([...items, ""])} disabled={items.length >= field.maxItems}>
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
    if (f.kind === "select") return f.options.find((o) => o.value === v)?.label ?? String(v);
    return String(v);
  };
  if (field.kind === "table") {
    const rows = Array.isArray(value) ? (value as TableRow[]) : [];
    if (!rows.length) return empty;
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {field.columns.map((c) => (
                  <td key={c.key}>{fmt(c, r[c.key]) ?? "—"}</td>
                ))}
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
