import { Form, Link } from "react-router";
import { ArrowRight, Search } from "lucide-react";
import { EmptyState, StatTile } from "~/components/staff";
import type { Route } from "./+types/account";
import { Alert, Badge, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { listOwnApplications } from "~/modules/applications/service.server";
import { resendEmailOtp, sendVerification } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";
import { clientIp } from "~/lib/http.server";
import { rateLimit } from "~/modules/auth/rate-limit.server";
import { hasRole } from "~/modules/auth/permissions";
import { POSITION_LABELS } from "~/lib/labels";
import { redirect } from "react-router";

export const meta: Route.MetaFunction = () => [
  { title: "My applications — PSG Tech Careers" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  if (!hasRole(user.grants, "CANDIDATE")) throw redirect("/staff");
  const applications = await listOwnApplications(user);
  return { applications, verified: user.emailVerified, name: user.displayName };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    if (form.get("intent") === "resend-verification" && !user.emailVerified) {
      await rateLimit("resend-verify", user.id, 3, 3600);
      await sendVerification(user.id);
      const challengeId = await resendEmailOtp(user.id, clientIp(request));
      throw redirect("/verify-email", { headers: { "Set-Cookie": pendingCookie(challengeId, "/account") } });
    }
    return { message: "" };
  });
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { applications, verified, name } = loaderData;
  const count = (pred: (s: string) => boolean) => applications.filter((a) => pred(a.status)).length;
  const tiles: [string, number][] = [
    ["Drafts in progress", count((s) => s === "DRAFT" || s === "NEEDS_CLARIFICATION")],
    ["Submitted", count((s) => !["DRAFT", "WITHDRAWN"].includes(s))],
    ["Under review", count((s) => ["SUBMITTED", "UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW"].includes(s))],
    ["Shortlisted / selected", count((s) => s === "SHORTLISTED" || s === "APPROVED")],
  ];
  return (
    <div className="page-stack">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Candidate workspace</p>
          <h1 className="mt-1 text-2xl sm:text-3xl">Welcome, {name}</h1>
          <p className="mt-1.5 text-muted">
            Track your submitted applications, review feedback, and continue draft forms.
          </p>
        </div>
        <Link to="/vacancies" className="btn-primary w-full sm:w-auto text-center shrink-0">
          <Search className="h-4 w-4" aria-hidden="true" /> Browse vacancies
        </Link>
      </div>

      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      {!verified && (
        <Alert tone="warning" title="Verify your e-mail address">
          <p>You must verify your e-mail address before you can start an application.</p>
          <Form method="post" className="mt-3">
            <CsrfInput />
            <input type="hidden" name="intent" value="resend-verification" />
            <button type="submit" className="btn-secondary btn-sm">
              Send a new verification e-mail
            </button>
          </Form>
        </Alert>
      )}

      <section aria-label="Summary">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <StatTile key={label} label={label} value={value} />
          ))}
        </div>
      </section>

      <section aria-labelledby="apps">
        <h2 id="apps" className="text-xl">
          My applications
        </h2>
        {applications.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="You have not started any applications yet">
              <Link to="/vacancies">Find a vacancy</Link> and start the application form.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {applications.map((a) => {
              const editable = a.status === "DRAFT" || a.status === "NEEDS_CLARIFICATION";
              return (
                <li key={a.id} className="card flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div>
                        <p className="label-caps">
                          {a.vacancy.department?.name ?? a.vacancy.researchSpecialisation?.name ?? "Research"}
                        </p>
                        <h3 className="mt-1 leading-snug">{a.vacancy.title}</h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {a.vacancy.researchPositionTitle ??
                            (a.vacancy.position ? POSITION_LABELS[a.vacancy.position] : "Research Assistant")}
                        </p>
                      </div>
                    </div>
                    <Badge tone={statusTone(a.status)}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                  </div>
                  {a.status === "SHORTLISTED" && a.interviewAt && (
                    <p className="rounded-lg border border-success/25 bg-success-50 px-3 py-2 text-sm">
                      <strong className="text-success">Interview:</strong> {formatDateTime(a.interviewAt)} ·{" "}
                      {a.interviewVenue}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-soft p-3">
                      <dt className="text-xs text-muted">Reference</dt>
                      <dd className="font-semibold">{a.referenceNo ?? "On submission"}</dd>
                    </div>
                    <div className="rounded-lg bg-soft p-3">
                      <dt className="text-xs text-muted">Last updated</dt>
                      <dd className="font-semibold">{formatDateTime(a.updatedAt)}</dd>
                    </div>
                  </dl>
                  <Link
                    to={editable ? `/applications/${a.id}` : `/applications/${a.id}/receipt`}
                    className={`${editable ? "btn-primary" : "btn-secondary"} mt-auto`}
                  >
                    {a.status === "DRAFT"
                      ? "Continue application"
                      : a.status === "NEEDS_CLARIFICATION"
                        ? "Update and resubmit"
                        : "View status"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
