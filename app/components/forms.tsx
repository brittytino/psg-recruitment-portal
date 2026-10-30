import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, XCircle } from "lucide-react";

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
      className="rounded-lg border border-danger/30 bg-danger-50 p-5"
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
    info: "bg-info-50 border-info/25 text-ink [--alert-icon:var(--color-info)]",
    success: "bg-success-50 border-success/25 text-ink [--alert-icon:var(--color-success)]",
    warning: "bg-warning-50 border-warning/25 text-ink [--alert-icon:var(--color-warning)]",
    danger: "bg-danger-50 border-danger/25 text-ink [--alert-icon:var(--color-danger)]",
  }[tone];
  const label = { info: "Information", success: "Success", warning: "Warning", danger: "Error" }[tone];
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex gap-3 rounded-lg border p-4 text-sm ${styles}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--alert-icon)]" />
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
    info: "bg-info-50 text-info before:bg-info",
    success: "bg-success-50 text-success before:bg-success",
    warning: "bg-warning-50 text-warning before:bg-amber-500",
    danger: "bg-danger-50 text-danger before:bg-danger",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:content-[""] ${styles}`}
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
  confirmName,
  confirmValue,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  triggerClassName?: string;
  disabled?: boolean;
  /** Sent with the form when confirmed (for forms with several submit choices). */
  confirmName?: string;
  confirmValue?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const danger = tone === "danger";
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? (danger ? "btn-danger" : "btn-primary")}
        onClick={() => {
          // Ask only once the form is complete: the browser shows what is missing first.
          const form = triggerRef.current?.closest("form");
          if (form && !form.reportValidity()) return;
          ref.current?.showModal();
        }}
        disabled={disabled}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="confirm-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-paper p-0 shadow-2xl backdrop:bg-navy-900/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-6">
          <div className="flex gap-4">
            <span
              aria-hidden="true"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${danger ? "bg-danger-50 text-danger" : "bg-brand-50 text-brand-700"}`}
            >
              {danger ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
                {title}
              </h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button
              type="submit"
              name={confirmName}
              value={confirmValue}
              className={danger ? "btn-danger" : "btn-primary"}
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
