import { Form, Link } from "react-router";
import { motion } from "framer-motion";
import type { Route } from "./+types/account";
import { Alert, Badge, CsrfInput, formatDateTime, statusTone } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { listOwnApplications } from "~/modules/applications/service.server";
import { sendVerification } from "~/modules/auth/account.server";
import { rateLimit } from "~/modules/auth/rate-limit.server";
import { hasRole } from "~/modules/auth/permissions";
import { POSITION_LABELS } from "~/lib/labels";
import { redirect } from "react-router";

export const meta: Route.MetaFunction = () => [{ title: "My applications — PSG Tech Careers" }];

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
      return { message: "A new verification e-mail has been sent." };
    }
    return { message: "" };
  });
}

const STATUS_EMOJI: Record<string, string> = {
  DRAFT: "📝",
  SUBMITTED: "📨",
  UNDER_HR_REVIEW: "🔍",
  UNDER_DEPARTMENT_REVIEW: "🏛️",
  NEEDS_CLARIFICATION: "💬",
  SHORTLISTED: "⭐",
  REJECTED: "📁",
  APPROVED: "🎉",
  WITHDRAWN: "↩️",
};

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { applications, verified, name } = loaderData;
  const count = (pred: (s: string) => boolean) => applications.filter((a) => pred(a.status)).length;
  const tiles: [string, string, number, string][] = [
    ["bg-tile-pink", "Drafts in progress", count((s) => s === "DRAFT" || s === "NEEDS_CLARIFICATION"), "📝"],
    ["bg-tile-blue", "Submitted", count((s) => !["DRAFT", "WITHDRAWN"].includes(s)), "📨"],
    [
      "bg-tile-purple",
      "Under review",
      count((s) => ["SUBMITTED", "UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW"].includes(s)),
      "🔍",
    ],
    ["bg-tile-green", "Shortlisted / selected", count((s) => s === "SHORTLISTED" || s === "APPROVED"), "⭐"],
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 border-b border-line/70 pb-6">
        <div>
          <p className="eyebrow">Candidate workspace</p>
          <h1 className="mt-1.5 text-2xl sm:text-4xl lg:text-5xl font-extrabold text-ink">
            Welcome back, {name} 👋
          </h1>
          <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-muted">
            Track your submitted applications, review feedback, and continue draft forms.
          </p>
        </div>
        <Link to="/vacancies" className="btn-primary w-full sm:w-auto text-center shrink-0">
          🔎 Browse open vacancies
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
            <button type="submit" className="btn-secondary py-2">
              Send a new verification e-mail
            </button>
          </Form>
        </Alert>
      )}

      <section aria-label="Summary">
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tiles.map(([bg, label, value, emoji]) => (
            <div key={label} className={`stat-tile p-3.5 sm:p-5 ${bg}`}>
              <dt className="text-xs sm:text-sm font-medium truncate">
                <span aria-hidden="true">{emoji} </span>
                {label}
              </dt>
              <dd className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="apps">
        <h2 id="apps" className="text-xl">
          My applications
        </h2>
        {applications.length === 0 ? (
          <div className="card mt-4 text-center">
            <p className="text-5xl" aria-hidden="true">
              🌱
            </p>
            <p className="mt-3 font-semibold">You have not started any applications yet</p>
            <p className="mt-1 text-sm text-muted">
              Find a position that fits you and start the official application form.
            </p>
            <Link to="/vacancies" className="btn-primary mt-5">
              Browse open vacancies
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {applications.map((a) => {
              const editable = a.status === "DRAFT" || a.status === "NEEDS_CLARIFICATION";
              return (
                <li key={a.id} className="card flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-soft text-2xl"
                      >
                        {STATUS_EMOJI[a.status] ?? "📄"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted">{a.vacancy.department.name}</p>
                        <h3 className="font-semibold leading-snug">{a.vacancy.title}</h3>
                        <p className="mt-0.5 text-xs text-muted">{POSITION_LABELS[a.vacancy.position]}</p>
                      </div>
                    </div>
                    <Badge tone={statusTone(a.status)}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="card-soft p-3">
                      <dt className="text-xs text-muted">Reference</dt>
                      <dd className="font-semibold">{a.referenceNo ?? "On submission"}</dd>
                    </div>
                    <div className="card-soft p-3">
                      <dt className="text-xs text-muted">Last updated</dt>
                      <dd className="font-semibold">{formatDateTime(a.updatedAt)}</dd>
                    </div>
                  </dl>
                  <Link
                    to={editable ? `/applications/${a.id}` : `/applications/${a.id}/receipt`}
                    className={editable ? "btn-primary" : "btn-secondary"}
                  >
                    {a.status === "DRAFT"
                      ? "Continue application →"
                      : a.status === "NEEDS_CLARIFICATION"
                        ? "Update and resubmit →"
                        : "View status"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </motion.div>
  );
}
