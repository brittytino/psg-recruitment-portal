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
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { FORM_LABELS } from "~/lib/labels";
import { getOwnApplication, saveDraft } from "~/modules/applications/service.server";
import { EDITABLE, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { ValidationError } from "~/modules/core/errors";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { ageOn, validateAnswers, type FieldIssue } from "~/modules/forms/validation";

export const meta: Route.MetaFunction = () => [{ title: "Application form — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  if (!EDITABLE.includes(app.status as AppStatus)) throw redirect(`/applications/${app.id}/receipt`);
  const clarification =
    app.status === "NEEDS_CLARIFICATION"
      ? [...app.statusHistory].reverse().find((h) => h.toStatus === "NEEDS_CLARIFICATION")?.reason
      : null;
  return {
    id: app.id,
    status: app.status,
    formCode: app.formTemplate.code as FormCode,
    formVersion: app.formTemplate.version,
    vacancy: {
      title: app.vacancy.title,
      code: app.vacancy.code,
      department: app.vacancy.department.name,
      closesAt: app.vacancy.closesAt,
    },
    answers: app.draftAnswers as Answers,
    version: app.draftVersion,
    lastSavedAt: app.lastSavedAt,
    hasPhoto: app.documents.some((d) => d.documentType === "PHOTOGRAPH"),
    clarification,
  };
}

/** Section changes are client-side only; keep unsaved edits by not reloading the draft. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) return false;
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

export default function ApplicationEditor({ loaderData }: Route.ComponentProps) {
  const L = loaderData;
  const def = useMemo(() => getFormDefinition(L.formCode, L.formVersion), [L.formCode, L.formVersion]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const csrf = useCsrf();
  const fetcher = useFetcher<SaveResponse>();
  const sectionIndex = Math.max(
    0,
    def.sections.findIndex((s) => s.id === params.get("section")),
  );
  const section = def.sections[sectionIndex]!;

  const [answers, setAnswers] = useState<Answers>(L.answers);
  const [version, setVersion] = useState(L.version);
  const [savedAt, setSavedAt] = useState<string | null>(
    L.lastSavedAt ? new Date(L.lastSavedAt).toISOString() : null,
  );
  const [dirty, setDirty] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<FieldIssue[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const afterSave = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const derived = useMemo(
    () => ({
      department: L.vacancy.department,
      age:
        typeof answers.dateOfBirth === "string"
          ? ageOn(answers.dateOfBirth, new Date().toISOString().slice(0, 10))
          : null,
    }),
    [answers.dateOfBirth, L.vacancy.department],
  );
  const allIssues = useMemo(() => validateAnswers(def, answers, "submit"), [def, answers]);
  const sectionIssues = showIssues
    ? [...serverIssues, ...allIssues].filter((i) => i.sectionId === section.id)
    : serverIssues.filter((i) => i.sectionId === section.id);

  const save = (thenGo?: string) => {
    afterSave.current = thenGo ?? null;
    fetcher.submit(
      { _csrf: csrf, version: String(version), answers: JSON.stringify(answers) },
      { method: "post" },
    );
  };

  // Handle save responses.
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

  // Autosave 20 seconds after the last change.
  useEffect(() => {
    if (!dirty || conflict) return;
    const t = setTimeout(() => save(), 20_000);
    return () => clearTimeout(t);
  }, [answers, dirty, conflict]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Block in-app navigation away from the editor with unsaved changes.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const onChange = (key: string, value: Answers[string]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty(true);
  };

  const sectionUrl = (i: number) => `?section=${def.sections[i]!.id}`;
  const saving = fetcher.state !== "idle";
  const issueCount = (id: string) => allIssues.filter((i) => i.sectionId === id).length;
  const complete = def.sections.filter((s) => issueCount(s.id) === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{FORM_LABELS[L.formCode]}</p>
          <h1>{L.vacancy.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {L.vacancy.department} · Closes {formatDateTime(L.vacancy.closesAt)}
          </p>
        </div>
        <Badge tone={statusTone(L.status)}>{STATUS_LABELS[L.status as AppStatus]}</Badge>
      </div>

      {L.clarification && (
        <Alert tone="warning" title="Clarification requested by the recruitment office">
          <p className="whitespace-pre-line">{L.clarification}</p>
          <p className="mt-1">Update your application and submit it again from the review page.</p>
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

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Application sections" className="card h-fit p-3">
          <p className="px-2 text-sm font-semibold" id="progress-label">
            Progress: {complete} of {def.sections.length} sections complete
          </p>
          <progress
            className="mx-2 mt-2 h-2 w-[calc(100%-1rem)]"
            max={def.sections.length}
            value={complete}
            aria-labelledby="progress-label"
          />
          <ol className="mt-3 space-y-1">
            {def.sections.map((s, i) => {
              const n = issueCount(s.id);
              return (
                <li key={s.id}>
                  <Link
                    to={sectionUrl(i)}
                    aria-current={i === sectionIndex ? "step" : undefined}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm no-underline text-ink hover:bg-brand-50 aria-[current=step]:bg-brand-50 aria-[current=step]:font-semibold"
                  >
                    <span>
                      {i + 1}. {s.title}
                    </span>
                    <span className={`text-xs ${n ? "text-warning" : "text-success"}`}>
                      {n ? `${n} to do` : "Complete"}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to={`/applications/${L.id}/documents`}
                className="block rounded px-2 py-1.5 text-sm no-underline text-ink hover:bg-brand-50"
              >
                Documents and photograph{" "}
                <span className={`text-xs ${L.hasPhoto ? "text-success" : "text-warning"}`}>
                  {L.hasPhoto ? "Photo uploaded" : "Photo needed"}
                </span>
              </Link>
            </li>
            <li>
              <Link
                to={`/applications/${L.id}/review`}
                className="block rounded px-2 py-1.5 text-sm font-medium no-underline hover:bg-brand-50"
              >
                Review and submit
              </Link>
            </li>
          </ol>
        </nav>

        <section aria-labelledby="section-title" className="card space-y-5">
          <div>
            <p className="text-sm text-muted">
              Section {sectionIndex + 1} of {def.sections.length}
              {section.sourceHeading ? ` · Official heading: “${section.sourceHeading}”` : ""} · Page
              {section.pages.length > 1 ? "s" : ""} {section.pages.join(", ")}
            </p>
            <h2 id="section-title" className="text-xl">
              {section.title}
            </h2>
            {section.description && <p className="mt-1 text-sm text-muted">{section.description}</p>}
          </div>
          <ErrorSummary
            title="Please check this section"
            messages={sectionIssues.map((i) => ({
              text: i.message,
              href: `#q-${i.path.replace(/\./g, "-")}`,
            }))}
          />
          <SectionFields
            section={section}
            answers={answers}
            derived={derived}
            issues={sectionIssues}
            onChange={onChange}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted" role="status" aria-live="polite">
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : savedAt
                    ? `All changes saved · last saved ${formatDateTime(savedAt)}`
                    : "Not saved yet"}
            </p>
            <div className="flex flex-wrap gap-2">
              {sectionIndex > 0 && (
                <Link to={sectionUrl(sectionIndex - 1)} className="btn-secondary">
                  Previous section
                </Link>
              )}
              <button type="button" className="btn-secondary" onClick={() => setShowIssues(true)}>
                Check this section
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving || !!conflict}
                onClick={() => save()}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !!conflict}
                onClick={() =>
                  save(
                    sectionIndex < def.sections.length - 1
                      ? `/applications/${L.id}${sectionUrl(sectionIndex + 1)}`
                      : `/applications/${L.id}/documents`,
                  )
                }
              >
                Save and continue
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
