import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/login";
import { Alert, CsrfInput, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm, safeNext } from "~/lib/http.server";
import { userContext } from "~/context";
import { requestLoginOtp } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";
import { homePath } from "~/modules/auth/permissions";

export const meta: Route.MetaFunction = () => [
  { title: "Sign in — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

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
        <p className="eyebrow">Candidates and staff</p>
        <h1 className="mt-1">Sign in</h1>
        <p className="mt-2 text-muted">
          Enter your e-mail address and we will send you a 6-digit sign-in code. New candidate?{" "}
          <Link to="/register">Create an account</Link>
        </p>
        {params.get("invite") === "hod" && (
          <div className="mt-5">
            <Alert tone="info" title="Welcome to the recruitment portal">
              You have been added as a Head of Department. Send the sign-in code to your e-mail to continue.
            </Alert>
          </div>
        )}
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
            placeholder="name@example.com"
            defaultValue={params.get("email") ?? undefined}
          />
          <button type="submit" className="btn-primary btn-lg w-full" disabled={busy}>
            {busy ? "Sending code…" : "Send sign-in code"}
          </button>
          <p className="text-sm text-muted">
            No password is needed. The code is valid for a few minutes and can be used once. Staff use their
            official e-mail address.
          </p>
        </Form>
      </div>
    </AuthShell>
  );
}
