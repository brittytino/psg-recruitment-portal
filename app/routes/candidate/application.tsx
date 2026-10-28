import { useEffect, useMemo, useRef, useState } from "react";
import {
  data,
  Link,
  redirect,
  useBlocker,
  useFetcher,
  useNavigate,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import type { Route } from "./+types/application";
import { SectionFields } from "~/components/application-form";
import { Alert, Badge, ErrorSummary, formatDateTime, statusTone, useCsrf } from "~/components/forms";
import { UploadsPanel, type UploadedDoc } from "~/components/uploads-panel";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { getOwnApplication, saveDraft } from "~/modules/applications/service.server";
import { EDITABLE, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import type { DocType } from "~/modules/documents/policy";
import { getFormDefinition, isDocxForm } from "~/modules/forms/registry";
import type { Answers, FormCode, SectionDef } from "~/modules/forms/types";
import {
  computeDerived,
  experienceOverlaps,
  uploadRequired,
  validateAnswers,
  type FieldIssue,
} from "~/modules/forms/validation";

export const meta: Route.MetaFunction = () => [{ title: "Application form — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  if (!EDITABLE.includes(app.status as AppStatus)) throw redirect(`/applications/${app.id}/receipt`);
  const clarification =
    app.status === "NEEDS_CLARIFICATION"
      ? [...app.statusHistory].reverse().find((h) => h.toStatus === "NEEDS_CLARIFICATION")?.reason
      : null;
  const position = app.appliedPosition
    ? (POSITION_LABELS[app.appliedPosition] ?? app.appliedPosition)
    : (app.vacancy.researchPositionTitle ??
      (app.vacancy.position
        ? (POSITION_LABELS[app.vacancy.position] ?? app.vacancy.position)
        : "Research Assistant"));
  const department = app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research";
  return {
    id: app.id,
    status: app.status,
    formCode: app.formTemplate.code as FormCode,
    formVersion: app.formTemplate.version,
    vacancy: {
      title: app.vacancy.title,
      code: app.vacancy.code,
      department,
      position,
      closesAt: app.vacancy.closesAt,
    },

    answers: app.draftAnswers as Answers,
    version: app.draftVersion,
    lastSavedAt: app.lastSavedAt,
    documents: app.documents.map((d): UploadedDoc => ({
      id: d.id,
      type: d.documentType as DocType,
      name: d.originalName,
      size: d.sizeBytes,
      scan: d.scanStatus,
    })),
    clarification,
    maxMb: env().MAX_UPLOAD_MB,
  };
}

/** Step changes are client-side only; keep unsaved edits by not reloading the draft. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search)
    return false;
  return defaultShouldRevalidate;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    let answers: unknown;
    try {
      answers = JSON.parse(String(form.get("answers") ?? "{}"));
    } catch {
      throw new ValidationError("The form data could not be read");
    }
    const r = await saveDraft(user, params.id, answers, Number(form.get("version")));
    return data({ ok: true as const, version: r.version, savedAt: r.savedAt.toISOString() });
  });
}

type SaveResponse =
  { ok: true; version: number; savedAt: string } | { formError?: string; details?: unknown; ok?: undefined };

type StepState = "complete" | "errors" | "todo";

const AUTOSAVE_MS = 30_000;

export default function ApplicationEditor({ loaderData }: Route.ComponentProps) {
  const L = loaderData;
  const def = useMemo(() => getFormDefinition(L.formCode, L.formVersion), [L.formCode, L.formVersion]);
  const v2 = !isDocxForm(def);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const csrf = useCsrf();
  const fetcher = useFetcher<SaveResponse>();
  const sections = def.sections;
  const stepIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === params.get("section")),
  );
  const section = sections[stepIndex]!;

  const [answers, setAnswers] = useState<Answers>(L.answers);
  const [version, setVersion] = useState(L.version);
  const [savedAt, setSavedAt] = useState<string | null>(
    L.lastSavedAt ? new Date(L.lastSavedAt).toISOString() : null,
  );
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [serverIssues, setServerIssues] = useState<FieldIssue[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const afterSave = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const today = new Date().toISOString().slice(0, 10);
  const derived = useMemo(
    () =>
      computeDerived(def, answers, {
        department: L.vacancy.department,
        position: L.vacancy.position,
        specialisation: L.vacancy.department,
        asOf: today,
      }),

    [def, answers, L.vacancy.department, L.vacancy.position, today],
  );
  const allIssues = useMemo(() => validateAnswers(def, answers, "submit"), [def, answers]);
  const missingUploads = (def.uploads ?? []).filter(
    (g) => uploadRequired(g, answers) && !L.documents.some((d) => g.types.includes(d.type)),
  );
  const issueCount = (s: SectionDef) =>
    s.kind === "uploads" ? missingUploads.length : allIssues.filter((i) => i.sectionId === s.id).length;
  const touched = (s: SectionDef) =>
    s.kind === "uploads"
      ? L.documents.length > 0
      : s.fields.some((f) => {
          const v = answers[f.key];
          return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
        });
  const stepState = (s: SectionDef): StepState =>
    issueCount(s) === 0 && (touched(s) || s.fields.every((f) => f.requirement !== "required"))
      ? "complete"
      : checked.has(s.id) && issueCount(s) > 0
        ? "errors"
        : "todo";
  const showErrors = checked.has(section.id);
  const sectionIssues = [
    ...serverIssues.filter((i) => i.sectionId === section.id),
    ...(showErrors ? allIssues.filter((i) => i.sectionId === section.id) : []),
  ];
  const overlaps = section.id === "experience" && v2 ? experienceOverlaps(answers, today) : [];

  const save = (thenGo?: string) => {
    afterSave.current = thenGo ?? null;
    fetcher.submit(
      { _csrf: csrf, version: String(version), answers: JSON.stringify(answers) },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data;
    if (d.ok) {
      setVersion(d.version);
      setSavedAt(d.savedAt);
      setDirty(false);
      dirtyRef.current = false;
      setServerIssues([]);
      setError(null);
      if (afterSave.current) navigate(afterSave.current);
      afterSave.current = null;
    } else {
      afterSave.current = null;
      if (Array.isArray(d.details)) setServerIssues(d.details as FieldIssue[]);
      if (d.formError?.includes("another window")) setConflict(d.formError);
      else setError(d.formError ?? "The draft could not be saved");
    }
  }, [fetcher.state, fetcher.data, navigate]);

  // Autosave 30 seconds after the last change.
  useEffect(() => {
    if (!dirty || conflict) return;
    const t = setTimeout(() => save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [answers, dirty, conflict]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const onChange = (key: string, value: Answers[string]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty(true);
  };

  const stepUrl = (i: number) => `/applications/${L.id}?section=${sections[i]!.id}`;
  const nextUrl =
    stepIndex < sections.length - 1
      ? stepUrl(stepIndex + 1)
      : v2
        ? `/applications/${L.id}/review`
        : `/applications/${L.id}/documents`;
  const goTo = (url: string) => (dirty ? save(url) : navigate(url));
  const continueStep = () => {
    setChecked((c) => new Set(c).add(section.id));
    goTo(nextUrl);
  };
  const saving = fetcher.state !== "idle";
  const complete = sections.filter((s) => stepState(s) === "complete").length;
  const pct = Math.round((complete / sections.length) * 100);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{FORM_LABELS[L.formCode]}</p>
          <h1 className="text-2xl sm:text-3xl">{L.vacancy.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {L.vacancy.department} · {L.vacancy.position} · Closes {formatDateTime(L.vacancy.closesAt)}
          </p>
        </div>
        <Badge tone={statusTone(L.status)}>{STATUS_LABELS[L.status as AppStatus]}</Badge>
      </header>

      {L.clarification && (
        <Alert tone="warning" title="Clarification requested by the recruitment office">
          <p className="whitespace-pre-line">{L.clarification}</p>
          <p className="mt-1">Update your application and submit it again from the review step.</p>
        </Alert>
      )}
      {conflict && (
        <Alert tone="danger" title="Your draft was changed elsewhere">
          <p>{conflict}</p>
          <button type="button" className="btn-secondary mt-2 py-1" onClick={() => window.location.reload()}>
            Reload the latest saved version
          </button>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {blocker.state === "blocked" && (
        <Alert tone="warning" title="You have unsaved changes">
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary py-1" onClick={() => blocker.reset?.()}>
              Stay on this page
            </button>
            <button type="button" className="btn-secondary py-1" onClick={() => blocker.proceed?.()}>
              Leave without saving
            </button>
          </div>
        </Alert>
      )}

      {/* Mobile progress */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>
            Step {stepIndex + 1} of {sections.length}
          </span>
          <span>{pct}% complete</span>
        </div>
        <progress className="mt-2 h-2 w-full" max={100} value={pct} aria-label="Application progress" />
        <details className="mt-3 rounded-2xl border border-line bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold">All steps</summary>
          <StepList
            sections={sections}
            current={stepIndex}
            state={stepState}
            issues={issueCount}
            url={stepUrl}
            reviewUrl={`/applications/${L.id}/review`}
          />
        </details>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Application steps" className="card hidden h-fit p-4 lg:sticky lg:top-24 lg:block">
          <p className="text-sm font-semibold" id="progress-label">
            {complete} of {sections.length} steps complete
          </p>
          <progress className="mt-2 h-2 w-full" max={100} value={pct} aria-labelledby="progress-label" />
          <StepList
            sections={sections}
            current={stepIndex}
            state={stepState}
            issues={issueCount}
            url={stepUrl}
            reviewUrl={`/applications/${L.id}/review`}
          />
          {!v2 && (
            <Link
              to={`/applications/${L.id}/documents`}
              className="mt-1 block rounded-lg px-2 py-2 text-sm no-underline text-ink hover:bg-soft"
            >
              Documents and photograph
            </Link>
          )}
        </nav>

        <section aria-labelledby="section-title" className="card mx-auto w-full max-w-[920px] space-y-6">
          <div className="border-b border-line pb-4">
            <p className="text-sm font-medium text-brand-700">
              Step {stepIndex + 1} of {sections.length}
            </p>
            <h2 id="section-title" className="mt-1 text-xl sm:text-2xl">
              {section.title}
            </h2>
            {section.description && <p className="mt-2 text-[15px] text-muted">{section.description}</p>}
            <p className="mt-2 text-sm text-muted">
              Fields marked <span className="font-semibold text-danger">*</span> are required.
            </p>
          </div>

          <ErrorSummary
            title={`Please check ${sectionIssues.length} item${sectionIssues.length === 1 ? "" : "s"} in this step`}
            messages={sectionIssues.map((i) => ({
              text: i.message,
              href: `#q-${i.path.replace(/\./g, "-")}`,
            }))}
          />
          {overlaps.length > 0 && (
            <Alert tone="warning" title="Overlapping periods">
              Positions {overlaps.map((i) => i + 1).join(", ")} overlap in time. Overlapping months are
              counted once in your total experience. Check the dates if this is not intended.
            </Alert>
          )}

          {section.kind === "uploads" ? (
            <UploadsPanel
              applicationId={L.id}
              groups={def.uploads ?? []}
              answers={answers}
              documents={L.documents}
              maxUploadMb={L.maxMb}
            />
          ) : (
            <SectionFields
              section={section}
              answers={answers}
              derived={derived}
              issues={sectionIssues}
              onChange={onChange}
              applicationId={L.id}
              csrf={csrf}
              maxUploadMb={L.maxMb}
            />
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted" role="status" aria-live="polite">
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes (saved automatically every 30 seconds)"
                  : savedAt
                    ? `All changes saved · ${formatDateTime(savedAt)}`
                    : "Not saved yet"}
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {stepIndex > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => goTo(stepUrl(stepIndex - 1))}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={saving || !!conflict || !dirty}
                onClick={() => save()}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !!conflict}
                onClick={continueStep}
              >
                {stepIndex < sections.length - 1 ? "Save and continue" : "Review application"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StepList({
  sections,
  current,
  state,
  issues,
  url,
  reviewUrl,
}: {
  sections: SectionDef[];
  current: number;
  state: (s: SectionDef) => StepState;
  issues: (s: SectionDef) => number;
  url: (i: number) => string;
  reviewUrl: string;
}) {
  return (
    <ol className="mt-3 space-y-0.5">
      {sections.map((s, i) => {
        const st = state(s);
        return (
          <li key={s.id}>
            <Link
              to={url(i)}
              aria-current={i === current ? "step" : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm no-underline text-ink hover:bg-soft aria-[current=step]:bg-brand-50 aria-[current=step]:font-semibold"
            >
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  st === "complete"
                    ? "bg-success text-white"
                    : st === "errors"
                      ? "bg-danger text-white"
                      : "border border-line bg-white text-muted"
                }`}
              >
                {st === "complete" ? "✓" : st === "errors" ? "!" : i + 1}
              </span>
              <span className="min-w-0 flex-1">{s.title}</span>
              <span className="sr-only">
                {st === "complete"
                  ? "complete"
                  : st === "errors"
                    ? `${issues(s)} items to fix`
                    : "not complete"}
              </span>
            </Link>
          </li>
        );
      })}
      <li>
        <Link
          to={reviewUrl}
          className="mt-1 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-semibold no-underline hover:bg-soft"
        >
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-white"
          >
            ➜
          </span>
          Review, preview and submit
        </Link>
      </li>
    </ol>
  );
}
