import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouteLoaderData } from "react-router";

type RootData = { csrf: string } | undefined;

/** Hidden CSRF token; include in every form that mutates data. */
export function CsrfInput() {
  const root = useRouteLoaderData("root") as RootData;
  return <input type="hidden" name="_csrf" value={root?.csrf ?? ""} />;
}

export function useCsrf(): string {
  return (useRouteLoaderData("root") as RootData)?.csrf ?? "";
}

type FieldErrors = Record<string, string[] | undefined> | undefined;

export function errorFor(errors: FieldErrors, name: string): string | undefined {
  return errors?.[name]?.[0];
}

interface FieldProps {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + hint + inline error wired up with aria-describedby / aria-invalid. */
export function Field({ label, name, hint, error, required, children }: FieldProps) {
  const id = `f-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: !!error })}
      {error && (
        <p id={errId} className="text-sm text-danger">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  label,
  name,
  type = "text",
  defaultValue,
  value,
  onChange,
  error,
  hint,
  required,
  autoComplete,
  inputMode,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label} name={name} hint={hint} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue ?? undefined}
          value={value}
          onChange={onChange}
          required={required}
          aria-required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          className="field-input"
        />
      )}
    </Field>
  );
}

/** Error summary shown at the top of a form; receives focus so screen readers announce it. */
export function ErrorSummary({
  title = "There is a problem",
  messages,
}: {
  title?: string;
  messages: { text: string; href?: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.length) ref.current?.focus();
  }, [messages.length, messages[0]?.text]);
  if (!messages.length) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="mb-6 rounded-2xl bg-danger-50 p-5 ring-1 ring-red-200"
    >
      <h2 id="error-summary-title" className="text-base font-semibold text-danger">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {messages.map((m, i) => (
          <li key={i}>{m.href ? <a href={m.href}>{m.text}</a> : m.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: "bg-brand-50 ring-brand-100",
    success: "bg-success-50 ring-green-200",
    warning: "bg-warning-50 ring-amber-200",
    danger: "bg-danger-50 ring-red-200",
  }[tone];
  const label = { info: "Information", success: "Success", warning: "Warning", danger: "Error" }[tone];
  const icon = { info: "💡", success: "✅", warning: "⚠️", danger: "⛔" }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex gap-3 rounded-2xl p-4 text-sm ring-1 ${styles}`}
    >
      <span aria-hidden="true" className="text-lg leading-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="sr-only">{label}: </span>
          {title ?? label}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** Status badge: always shows text (never colour alone). */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const styles = {
    neutral: "bg-soft text-ink before:bg-muted",
    info: "bg-tile-purple/60 text-ink before:bg-violet-600",
    success: "bg-success-50 text-success before:bg-success",
    warning: "bg-warning-50 text-warning before:bg-amber-500",
    danger: "bg-danger-50 text-danger before:bg-danger",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:content-[""] ${styles}`}
    >
      {children}
    </span>
  );
}

export function statusTone(s: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["APPROVED", "SHORTLISTED", "READY", "CLEAN", "PUBLISHED"].includes(s)) return "success";
  if (["REJECTED", "FAILED", "INFECTED"].includes(s)) return "danger";
  if (["NEEDS_CLARIFICATION", "PENDING", "QUEUED", "PROCESSING"].includes(s)) return "warning";
  if (["DRAFT", "WITHDRAWN", "CLOSED", "ARCHIVED", "NOT_STARTED"].includes(s)) return "neutral";
  return "info";
}

/**
 * Confirmation dialog built on the native <dialog> element (focus trapping, Escape to close and
 * inert background are provided by the browser). The trigger opens it; the confirm button submits
 * the wrapped form content.
 */
export function ConfirmDialog({
  trigger,
  title,
  children,
  confirmLabel,
  tone = "primary",
  triggerClassName,
  disabled,
}: {
  trigger: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? (tone === "danger" ? "btn-danger" : "btn-primary")}
        onClick={() => ref.current?.showModal()}
        disabled={disabled}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-full max-w-lg rounded-3xl border-0 p-0 shadow-2xl"
      >
        <div className="p-6">
          <h2 id={titleId}>{title}</h2>
          <div className="mt-3 space-y-3 text-sm">{children}</div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button
              type="submit"
              className={tone === "danger" ? "btn-danger" : "btn-primary"}
              onClick={() => setTimeout(() => ref.current?.close(), 0)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return (
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(d)) + " IST"
  );
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(d),
  );
}
