import { Form, Link, useNavigation } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/forgot-password";
import { Alert, CsrfInput, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm } from "~/lib/http.server";
import { requestPasswordReset } from "~/modules/auth/account.server";

export const meta: Route.MetaFunction = () => [{ title: "Reset password — PSG Tech Recruitment" }];

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    await requestPasswordReset(String(form.get("email") ?? ""), clientIp(request));
    return { ok: true };
  });
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  return (
    <AuthShell>
      <div>
        <h1>Passwordless Access 🔐</h1>
        <div className="mt-4">
          <Alert tone="info" title="Passwordless Email OTP Portal">
            The PSG College of Technology Staff Recruitment Portal uses passwordless sign-in. You do not need to remember or reset a password. Simply enter your email address on the sign-in page to receive a secure 6-digit one-time verification code (OTP).
          </Alert>
        </div>
        <div className="mt-6">
          <Link to="/login" className="btn-primary inline-flex w-full items-center justify-center text-center">
            Go to Sign In with Email OTP →
          </Link>
        </div>
        {actionData && "ok" in actionData && actionData.ok ? (
          <div className="mt-6">
            <Alert tone="success" title="Check your email">
              If an account exists for that address, instructions have been sent. You can also sign in directly at any time using your email and a 6-digit OTP.
            </Alert>
          </div>
        ) : (
          <Form method="post" className="mt-8 space-y-4 border-t border-border pt-6">
            <p className="text-xs text-muted">
              Legacy password reset request (if your account was provisioned with legacy credentials):
            </p>
            <CsrfInput />
            {actionData && "formError" in actionData && actionData.formError && (
              <Alert tone="danger">{actionData.formError}</Alert>
            )}
            <TextInput label="Email address" name="email" type="email" required autoComplete="email" />
            <button type="submit" className="btn-secondary w-full" disabled={nav.state !== "idle"}>
              Request recovery email
            </button>
          </Form>
        )}
        <p className="mt-4 text-sm">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
