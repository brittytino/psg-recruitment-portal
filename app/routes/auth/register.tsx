import { Form, Link, redirect, useNavigation } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/register";
import { Alert, CsrfInput, ErrorSummary, errorFor, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm } from "~/lib/http.server";
import { PRIVACY_NOTICE_VERSION } from "~/lib/privacy";
import { userContext } from "~/context";
import { registerCandidate } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";

export const meta: Route.MetaFunction = () => [{ title: "Register — PSG Tech Recruitment" }];

export function loader({ context, request }: Route.LoaderArgs) {
  if (context.get(userContext)) throw redirect("/account");
  return { done: new URL(request.url).searchParams.get("done") === "1" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const challengeId = await registerCandidate(Object.fromEntries(form), clientIp(request));
    throw redirect("/verify-email", { headers: { "Set-Cookie": pendingCookie(challengeId, "/account") } });
  });
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  if (loaderData.done)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1>Check your e-mail 📬</h1>
        <Alert tone="success" title="Registration received">
          If the address can be registered, we have sent a verification link to it. Open the link to activate
          your account, then sign in.
        </Alert>
        <p>
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    );
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
    : [];
  return (
    <AuthShell>
      <div>
        <h1>Create a candidate account</h1>
        <p className="mt-2 text-sm text-muted">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
        <div className="mt-6">
          {actionData && "formError" in actionData && actionData.formError && !summary.length && (
            <div className="mb-4">
              <Alert tone="danger">{actionData.formError}</Alert>
            </div>
          )}
          <ErrorSummary messages={summary} />
          <Form method="post" className="space-y-4" noValidate>
            <CsrfInput />
            <TextInput
              label="Full name"
              name="fullName"
              required
              autoComplete="name"
              error={errorFor(fe, "fullName")}
              maxLength={120}
            />
            <TextInput
              label="E-mail address"
              name="email"
              type="email"
              required
              autoComplete="email"
              error={errorFor(fe, "email")}
            />
            <TextInput
              label="Password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              hint="At least 10 characters. A passphrase of several words is a good choice."
              error={errorFor(fe, "password")}
            />
            <TextInput
              label="Confirm password"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              error={errorFor(fe, "confirmPassword")}
            />
            <div className="space-y-1">
              <div className="flex items-start gap-2">
                <input
                  id="f-privacy"
                  name="privacy"
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  aria-describedby={errorFor(fe, "privacy") ? "f-privacy-error" : undefined}
                />
                <label htmlFor="f-privacy" className="text-sm">
                  I have read the <Link to="/privacy">privacy notice</Link> (version {PRIVACY_NOTICE_VERSION})
                  and agree to my data being processed for recruitment.
                </label>
              </div>
              {errorFor(fe, "privacy") && (
                <p id="f-privacy-error" className="text-sm text-danger">
                  {errorFor(fe, "privacy")}
                </p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
              {nav.state !== "idle" ? "Creating account…" : "Create account"}
            </button>
          </Form>
        </div>
      </div>
    </AuthShell>
  );
}
