import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/login";
import { Alert, CsrfInput, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm, safeNext } from "~/lib/http.server";
import { userContext } from "~/context";
import { requestLoginOtp } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";
import { homePath } from "~/modules/auth/permissions";

export const meta: Route.MetaFunction = () => [{ title: "Sign in — PSG Tech Recruitment" }];

export function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (user) throw redirect(homePath(user.grants));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const email = String(form.get("email") ?? "");
    const r = await requestLoginOtp(email, clientIp(request));
    if (r.ok === false) return { formError: r.message };
    const next = safeNext(String(form.get("next") ?? ""), "");
    throw redirect("/login/verify", {
      headers: { "Set-Cookie": pendingCookie(r.challengeId, next) },
    });
  });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  const busy = nav.state !== "idle";

  return (
    <AuthShell>
      <div>
        <h1>Sign in</h1>
        <p className="mt-2 text-muted">
          New candidate? <Link to="/register">Create an account</Link>
        </p>
        {params.get("verified") === "1" && (
          <div className="mt-5">
            <Alert tone="success" title="E-mail address verified">
              Sign in with your email address to receive a one-time code.
            </Alert>
          </div>
        )}
        <Form method="post" className="mt-6 space-y-5">
          <CsrfInput />
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          {actionData && "formError" in actionData && actionData.formError && (
            <Alert tone="danger">{actionData.formError}</Alert>
          )}
          <TextInput
            label="E-mail address"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="e.g. name@example.com or staff@psgtech.ac.in"
          />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending one-time code…" : "Send One-Time Password (OTP)"}
          </button>
          <div className="rounded-xl border border-line bg-soft p-4 text-sm text-muted space-y-1.5">
            <p className="font-semibold text-ink">Passwordless Email Authentication</p>
            <p>
              A 6-digit one-time password (OTP) will be delivered to your official or verified mailbox.
              All users (Applicants, HODs, HR, Dean, Principal, Super Admin) authenticate securely via email OTP.
            </p>
          </div>
        </Form>
      </div>
    </AuthShell>
  );
}
