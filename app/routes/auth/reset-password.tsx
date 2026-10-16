import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/reset-password";
import { Alert, CsrfInput, errorFor, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm } from "~/lib/http.server";
import { resetPassword } from "~/modules/auth/account.server";
import { ValidationError } from "~/modules/core/errors";

export const meta: Route.MetaFunction = () => [{ title: "Choose a new password — PSG Tech Recruitment" }];

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? ""))
      throw new ValidationError("Passwords do not match", { confirmPassword: ["Passwords do not match"] });
    await resetPassword(String(form.get("token") ?? ""), password, clientIp(request));
    throw redirect("/login?reset=1");
  });
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  return (
    <AuthShell>
      <div>
        <h1>Choose a new password 🔐</h1>
        <Form method="post" className="mt-8 space-y-4">
          <CsrfInput />
          <input type="hidden" name="token" value={params.get("token") ?? ""} />
          {actionData && "formError" in actionData && actionData.formError && (
            <Alert tone="danger">{actionData.formError}</Alert>
          )}
          <TextInput
            label="New password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 10 characters."
            error={errorFor(fe, "password")}
          />
          <TextInput
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            error={errorFor(fe, "confirmPassword")}
          />
          <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
            Set new password
          </button>
          <p className="text-sm text-muted">All your other signed-in sessions will be signed out.</p>
        </Form>
        <p className="mt-4 text-sm">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </div>
    </AuthShell>
  );
}
