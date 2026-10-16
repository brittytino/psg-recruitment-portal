import { Form, Link, useLocation, useNavigation } from "react-router";
import type { Route } from "./+types/application";
import { AnswerView } from "~/components/application-form";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { FORM_LABELS, POSITION_LABELS, RECOMMENDATION_LABELS } from "~/lib/labels";
import { getStaffApplication, transition } from "~/modules/applications/service.server";
import { APPLICATION_STATUSES, availableTransitions, PROCESSING_LABELS, STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { hasPermission } from "~/modules/auth/permissions";
import { hrScope } from "~/modules/auth/policy.server";
import { audit } from "~/modules/audit/audit.server";
import { ValidationError } from "~/modules/core/errors";
import { DOCUMENT_TYPE_LABELS, type DocType } from "~/modules/documents/policy";
import { requestRegeneration } from "~/modules/documents/service.server";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { assignReviewer, eligibleReviewers, recordReview } from "~/modules/reviews/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Application — Recruitment workspace" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:read");
  const app = await getStaffApplication(user, params.id);
  // Privileged access to a candidate record is audited.
  await audit({ actorId: user.id, action: "application.viewed", entityType: "application", entityId: app.id, ip: clientIp(request) });
  const isHr = !!hrScope(user);
  const myAssignment = app.assignments.find((a) => a.reviewerId === user.id && a.stage === "DEPARTMENT");
  return {
    app: {
      id: app.id,
      referenceNo: app.referenceNo,
      status: app.status as AppStatus,
      processingStatus: app.processingStatus,
      submittedAt: app.submittedAt,
      vacancy: { code: app.vacancy.code, title: app.vacancy.title, position: app.vacancy.position, department: app.vacancy.department.name, discipline: app.vacancy.discipline?.name ?? null, cycle: app.vacancy.cycle.title },
      formCode: app.formTemplate.code as FormCode,
      formVersion: app.formTemplate.version,
      revision: app.currentRevision
        ? { id: app.currentRevision.id, no: app.currentRevision.revisionNo, createdAt: app.currentRevision.createdAt, answers: app.currentRevision.answers as Answers, sha: app.currentRevision.answersSha256, manifest: app.currentRevision.attachmentManifest as { documentId: string; documentType: DocType; originalName: string; sizeBytes: number }[] }
        : null,
      documents: app.documents.map((d) => ({ id: d.id, scan: d.scanStatus, mime: d.mimeType })),
      required: app.vacancy.requiredDocuments.map((r) => ({ type: r.documentType as DocType, label: r.label })),
      generated: app.generated.map((g) => ({ id: g.id, version: g.version, revisionId: g.revisionId, status: g.status, pages: g.pageCount, error: g.error, createdAt: g.createdAt, completedAt: g.completedAt, report: g.report as { deviations?: string[] } | null })),
      history: app.statusHistory.map((h) => ({ from: h.fromStatus, to: h.toStatus, reason: h.reason, at: h.createdAt })),
      assignments: app.assignments.map((a) => ({ id: a.id, name: a.reviewer.profile?.fullName ?? a.reviewer.email, completedAt: a.completedAt })),
      reviews: app.reviews.map((r) => ({ id: r.id, stage: r.stage, recommendation: r.recommendation, score: r.score, comments: r.comments, at: r.createdAt, by: r.reviewer.profile?.fullName ?? r.reviewer.email })),
    },
    isHr,
    canDownload: hasPermission(user.grants, "document:download"),
    canRegenerate: isHr && hasPermission(user.grants, "document:regenerate"),
    canReviewDept: !!myAssignment && app.status === "UNDER_DEPARTMENT_REVIEW",
    canReviewHr: isHr && app.status === "UNDER_HR_REVIEW",
    reviewers: isHr ? await eligibleReviewers(app.vacancy.departmentId) : [],
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "application:read");
  const form = await readForm(request, context);
  const ip = clientIp(request);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "transition": {
        const to = String(form.get("to"));
        if (!(APPLICATION_STATUSES as readonly string[]).includes(to)) throw new ValidationError("Unknown status");
        await transition(user, params.id, to as AppStatus, String(form.get("reason") ?? ""), ip);
        return { message: `Status changed to “${STATUS_LABELS[to as AppStatus]}”.` };
      }
      case "assign":
        await assignReviewer(user, params.id, String(form.get("reviewerId")), ip);
        return { message: "Reviewer assigned." };
      case "review":
        await recordReview(user, params.id, Object.fromEntries(form), ip);
        return { message: "Review recorded." };
      case "regenerate":
        await requestRegeneration(user, params.id, ip);
        return { message: "PDF regeneration has been queued as a new version." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function StaffApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app, isHr, canDownload, canRegenerate, canReviewDept, canReviewHr, reviewers } = loaderData;
  const location = useLocation();
  const nav = useNavigation();
  const back = (location.state as { back?: string } | null)?.back ?? "/staff";
  const def = getFormDefinition(app.formCode, app.formVersion);
  const transitions = isHr ? availableTransitions(app.status, "hr") : [];
  const docScan = new Map(app.documents.map((d) => [d.id, d.scan]));
  const currentBundles = app.generated.filter((g) => g.revisionId === app.revision?.id);
  const latestReady = currentBundles.find((g) => g.status === "READY");
  const busy = nav.state !== "idle";
  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link to={back}>← Back to the application list</Link>
      </p>
      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{FORM_LABELS[app.formCode]}</p>
          <h1>
            {app.referenceNo} — {String(app.revision?.answers.name ?? "").toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {app.vacancy.code} · {POSITION_LABELS[app.vacancy.position]} · {app.vacancy.department}
            {app.vacancy.discipline ? ` · ${app.vacancy.discipline}` : ""} · {app.vacancy.cycle}
          </p>
          <p className="mt-1 text-sm text-muted">
            Submitted {formatDateTime(app.submittedAt)} · Revision {app.revision?.no}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={statusTone(app.status)}>{STATUS_LABELS[app.status]}</Badge>
          <Badge tone={statusTone(app.processingStatus)}>{PROCESSING_LABELS[app.processingStatus]}</Badge>
          {latestReady && canDownload && (
            <a href={`/files/bundles/${latestReady.id}`} className="btn-primary">
              Download consolidated PDF ({latestReady.pages} pages)
            </a>
          )}
        </div>
      </header>

      {actionData && "message" in actionData && actionData.message && <Alert tone="success">{actionData.message}</Alert>}
      {actionData && "formError" in actionData && actionData.formError && <Alert tone="danger">{actionData.formError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card" aria-labelledby="att">
            <h2 id="att">Attachment checklist</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[{ type: "PHOTOGRAPH" as DocType, label: DOCUMENT_TYPE_LABELS.PHOTOGRAPH }, ...app.required].map((r) => {
                const have = app.revision?.manifest.filter((m) => m.documentType === r.type) ?? [];
                return (
                  <li key={r.type} className="flex justify-between gap-2">
                    <span>{r.label}</span>
                    {have.length ? <Badge tone="success">Provided ({have.length})</Badge> : <Badge tone="danger">Missing</Badge>}
                  </li>
                );
              })}
            </ul>
            <table className="table mt-4">
              <caption className="sr-only">Submitted attachments</caption>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Type</th>
                  <th scope="col">Scan</th>
                </tr>
              </thead>
              <tbody>
                {app.revision?.manifest.map((m) => (
                  <tr key={m.documentId}>
                    <td>{canDownload ? <a href={`/files/documents/${m.documentId}`}>{m.originalName}</a> : m.originalName}</td>
                    <td>{DOCUMENT_TYPE_LABELS[m.documentType]}</td>
                    <td>
                      <Badge tone={statusTone(docScan.get(m.documentId) ?? "PENDING")}>{docScan.get(m.documentId) ?? "—"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card" aria-labelledby="pdfs">
            <h2 id="pdfs">Consolidated PDF versions</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {currentBundles.map((g) => (
                <li key={g.id} className="rounded border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Version {g.version} · requested {formatDateTime(g.createdAt)}
                    </span>
                    <Badge tone={statusTone(g.status)}>{PROCESSING_LABELS[g.status]}</Badge>
                  </div>
                  {g.status === "READY" && canDownload && (
                    <p className="mt-1">
                      <a href={`/files/bundles/${g.id}`}>Download version {g.version}</a> ({g.pages} pages)
                    </p>
                  )}
                  {g.error && (
                    <p className="mt-1 text-danger">
                      <span className="font-semibold">Error:</span> {g.error}
                    </p>
                  )}
                  {g.report?.deviations && g.report.deviations.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">Layout continuation notes ({g.report.deviations.length})</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {g.report.deviations.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {canRegenerate && (
              <Form method="post" className="mt-3">
                <CsrfInput />
                <input type="hidden" name="intent" value="regenerate" />
                <ConfirmDialog trigger="Regenerate PDF (new version)" triggerClassName="btn-secondary" title="Regenerate the consolidated PDF?" confirmLabel="Queue regeneration">
                  <p>A new version is generated from the same submitted revision. Earlier versions are kept unchanged.</p>
                </ConfirmDialog>
              </Form>
            )}
          </section>

          {app.revision &&
            def.sections.map((s) => (
              <section key={s.id} className="card" aria-labelledby={`s-${s.id}`}>
                <h2 id={`s-${s.id}`}>{s.title}</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  {s.fields.map((f) => (
                    <div key={f.key} className={f.kind === "table" || f.kind === "list" ? "" : "grid gap-1 sm:grid-cols-[14rem_1fr]"}>
                      <dt className="font-medium">{f.label}</dt>
                      <dd>
                        <AnswerView field={f} value={app.revision!.answers[f.key]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
        </div>

        <aside className="space-y-6">
          {transitions.length > 0 && (
            <section className="card" aria-labelledby="decide">
              <h2 id="decide">Status decision</h2>
              <div className="mt-3 space-y-4">
                {transitions.map((t) => (
                  <Form key={t.to} method="post" className="space-y-2 rounded border border-line p-3">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="transition" />
                    <input type="hidden" name="to" value={t.to} />
                    <label htmlFor={`reason-${t.to}`} className="block text-sm font-medium">
                      {t.label}: reason {t.reasonRequired ? "(required)" : "(optional)"}
                    </label>
                    <textarea id={`reason-${t.to}`} name="reason" rows={2} maxLength={2000} required={t.reasonRequired} className="field-input" />
                    <ConfirmDialog trigger={t.label} triggerClassName={t.to === "REJECTED" ? "btn-danger w-full" : "btn-secondary w-full"} tone={t.to === "REJECTED" ? "danger" : "primary"} title={`${t.label}?`} confirmLabel="Confirm" disabled={busy}>
                      <p>
                        The status will change from “{STATUS_LABELS[app.status]}” to “{STATUS_LABELS[t.to]}”. This is recorded in the status history and audit log
                        {["NEEDS_CLARIFICATION", "SHORTLISTED", "REJECTED", "APPROVED"].includes(t.to) ? " and the candidate is notified" : ""}.
                      </p>
                    </ConfirmDialog>
                  </Form>
                ))}
              </div>
            </section>
          )}

          {isHr && (
            <section className="card" aria-labelledby="assign">
              <h2 id="assign">Department reviewers</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {app.assignments.length === 0 && <li className="text-muted">No reviewers assigned.</li>}
                {app.assignments.map((a) => (
                  <li key={a.id}>
                    {a.name} — {a.completedAt ? `reviewed ${formatDateTime(a.completedAt)}` : "review pending"}
                  </li>
                ))}
              </ul>
              {(app.status === "UNDER_HR_REVIEW" || app.status === "UNDER_DEPARTMENT_REVIEW") && (
                <Form method="post" className="mt-3 space-y-2">
                  <CsrfInput />
                  <input type="hidden" name="intent" value="assign" />
                  <label htmlFor="reviewerId" className="block text-sm font-medium">
                    Assign a reviewer
                  </label>
                  <select id="reviewerId" name="reviewerId" required className="field-input">
                    <option value="">Select…</option>
                    {reviewers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.profile?.fullName ?? r.email}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary w-full" disabled={busy}>
                    Assign
                  </button>
                </Form>
              )}
            </section>
          )}

          <section className="card" aria-labelledby="reviews">
            <h2 id="reviews">Reviews</h2>
            <ul className="mt-2 space-y-3 text-sm">
              {app.reviews.length === 0 && <li className="text-muted">No reviews recorded.</li>}
              {app.reviews.map((r) => (
                <li key={r.id} className="rounded border border-line p-2">
                  <p className="font-medium">
                    {RECOMMENDATION_LABELS[r.recommendation]}
                    {r.score != null ? ` · score ${r.score}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {r.stage === "HR" ? "HR screening" : "Department review"} · {r.by} · {formatDateTime(r.at)}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{r.comments}</p>
                </li>
              ))}
            </ul>
            {(canReviewDept || canReviewHr) && (
              <Form method="post" className="mt-4 space-y-2">
                <CsrfInput />
                <input type="hidden" name="intent" value="review" />
                <label htmlFor="recommendation" className="block text-sm font-medium">
                  Recommendation
                </label>
                <select id="recommendation" name="recommendation" required className="field-input">
                  {Object.entries(RECOMMENDATION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <label htmlFor="score" className="block text-sm font-medium">
                  Score (0–100, optional)
                </label>
                <input id="score" name="score" type="number" min={0} max={100} className="field-input" />
                <label htmlFor="comments" className="block text-sm font-medium">
                  Assessment and comments
                </label>
                <textarea id="comments" name="comments" rows={4} required minLength={10} maxLength={5000} className="field-input" />
                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  Record {canReviewDept ? "department review" : "screening note"}
                </button>
              </Form>
            )}
          </section>

          <section className="card" aria-labelledby="history">
            <h2 id="history">Status history</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {app.history.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{STATUS_LABELS[h.to as AppStatus]}</span> · {formatDateTime(h.at)}
                  {h.reason && <span className="block whitespace-pre-line text-muted">{h.reason}</span>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
