import { Form, Link, redirect, useNavigation } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/register";
import { Alert, CsrfInput, ErrorSummary, errorFor, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm } from "~/lib/http.server";
import { userContext } from "~/context";
import { registerCandidate } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";

export const meta: Route.MetaFunction = () => [
  { title: "Register — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export function loader({ context }: Route.LoaderArgs) {
  if (context.get(userContext)) throw redirect("/account");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const challengeId = await registerCandidate(Object.fromEntries(form), clientIp(request));
    throw redirect("/login/verify", { headers: { "Set-Cookie": pendingCookie(challengeId, "/account") } });
  });
}

export default function Register({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const busy = nav.state !== "idle";

  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
    : [];

  return (
    <AuthShell>
      <div>
        <h1>Create a candidate account</h1>
        <p className="mt-2 text-sm text-muted">
          Already registered? <Link to="/login">Sign in with OTP</Link>
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
              placeholder="e.g. Dr. Rajesh Kumar"
            />
            <TextInput
              label="E-mail address"
              name="email"
              type="email"
              required
              autoComplete="email"
              error={errorFor(fe, "email")}
              placeholder="e.g. rajesh@example.com"
            />
            <TextInput
              label="Mobile number"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              error={errorFor(fe, "phone")}
              placeholder="e.g. 9876543210"
              hint="10-digit Indian mobile number."
            />
            <div className="rounded-xl border border-line bg-soft p-3 text-xs text-muted">
              <span className="font-semibold text-ink">No password required.</span> A 6-digit one-time code
              will be sent to your e-mail address to verify your account and sign you in.
            </div>
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
                  I have read the{" "}
                  <Link to="/privacy" className="font-medium text-brand-600 underline hover:text-brand-700">
                    privacy notice
                  </Link>{" "}
                  and agree to my data being processed for recruitment.
                </label>
              </div>
              {errorFor(fe, "privacy") && (
                <p id="f-privacy-error" className="text-sm text-danger">
                  {errorFor(fe, "privacy")}
                </p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Sending verification code…" : "Register with Email OTP"}
            </button>
          </Form>
        </div>
      </div>
    </AuthShell>
  );
}
