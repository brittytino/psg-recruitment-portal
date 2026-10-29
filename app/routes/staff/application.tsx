import { useState } from "react";
import { Form, Link, useLocation, useNavigation } from "react-router";
import type { Route } from "./+types/application";
import { AnswerView } from "~/components/application-form";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { clientIp, handleAction, readForm, requireStaff } from "~/lib/http.server";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { getStaffApplication, transition, updateInternalNote } from "~/modules/applications/service.server";
import {
  APPLICATION_STATUSES,
  ASSIGNABLE,
  availableTransitions,
  HOD_STAGE,
  PROCESSING_LABELS,
  STATUS_LABELS,
  type AppStatus,
} from "~/modules/applications/workflow";
import { hasPermission, hodDepartments } from "~/modules/auth/permissions";
import { hrScope } from "~/modules/auth/policy.server";
import { audit } from "~/modules/audit/audit.server";
import { ValidationError } from "~/modules/core/errors";
import { DOCUMENT_TYPE_LABELS, type DocType } from "~/modules/documents/policy";
import { requestRegeneration } from "~/modules/documents/service.server";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { conditionMet } from "~/modules/forms/validation";
import { allowedChanges } from "~/modules/reviews/position-policy";
import {
  assignToHod,
  canApprovePositionChange,
  decidePositionChange,
  recordHodDecision,
  unassign,
} from "~/modules/reviews/service.server";
import { hodsForDepartment } from "~/modules/users/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Application — PSG Tech Recruitment" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:read");
  const app = await getStaffApplication(user, params.id);
  await audit({
    actorId: user.id,
    action: "application.viewed",
    entityType: "application",
    entityId: app.id,
    ip: clientIp(request),
  });
  const isOffice = !!hrScope(user);
  const isAssignedHod =
    app.assignedHodId === user.id &&
    !!app.vacancy.departmentId &&
    hodDepartments(user.grants).includes(app.vacancy.departmentId);
  const applied = app.appliedPosition
    ? (POSITION_LABELS[app.appliedPosition] ?? app.appliedPosition)
    : (app.vacancy.researchPositionTitle ??
      (app.vacancy.position
        ? (POSITION_LABELS[app.vacancy.position] ?? app.vacancy.position)
        : "Research Assistant"));
  const current = app.generated.filter((g) => g.revisionId === app.currentRevisionId && g.status === "READY");
  return {
    app: {
      id: app.id,
      referenceNo: app.referenceNo,
      status: app.status as AppStatus,
      recruitmentCategory: app.recruitmentCategory,
      internalNote: app.internalNote,
      processingStatus: app.processingStatus,
      submittedAt: app.submittedAt,
      applied,
      effective: app.effectivePosition,
      vacancy: {
        code: app.vacancy.code,
        title: app.vacancy.title,
        department: app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research",
        departmentId: app.vacancy.departmentId,
        specialisation: app.vacancy.researchSpecialisation?.name ?? null,
      },
      formCode: app.formTemplate.code as FormCode,
      formVersion: app.formTemplate.version,
      revision: app.currentRevision
        ? {
            no: app.currentRevision.revisionNo,
            answers: app.currentRevision.answers as Answers,
            name: app.currentRevision.candidateName,
            manifest: app.currentRevision.attachmentManifest as {
              documentId: string;
              documentType: DocType;
              originalName: string;
            }[],
          }
        : null,
      scans: Object.fromEntries(app.documents.map((d) => [d.id, d.scanStatus])),
      applicationPdf: current.find((g) => g.kind === "APPLICATION_PDF") ?? null,
      bundle:
        current.filter((g) => g.kind === "CONSOLIDATED_BUNDLE").sort((a, b) => b.version - a.version)[0] ??
        null,
      failed:
        app.generated.find((g) => g.revisionId === app.currentRevisionId && g.status === "FAILED")?.error ??
        null,
      hod: app.assignedHod ? (app.assignedHod.profile?.fullName ?? app.assignedHod.email) : null,
      hodDecision: app.hodDecision,
      hodReason: app.hodDecisionReason,
      hodRemarks: app.hodRemarks,
      hodDecidedAt: app.hodDecidedAt,
      positionChanges: app.positionChanges,
      history: app.statusHistory.map((h) => ({
        to: h.toStatus as AppStatus,
        reason: h.reason,
        at: h.createdAt,
      })),
    },
    isOffice,
    isAssignedHod,
    canDownload: hasPermission(user.grants, "document:download"),
    canRegenerate: isOffice && hasPermission(user.grants, "document:regenerate"),
    canApprove: await canApprovePositionChange(user),
    canAssign: isOffice && hasPermission(user.grants, "application:assign"),
    hods: isOffice && app.vacancy.departmentId ? await hodsForDepartment(app.vacancy.departmentId) : [],
    changeOptions: allowedChanges(applied),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "application:read");
  const form = await readForm(request, context);
  const ip = clientIp(request);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "internal-note":
        await updateInternalNote(user, params.id, form.get("note") ? String(form.get("note")) : null, ip);
        return { message: "Internal review note saved." };
      case "decision":
        await recordHodDecision(user, params.id, Object.fromEntries(form), ip);
        return { message: "Your decision has been recorded." };
      case "position":
        await decidePositionChange(
          user,
          String(form.get("requestId")),
          form.get("approve") === "yes",
          String(form.get("note") ?? ""),
          ip,
        );
        return {
          message:
            form.get("approve") === "yes" ? "Position change approved." : "Position change not approved.",
        };
      case "assign":
        await assignToHod(user, { hodId: String(form.get("hodId")), applicationIds: [params.id] }, ip);
        return { message: "Moved to the HOD." };
      case "unassign":
        await unassign(user, params.id, String(form.get("reason") ?? ""), ip);
        return { message: "Taken back from the HOD." };
      case "transition": {
        const to = String(form.get("to"));
        if (!(APPLICATION_STATUSES as readonly string[]).includes(to))
          throw new ValidationError("Unknown status");
        await transition(user, params.id, to as AppStatus, String(form.get("reason") ?? ""), ip);
        return { message: `Status changed to “${STATUS_LABELS[to as AppStatus]}”.` };
      }
      case "regenerate":
        await requestRegeneration(user, params.id, ip);
        return { message: "PDF regeneration has been queued as a new version." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function StaffApplication({ loaderData, actionData }: Route.ComponentProps) {
  const {
    app,
    isOffice,
    isAssignedHod,
    canDownload,
    canRegenerate,
    canApprove,
    canAssign,
    hods,
    changeOptions,
  } = loaderData;
  const location = useLocation();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const back = (location.state as { back?: string } | null)?.back ?? (isOffice ? "/staff" : "/staff/review");
  const def = getFormDefinition(app.formCode, app.formVersion);
  const transitions = isOffice
    ? availableTransitions(app.status, "hr", app.recruitmentCategory as never)
    : [];
  const pending = app.positionChanges.find((p) => p.status === "PENDING");
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const [decision, setDecision] = useState<string>(app.hodDecision ?? "");
  const answers = app.revision?.answers ?? {};

  return (
    <div className="page-stack">
      <p className="text-sm">
        <Link to={back}>← Back</Link>
      </p>
      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{FORM_LABELS[app.formCode]}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl">{app.revision?.name}</h1>
          <p className="mt-1 font-mono text-sm font-semibold text-brand-700">{app.referenceNo}</p>
          <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-muted">Department: </dt>
              <dd className="inline font-medium">{app.vacancy.department}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Applied for: </dt>
              <dd className="inline font-medium">{POSITION_LABELS[app.applied]}</dd>
            </div>
            {app.effective && (
              <div>
                <dt className="inline text-muted">Approved position: </dt>
                <dd className="inline font-semibold text-brand-700">{POSITION_LABELS[app.effective]}</dd>
              </div>
            )}
            <div>
              <dt className="inline text-muted">Submitted: </dt>
              <dd className="inline">
                {formatDateTime(app.submittedAt)} (revision {app.revision?.no})
              </dd>
            </div>
            <div>
              <dt className="inline text-muted">HOD: </dt>
              <dd className="inline">{app.hod ?? "Not yet assigned"}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge tone={statusTone(app.status)}>{STATUS_LABELS[app.status]}</Badge>
          {canDownload && app.applicationPdf && (
            <a href={`/files/bundles/${app.applicationPdf.id}`} className="btn-secondary">
              Download application ({app.applicationPdf.pageCount} pages)
            </a>
          )}
          {canDownload && app.bundle && (
            <a href={`/files/bundles/${app.bundle.id}`} className="btn-primary">
              Download application + documents ({app.bundle.pageCount} pages)
            </a>
          )}
          {!app.bundle && (
            <Badge tone={statusTone(app.processingStatus)}>{PROCESSING_LABELS[app.processingStatus]}</Badge>
          )}
        </div>
      </header>

      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      {app.failed && isOffice && (
        <Alert tone="danger" title="PDF generation failed">
          {app.failed}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          {app.revision &&
            def.sections.map((s) => {
              if (s.kind === "uploads")
                return (
                  <section key={s.id} className="card" aria-labelledby={`s-${s.id}`}>
                    <h2 id={`s-${s.id}`} className="text-xl">
                      Documents submitted
                    </h2>
                    <ul className="mt-3 divide-y divide-line text-sm">
                      {app.revision!.manifest.map((m) => (
                        <li
                          key={m.documentId}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">{DOCUMENT_TYPE_LABELS[m.documentType]}</span>
                            {canDownload ? (
                              <a href={`/files/documents/${m.documentId}`} className="break-all">
                                {m.originalName}
                              </a>
                            ) : (
                              <span className="break-all">{m.originalName}</span>
                            )}
                          </span>
                          <Badge tone={statusTone(app.scans[m.documentId] ?? "PENDING")}>
                            {app.scans[m.documentId] === "CLEAN"
                              ? "Checked"
                              : (app.scans[m.documentId] ?? "—")}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              const fields = s.fields.filter((f) => conditionMet(f.when, answers));
              if (!fields.length) return null;
              return (
                <section key={s.id} className="card" aria-labelledby={`s-${s.id}`}>
                  <h2 id={`s-${s.id}`} className="text-xl">
                    {s.title}
                  </h2>
                  <dl className="mt-4 grid gap-x-6 gap-y-4 text-[15px] md:grid-cols-2">
                    {fields.map((f) => (
                      <div
                        key={f.key}
                        className={
                          f.kind === "table" || f.kind === "list" || f.kind === "textarea"
                            ? "md:col-span-2"
                            : ""
                        }
                      >
                        <dt className="text-sm font-semibold text-muted">{f.label}</dt>
                        <dd className="mt-0.5">
                          <AnswerView field={f} value={answers[f.key]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
        </div>

        <aside className="space-y-6">
          {isAssignedHod && HOD_STAGE.includes(app.status) && (
            <section className="card space-y-4 border-brand-600/30" aria-labelledby="decide">
              <div>
                <h2 id="decide" className="text-xl">
                  Your decision
                </h2>
                <p className="mt-1 text-sm text-muted">
                  The candidate applied for <strong>{POSITION_LABELS[app.applied]}</strong>. You can change
                  your decision until you approve the department summary sheet.
                </p>
              </div>
              <Form method="post" className="space-y-4">
                <CsrfInput />
                <input type="hidden" name="intent" value="decision" />
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Decision</legend>
                  {[
                    ["ACCEPT", "Accept as applied", `Consider for ${POSITION_LABELS[app.applied]}`],
                    ...(changeOptions.length
                      ? [["RECOMMEND_CHANGE", "Recommend a different position", "Needs Admin approval"]]
                      : []),
                    ["REJECT", "Reject", "Reason required"],
                  ].map(([v, l, h]) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-soft"
                    >
                      <input
                        type="radio"
                        name="decision"
                        value={v}
                        checked={decision === v}
                        onChange={() => setDecision(v!)}
                        className="mt-1 h-4 w-4"
                        required
                      />
                      <span>
                        <span className="block font-semibold">{l}</span>
                        <span className="text-sm text-muted">{h}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {decision === "RECOMMEND_CHANGE" && (
                  <div>
                    <label htmlFor="toPosition" className="block text-sm font-semibold">
                      Recommend for
                    </label>
                    <select id="toPosition" name="toPosition" required className="field-input mt-1">
                      {changeOptions.map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    {fe?.toPosition && <p className="mt-1 text-sm text-danger">{fe.toPosition[0]}</p>}
                  </div>
                )}
                {decision && decision !== "ACCEPT" && (
                  <div>
                    <label htmlFor="reason" className="block text-sm font-semibold">
                      Reason <span className="text-danger">*</span>
                    </label>
                    <textarea
                      id="reason"
                      name="reason"
                      rows={3}
                      required
                      minLength={10}
                      maxLength={3000}
                      defaultValue={app.hodReason ?? ""}
                      className="field-input mt-1"
                      aria-invalid={!!fe?.reason}
                    />
                    {fe?.reason && <p className="mt-1 text-sm text-danger">{fe.reason[0]}</p>}
                  </div>
                )}
                <div>
                  <label htmlFor="remarks" className="block text-sm font-semibold">
                    Remarks <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="remarks"
                    name="remarks"
                    rows={2}
                    maxLength={3000}
                    defaultValue={app.hodRemarks ?? ""}
                    className="field-input mt-1"
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={!decision || busy}>
                  {app.hodDecision ? "Update decision" : "Record decision"}
                </button>
              </Form>
            </section>
          )}

          {(app.hodDecision || app.positionChanges.length > 0) && (
            <section className="card space-y-3" aria-labelledby="hod-out">
              <h2 id="hod-out" className="text-xl">
                HOD review
              </h2>
              {app.hodDecision && (
                <p className="text-sm">
                  <span className="font-semibold">
                    {app.hodDecision === "ACCEPT"
                      ? "Accepted as applied"
                      : app.hodDecision === "REJECT"
                        ? "Rejected"
                        : "Position change recommended"}
                  </span>{" "}
                  · {formatDateTime(app.hodDecidedAt)}
                  {app.hodReason && (
                    <span className="mt-1 block whitespace-pre-line text-muted">{app.hodReason}</span>
                  )}
                  {app.hodRemarks && (
                    <span className="mt-1 block whitespace-pre-line text-muted">
                      Remarks: {app.hodRemarks}
                    </span>
                  )}
                </p>
              )}
              {pending && (
                <div className="space-y-3 rounded-2xl bg-warning-50 p-4 text-sm ring-1 ring-amber-200">
                  <p>
                    <strong>Recommendation awaiting approval:</strong> {POSITION_LABELS[pending.fromPosition]}{" "}
                    → <strong>{POSITION_LABELS[pending.toPosition]}</strong>
                  </p>
                  <p className="whitespace-pre-line text-muted">{pending.reason}</p>
                  {canApprove ? (
                    <Form method="post" className="space-y-2">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="position" />
                      <input type="hidden" name="requestId" value={pending.id} />
                      <label htmlFor="note" className="block font-semibold">
                        Note <span className="font-normal text-muted">(required if not approving)</span>
                      </label>
                      <textarea id="note" name="note" rows={2} maxLength={2000} className="field-input" />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          name="approve"
                          value="yes"
                          className="btn-primary flex-1"
                          disabled={busy}
                        >
                          Approve change
                        </button>
                        <button
                          type="submit"
                          name="approve"
                          value="no"
                          className="btn-secondary flex-1"
                          disabled={busy}
                        >
                          Do not approve
                        </button>
                      </div>
                      <p className="text-xs text-muted">
                        The candidate’s submitted application is not changed.
                      </p>
                    </Form>
                  ) : (
                    <p className="text-xs text-muted">Waiting for the Admin (Dean / Principal) to approve.</p>
                  )}
                </div>
              )}
              {app.positionChanges.filter((p) => p.status !== "PENDING").length > 0 && (
                <ul className="space-y-1 text-sm text-muted">
                  {app.positionChanges
                    .filter((p) => p.status !== "PENDING")
                    .map((p) => (
                      <li key={p.id}>
                        {POSITION_LABELS[p.fromPosition]} → {POSITION_LABELS[p.toPosition]}:{" "}
                        <span className="font-medium text-ink">
                          {p.status === "APPROVED" ? "approved" : "not approved"}
                        </span>{" "}
                        {formatDateTime(p.decidedAt)}
                        {p.decisionNote ? ` — ${p.decisionNote}` : ""}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}

          {canAssign &&
            app.recruitmentCategory !== "RESEARCH" &&
            (ASSIGNABLE.includes(app.status) || app.status === "ASSIGNED_TO_HOD") && (
              <section className="card space-y-3" aria-labelledby="assign">
                <h2 id="assign" className="text-xl">
                  HOD assignment
                </h2>
                {ASSIGNABLE.includes(app.status) && (
                  <Form method="post" className="space-y-2">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="assign" />
                    <label htmlFor="hodId" className="block text-sm font-semibold">
                      {app.hod ? "Move to another HOD" : `Move to a HOD of ${app.vacancy.department}`}
                    </label>
                    <select id="hodId" name="hodId" required className="field-input">
                      <option value="">Choose…</option>
                      {hods.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.profile?.fullName ?? h.email}
                        </option>
                      ))}
                    </select>
                    {!hods.length && (
                      <p className="text-sm text-warning">No HOD is set up for this department.</p>
                    )}
                    <button type="submit" className="btn-secondary w-full" disabled={busy || !hods.length}>
                      Move to HOD
                    </button>
                  </Form>
                )}
                {app.status === "ASSIGNED_TO_HOD" && (
                  <Form method="post" className="space-y-2 border-t border-line pt-3">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="unassign" />
                    <label htmlFor="ureason" className="block text-sm font-semibold">
                      Take back from the HOD — reason
                    </label>
                    <input id="ureason" name="reason" required minLength={5} className="field-input" />
                    <button type="submit" className="btn-secondary w-full" disabled={busy}>
                      Take back
                    </button>
                  </Form>
                )}
              </section>
            )}

          {isOffice && (
            <section className="card space-y-3" aria-labelledby="internal-note">
              <div className="flex items-center justify-between">
                <h2 id="internal-note" className="text-xl">
                  Internal review note
                </h2>
                <Badge tone="neutral">HR / Office</Badge>
              </div>
              <p className="text-xs text-muted">
                Confidential remarks, committee observations, or screening notes. Never visible to candidates.
              </p>
              <Form method="post" className="space-y-3">
                <CsrfInput />
                <input type="hidden" name="intent" value="internal-note" />
                <textarea
                  name="note"
                  defaultValue={app.internalNote ?? ""}
                  rows={3}
                  placeholder="Enter confidential notes, eligibility remarks, interview recommendations..."
                  className="field-input w-full"
                />
                <button type="submit" className="btn-secondary text-sm font-semibold" disabled={busy}>
                  Save internal note
                </button>
              </Form>
            </section>
          )}

          {transitions.length > 0 && (
            <section className="card space-y-3" aria-labelledby="status">
              <h2 id="status" className="text-xl">
                Status
              </h2>
              {transitions.map((t) => (
                <Form key={t.to} method="post" className="space-y-2 rounded-2xl bg-soft p-3">
                  <CsrfInput />
                  <input type="hidden" name="intent" value="transition" />
                  <input type="hidden" name="to" value={t.to} />
                  <label htmlFor={`r-${t.to}`} className="block text-sm font-semibold">
                    {t.label} — reason {t.reasonRequired ? "(required)" : "(optional)"}
                  </label>
                  <textarea
                    id={`r-${t.to}`}
                    name="reason"
                    rows={2}
                    maxLength={2000}
                    required={t.reasonRequired}
                    className="field-input"
                  />
                  <ConfirmDialog
                    trigger={t.label}
                    triggerClassName={t.to === "REJECTED" ? "btn-danger w-full" : "btn-secondary w-full"}
                    tone={t.to === "REJECTED" ? "danger" : "primary"}
                    title={`${t.label}?`}
                    confirmLabel="Confirm"
                    disabled={busy}
                  >
                    <p>
                      The status changes from “{STATUS_LABELS[app.status]}” to “{STATUS_LABELS[t.to]}”. This
                      is recorded in the history and audit log.
                    </p>
                  </ConfirmDialog>
                </Form>
              ))}
            </section>
          )}

          {canRegenerate && (
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="regenerate" />
              <ConfirmDialog
                trigger="Regenerate PDF (new version)"
                triggerClassName="btn-secondary w-full"
                title="Regenerate the PDF?"
                confirmLabel="Queue regeneration"
              >
                <p>A new version is generated from the same submitted revision. Earlier versions are kept.</p>
              </ConfirmDialog>
            </Form>
          )}

          <section className="card" aria-labelledby="history">
            <h2 id="history" className="text-xl">
              History
            </h2>
            <ol className="mt-3 space-y-3 border-l-2 border-line pl-4 text-sm">
              {app.history.map((h, i) => (
                <li key={i}>
                  <span className="font-semibold">{STATUS_LABELS[h.to]}</span>
                  <span className="block text-muted">{formatDateTime(h.at)}</span>
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
