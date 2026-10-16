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
        <h1>Reset your password 🔑</h1>
        {actionData && "ok" in actionData && actionData.ok ? (
          <div className="mt-6">
            <Alert tone="success" title="Check your e-mail">
              If an account exists for that address, we have sent a link to reset the password. The link is
              valid for 60 minutes.
            </Alert>
          </div>
        ) : (
          <Form method="post" className="mt-8 space-y-4">
            <CsrfInput />
            {actionData && "formError" in actionData && actionData.formError && (
              <Alert tone="danger">{actionData.formError}</Alert>
            )}
            <TextInput label="E-mail address" name="email" type="email" required autoComplete="email" />
            <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
              Send reset link
            </button>
          </Form>
        )}
        <p className="mt-4 text-sm">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
