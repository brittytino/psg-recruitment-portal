import { Form, Link } from "react-router";
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

export const meta: Route.MetaFunction = () => [{ title: "My applications — PSG Tech Recruitment" }];

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

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { applications, verified, name } = loaderData;
  return (
    <div className="space-y-6">
      <div>
        <h1>My applications</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {name}</p>
      </div>
      {actionData && "message" in actionData && actionData.message && <Alert tone="success">{actionData.message}</Alert>}
      {actionData && "formError" in actionData && actionData.formError && <Alert tone="danger">{actionData.formError}</Alert>}
      {!verified && (
        <Alert tone="warning" title="Verify your e-mail address">
          <p>You must verify your e-mail address before you can start an application.</p>
          <Form method="post" className="mt-2">
            <CsrfInput />
            <input type="hidden" name="intent" value="resend-verification" />
            <button type="submit" className="btn-secondary py-1">
              Send a new verification e-mail
            </button>
          </Form>
        </Alert>
      )}
      {applications.length === 0 ? (
        <div className="card">
          <p>You have not started any applications yet.</p>
          <p className="mt-3">
            <Link to="/vacancies" className="btn-primary">
              Browse open vacancies
            </Link>
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption className="sr-only">Your applications</caption>
            <thead>
              <tr>
                <th scope="col">Vacancy</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
                <th scope="col">Last updated</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="font-medium">{a.vacancy.title}</span>
                    <br />
                    <span className="text-xs text-muted">
                      {POSITION_LABELS[a.vacancy.position]} · {a.vacancy.department.name}
                    </span>
                  </td>
                  <td>{a.referenceNo ?? <span className="text-muted">Assigned on submission</span>}</td>
                  <td>
                    <Badge tone={statusTone(a.status)}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                  </td>
                  <td>{formatDateTime(a.updatedAt)}</td>
                  <td>
                    {a.status === "DRAFT" || a.status === "NEEDS_CLARIFICATION" ? (
                      <Link to={`/applications/${a.id}`}>Continue</Link>
                    ) : (
                      <Link to={`/applications/${a.id}/receipt`}>View</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
