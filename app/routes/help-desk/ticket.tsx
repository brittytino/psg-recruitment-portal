import { RichTextEditor } from "~/components/rich-text-editor";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/ticket";
import { Alert, CsrfInput, formatDateTime } from "~/components/forms";
import {
  AttachmentInput,
  AttachmentList,
  CandidateHelpDeskShell,
  TicketMessage,
  TicketStatusBadge,
} from "~/components/helpdesk";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { categoryLabel, REOPEN_DAYS, TICKET_LIMITS, type TicketStatus } from "~/modules/helpdesk/definitions";
import { candidateReply, myTicket } from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data && "ticket" in data ? data.ticket.referenceNo : "Ticket"} — Help desk` },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  return myTicket(user, params.id);
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    await candidateReply(user, params.id, form);
    return { message: "Your reply has been sent." };
  });
}

function CopyRef({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        });
      }}
      className="btn-secondary btn-sm"
    >
      {done ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {done ? "Copied" : "Copy ticket number"}
    </button>
  );
}

export default function Ticket({ loaderData: L, actionData }: Route.ComponentProps) {
  const t = L.ticket;
  const [params] = useSearchParams();
  const busy = useNavigation().state === "submitting";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const form = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState(0);
  useEffect(() => {
    if (a?.message) {
      form.current?.reset();
      setSent((n) => n + 1);
    }
  }, [a?.message]);
  const status = t.status as TicketStatus;

  return (
    <CandidateHelpDeskShell signedIn>
      <div className="page-stack max-w-4xl">
        <PageHeader
          crumbs={[["Help desk", "/help-desk"], ["My tickets", "/help-desk/tickets"], [t.referenceNo]]}
          title={t.subject}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={status} /> <span>{t.referenceNo}</span> ·{" "}
              <span>{categoryLabel(t.category)}</span>
            </span>
          }
          actions={<CopyRef value={t.referenceNo} />}
        />

        {params.get("created") === "1" && (
          <Alert tone="success" title={`Ticket ${t.referenceNo} created`}>
            We have received your request. The recruitment office will reply here, and you will get a notice
            by e-mail and in the bell icon. Keep the ticket number for reference.{" "}
            <Link to="/account">Back to my applications</Link>
          </Alert>
        )}
        {a?.message && <Alert tone="success">{a.message}</Alert>}
        {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

        <dl className="card grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Created</dt>
            <dd className="font-medium">{formatDateTime(t.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last updated</dt>
            <dd className="font-medium">{formatDateTime(t.lastActivityAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Topic</dt>
            <dd className="font-medium">{t.subcategory ?? categoryLabel(t.category)}</dd>
          </div>
          <div>
            <dt className="text-muted">Application</dt>
            <dd className="font-medium">{t.application?.referenceNo ?? "—"}</dd>
          </div>
        </dl>

        {t.resolutionSummary && (status === "RESOLVED" || status === "CLOSED") && (
          <Alert tone="success" title={status === "RESOLVED" ? "Resolved" : "Closed"}>
            <span className="whitespace-pre-wrap">{t.resolutionSummary}</span>
          </Alert>
        )}

        <section aria-labelledby="conv" className="space-y-3">
          <h2 id="conv" className="text-xl">
            Conversation
          </h2>
          <ol className="space-y-3">
            {L.messages.map((m) => (
              <li key={m.id}>
                <TicketMessage author={m.author} createdAt={m.createdAt} body={m.body} mine={!m.fromStaff}>
                  <AttachmentList files={m.attachments} base="/help-desk/files" />
                </TicketMessage>
              </li>
            ))}
          </ol>
        </section>

        {L.canReply ? (
          <Form
            ref={form}
            method="post"
            encType="multipart/form-data"
            className="card space-y-4"
            aria-labelledby="reply"
          >
            <CsrfInput />
            <h2 id="reply" className="text-xl">
              {status === "RESOLVED" ? "Not solved? Reply to reopen" : "Reply"}
            </h2>
            {status === "AWAITING_CANDIDATE" && (
              <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning">
                The recruitment office is waiting for your answer.
              </p>
            )}
            <div>
              <label htmlFor="f-body" className="sr-only">
                Your message
              </label>
              <RichTextEditor
                key={sent}
                id="f-body"
                name="body"
                required
                rows={5}
                maxLength={TICKET_LIMITS.reply.max}
                placeholder="Write your message"
                invalid={!!a?.fieldErrors?.body}
              />
              {a?.fieldErrors?.body?.[0] && (
                <p className="mt-1 text-sm text-danger">{a.fieldErrors.body[0]}</p>
              )}
            </div>
            <AttachmentInput error={a?.fieldErrors?.files?.[0]} />
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Sending…" : status === "RESOLVED" ? "Reply and reopen" : "Send reply"}
            </button>
          </Form>
        ) : (
          <p className="card text-sm text-muted">
            {status === "CLOSED"
              ? "This ticket is closed."
              : `Resolved tickets can be reopened for ${REOPEN_DAYS} days.`}{" "}
            Need more help? <Link to="/help-desk/new">Create a new ticket</Link>.
          </p>
        )}
      </div>
    </CandidateHelpDeskShell>
  );
}
