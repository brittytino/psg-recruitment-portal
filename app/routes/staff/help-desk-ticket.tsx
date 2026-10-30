import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/help-desk-ticket";
import { Alert, ConfirmDialog, CsrfInput, formatDateTime } from "~/components/forms";
import {
  AttachmentInput,
  AttachmentList,
  PriorityLabel,
  TicketMessage,
  TicketStatusBadge,
} from "~/components/helpdesk";
import { PageHeader } from "~/components/staff";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { cn } from "~/lib/utils";
import { isSuperAdmin } from "~/modules/auth/permissions";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { audit } from "~/modules/audit/audit.server";
import { ValidationError } from "~/modules/core/errors";
import {
  categoryLabel,
  NEEDS_SUMMARY,
  PRIORITIES,
  PRIORITY_LABEL,
  STAFF_STATUS_LABEL,
  STAFF_TRANSITIONS,
  TICKET_LIMITS,
  type Priority,
  type TicketStatus,
} from "~/modules/helpdesk/definitions";
import {
  assignTicket,
  escalateTicket,
  setTicketPriority,
  setTicketStatus,
  staffReply,
  staffTicket,
} from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.ticket.referenceNo ?? "Ticket"} — Help desk` },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "helpdesk:handle");
  const d = await staffTicket(user, params.id);
  await audit({
    actorId: user.id,
    action: "helpdesk.ticket_viewed",
    entityType: "support_ticket",
    entityId: d.ticket.id,
    ip: clientIp(request),
  });
  return { ...d, me: user.id, superAdmin: isSuperAdmin(user.grants) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "helpdesk:handle");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "reply":
        await staffReply(user, params.id, form);
        return {
          message:
            form.get("kind") === "INTERNAL"
              ? "Internal note added (staff only)."
              : form.get("kind") === "REQUEST_INFO"
                ? "Request sent. The ticket now waits for the candidate."
                : "Reply sent to the candidate.",
        };
      case "status":
        await setTicketStatus(user, params.id, {
          status: form.get("status"),
          summary: form.get("summary") ?? undefined,
        });
        return { message: "Status updated." };
      case "assign": {
        const to = String(form.get("assigneeId") ?? "");
        await assignTicket(user, params.id, to === "none" ? null : to, String(form.get("reason") ?? ""));
        return { message: "Assignment updated." };
      }
      case "take":
        await assignTicket(user, params.id, user.id, "Took the ticket");
        return { message: "The ticket is now assigned to you." };
      case "priority":
        await setTicketPriority(user, params.id, form.get("priority"));
        return { message: "Priority updated." };
      case "escalate":
        await escalateTicket(user, params.id, String(form.get("reason") ?? ""));
        return { message: "Escalated to the Super Admin." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const KINDS = [
  ["PUBLIC", "Reply to candidate", "The candidate sees this and gets a notice."],
  ["REQUEST_INFO", "Request information", "Sent to the candidate; the ticket waits for their answer."],
  ["INTERNAL", "Internal note", "Staff only. Never shown or sent to the candidate."],
] as const;

export default function StaffTicket({ loaderData: L, actionData }: Route.ComponentProps) {
  const t = L.ticket;
  const status = t.status as TicketStatus;
  const busy = useNavigation().state !== "idle";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("PUBLIC");
  const [nextStatus, setNextStatus] = useState("");
  useEffect(() => setNextStatus(""), [status]);
  const reply = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (a?.message) reply.current?.reset();
  }, [a?.message]);
  const transitions = status === "CLOSED" && !L.superAdmin ? [] : STAFF_TRANSITIONS[status];

  return (
    <div className="page-stack">
      <PageHeader
        crumbs={[["Help desk", "/staff/help-desk"], [t.referenceNo]]}
        title={t.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={status} staff /> <PriorityLabel priority={t.priority as Priority} />
            <span>· {categoryLabel(t.category)}</span>
            {t.subcategory && <span>· {t.subcategory}</span>}
            {t.escalated && <span className="font-semibold text-brand-700">· Escalated</span>}
          </span>
        }
        actions={
          !t.assigneeId || t.assigneeId !== L.me ? (
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="take" />
              <button type="submit" className="btn-secondary" disabled={busy}>
                Assign to me
              </button>
            </Form>
          ) : null
        }
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <ol className="space-y-3" aria-label="Conversation">
            {t.messages.map((m) => (
              <li key={m.id}>
                <TicketMessage
                  author={m.author.profile?.fullName?.trim() || m.author.email}
                  role={m.fromStaff ? "Staff" : "Candidate"}
                  createdAt={m.createdAt}
                  body={m.body}
                  internal={m.kind === "INTERNAL"}
                  mine={!m.fromStaff}
                >
                  <AttachmentList files={m.attachments} base="/help-desk/files" />
                </TicketMessage>
              </li>
            ))}
          </ol>

          <Form
            ref={reply}
            method="post"
            encType="multipart/form-data"
            className="card space-y-4"
            aria-labelledby="compose"
          >
            <CsrfInput />
            <input type="hidden" name="intent" value="reply" />
            <input type="hidden" name="kind" value={kind} />
            <h2 id="compose" className="text-xl">
              Respond
            </h2>
            <div role="radiogroup" aria-label="Type of message" className="grid gap-2 sm:grid-cols-3">
              {KINDS.map(([k, label, hint]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    kind === k
                      ? k === "INTERNAL"
                        ? "border-warning bg-warning-50"
                        : "border-brand-600 bg-brand-50"
                      : "border-line hover:bg-soft",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="r-body" className="sr-only">
                Message
              </label>
              <textarea
                id="r-body"
                name="body"
                required
                rows={6}
                maxLength={TICKET_LIMITS.reply.max}
                placeholder={
                  kind === "INTERNAL"
                    ? "Note for colleagues (not visible to the candidate)"
                    : "Message to the candidate"
                }
                className={cn("field-input", kind === "INTERNAL" && "border-warning bg-warning-50/40")}
              />
              {a?.fieldErrors?.body?.[0] && (
                <p className="mt-1 text-sm text-danger">{a.fieldErrors.body[0]}</p>
              )}
            </div>
            <AttachmentInput error={a?.fieldErrors?.files?.[0]} />
            <button
              type="submit"
              className={kind === "INTERNAL" ? "btn-secondary" : "btn-primary"}
              disabled={busy || (status === "CLOSED" && kind !== "INTERNAL")}
            >
              {busy
                ? "Saving…"
                : kind === "INTERNAL"
                  ? "Add internal note"
                  : kind === "REQUEST_INFO"
                    ? "Send request"
                    : "Send reply"}
            </button>
            {status === "CLOSED" && kind !== "INTERNAL" && (
              <p className="text-sm text-muted">
                The ticket is closed. Reopen it before replying to the candidate.
              </p>
            )}
          </Form>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-3 text-sm" aria-labelledby="who">
            <h2 id="who" className="text-lg">
              Candidate
            </h2>
            <p>
              <span className="font-semibold text-ink">{L.candidate.name}</span>
              <span className="block text-muted">{L.candidate.email}</span>
              {L.candidate.profile?.phone && (
                <span className="block text-muted">{L.candidate.profile.phone}</span>
              )}
            </p>
            {t.candidateUrgency && (
              <p>
                <span className="text-muted">Candidate says: </span>
                {t.candidateUrgency}
              </p>
            )}
            {t.application ? (
              <p>
                <span className="text-muted">Application: </span>
                <Link to={`/staff/applications/${t.application.id}`}>{t.application.referenceNo}</Link>
                <span className="block text-xs text-muted">
                  {t.application.vacancy.title}
                  {t.application.vacancy.department
                    ? ` · ${t.application.vacancy.department.name}`
                    : ""} · {STATUS_LABELS[t.application.status as AppStatus] ?? t.application.status}
                </span>
              </p>
            ) : (
              <p className="text-muted">No application linked.</p>
            )}
            {t.articleSlug && (
              <p>
                <span className="text-muted">Came from article: </span>
                <Link to={`/help-desk/articles/${t.articleSlug}`}>{t.articleSlug}</Link>
              </p>
            )}
            <p className="text-xs text-muted">
              Created {formatDateTime(t.createdAt)} · updated {formatDateTime(t.lastActivityAt)}
            </p>
          </section>

          <Form key={`st-${status}`} method="post" className="card space-y-3" aria-labelledby="st">
            <CsrfInput />
            <input type="hidden" name="intent" value="status" />
            <h2 id="st" className="text-lg">
              Status
            </h2>
            <label htmlFor="st-status" className="sr-only">
              New status
            </label>
            <select
              id="st-status"
              name="status"
              required
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              className="field-input"
            >
              <option value="">Change from “{STAFF_STATUS_LABEL[status]}” to…</option>
              {transitions.map((s) => (
                <option key={s} value={s}>
                  {STAFF_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            {NEEDS_SUMMARY.includes(nextStatus as TicketStatus) && (
              <div>
                <label htmlFor="st-summary" className="block text-sm font-medium">
                  Resolution summary <span className="text-danger">*</span>
                </label>
                <textarea
                  id="st-summary"
                  name="summary"
                  required
                  minLength={10}
                  rows={3}
                  placeholder="What was done. The candidate sees this."
                  className="field-input mt-1"
                />
                {a?.fieldErrors?.summary?.[0] && (
                  <p className="mt-1 text-sm text-danger">{a.fieldErrors.summary[0]}</p>
                )}
              </div>
            )}
            <ConfirmDialog
              trigger="Update status"
              triggerClassName="btn-secondary w-full"
              tone={nextStatus === "CLOSED" ? "danger" : "primary"}
              title={
                nextStatus
                  ? `Set the ticket to “${STAFF_STATUS_LABEL[nextStatus as TicketStatus]}”?`
                  : "Update status?"
              }
              confirmLabel="Update status"
              disabled={busy || !nextStatus}
            >
              <p>
                {nextStatus === "RESOLVED"
                  ? "The candidate is notified with your summary and can reply to reopen it."
                  : nextStatus === "CLOSED"
                    ? "The candidate can no longer reply on this ticket."
                    : "The change is recorded in the ticket history."}
              </p>
            </ConfirmDialog>
            {status === "CLOSED" && !L.superAdmin && (
              <p className="text-xs text-muted">Only the Super Admin can reopen a closed ticket.</p>
            )}
          </Form>

          <Form
            key={`as-${t.assigneeId ?? "none"}`}
            method="post"
            className="card space-y-3"
            aria-labelledby="as"
          >
            <CsrfInput />
            <input type="hidden" name="intent" value="assign" />
            <h2 id="as" className="text-lg">
              Assigned to
            </h2>
            <label htmlFor="as-to" className="sr-only">
              Assign to
            </label>
            <select
              id="as-to"
              name="assigneeId"
              defaultValue={t.assigneeId ?? "none"}
              className="field-input"
            >
              <option value="none">Nobody (unassigned)</option>
              {L.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input name="reason" maxLength={500} placeholder="Reason (optional)" className="field-input" />
            <button type="submit" className="btn-secondary w-full" disabled={busy}>
              Save assignment
            </button>
          </Form>

          <Form key={`pr-${t.priority}`} method="post" className="card space-y-3" aria-labelledby="pr">
            <CsrfInput />
            <input type="hidden" name="intent" value="priority" />
            <h2 id="pr" className="text-lg">
              Priority
            </h2>
            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <label
                  key={p}
                  className="flex cursor-pointer justify-center rounded-lg border border-line px-1 py-2 text-xs has-[:checked]:border-navy-800 has-[:checked]:bg-navy-800 has-[:checked]:font-semibold has-[:checked]:text-white"
                >
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    defaultChecked={t.priority === p}
                    className="sr-only"
                  />
                  {PRIORITY_LABEL[p]}
                </label>
              ))}
            </div>
            <button type="submit" className="btn-secondary w-full" disabled={busy}>
              Save priority
            </button>
          </Form>

          {!t.escalated && status !== "RESOLVED" && status !== "CLOSED" && (
            <Form method="post" className="card space-y-3" aria-labelledby="es">
              <CsrfInput />
              <input type="hidden" name="intent" value="escalate" />
              <h2 id="es" className="text-lg">
                Escalate to Super Admin
              </h2>
              <p className="text-xs text-muted">
                For technical faults or policy questions. The ticket keeps its history; priority is raised to
                at least High.
              </p>
              <textarea
                name="reason"
                required
                minLength={10}
                rows={2}
                placeholder="Why it needs the Super Admin"
                className="field-input"
              />
              <ConfirmDialog
                trigger="Escalate"
                triggerClassName="btn-secondary w-full"
                title="Escalate this ticket?"
                confirmLabel="Escalate"
                disabled={busy}
              >
                <p>The Super Admin is notified with your reason. This is recorded in the ticket history.</p>
              </ConfirmDialog>
            </Form>
          )}

          <section className="card" aria-labelledby="hist">
            <h2 id="hist" className="text-lg">
              History
            </h2>
            <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
              {L.events.map((e) => (
                <li key={e.id}>
                  <p className="text-ink">
                    {e.type === "created"
                      ? "Ticket created"
                      : e.type === "assigned"
                        ? `Assigned: ${e.fromLabel} → ${e.toLabel}`
                        : e.type === "escalated"
                          ? "Escalated to the Super Admin"
                          : e.type === "reopened"
                            ? "Reopened by the candidate"
                            : e.type === "priority"
                              ? `Priority: ${e.fromLabel} → ${e.toLabel}`
                              : `Status: ${e.fromLabel ?? "—"} → ${e.toLabel}`}
                  </p>
                  {e.reason && <p className="text-xs whitespace-pre-wrap text-muted">{e.reason}</p>}
                  <p className="text-xs text-muted">
                    {e.actorName} · {formatDateTime(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
