import { Form, Link, redirect, useNavigation } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/verify-email";
import { Alert, CsrfInput } from "~/components/forms";
import { OtpInput } from "~/components/otp-input";
import { clientIp, handleAction, readForm } from "~/lib/http.server";
import { verifyEmail, verifyEmailByOtp } from "~/modules/auth/account.server";
import { clearPendingCookie, readPending } from "~/modules/auth/otp.server";

export const meta: Route.MetaFunction = () => [{ title: "Verify e-mail — PSG Tech Recruitment" }];

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token");
  if (token) return { mode: "link" as const, ok: await verifyEmail(token) };
  return { mode: "code" as const, ok: false, pending: !!readPending(request) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const pending = readPending(request);
    if (!pending) return { formError: "Your code has expired. Sign in and request a new code." };
    const ok = await verifyEmailByOtp(pending.challengeId, String(form.get("code") ?? ""), clientIp(request));
    if (!ok)
      return { formError: "The code is incorrect or has expired. Check the latest e-mail and try again." };
    throw redirect("/login?verified=1", { headers: { "Set-Cookie": clearPendingCookie() } });
  });
}

export default function VerifyEmail({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  if (loaderData.mode === "link")
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1>E-mail verification</h1>
          {loaderData.ok ? (
            <Alert tone="success" title="Your e-mail address is verified">
              You can now sign in and start your application.
            </Alert>
          ) : (
            <Alert tone="danger" title="This link is invalid or has expired">
              Sign in and request a new verification e-mail from your account page.
            </Alert>
          )}
          <p>
            <Link to="/login" className="btn-primary">
              Go to sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  return (
    <AuthShell>
      <div className="space-y-5">
        <div>
          <h1>Check your e-mail</h1>
          <p className="mt-2 text-muted">
            We sent a 6-digit code to your e-mail address. Enter the code below to verify your e-mail address.
            The code expires in 5 minutes.
          </p>
        </div>
        {actionData && "formError" in actionData && actionData.formError && (
          <Alert tone="danger">{actionData.formError}</Alert>
        )}
        {loaderData.pending ? (
          <Form method="post" className="space-y-4">
            <CsrfInput />
            <OtpInput />
            <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
              {nav.state !== "idle" ? "Verifying…" : "Verify e-mail address"}
            </button>
          </Form>
        ) : (
          <Alert tone="warning" title="No code is waiting">
            Sign in and use “Send a new verification e-mail” on your account page.
          </Alert>
        )}
        <p className="text-sm">
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
