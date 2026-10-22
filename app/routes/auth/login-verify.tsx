import { Form, Link, redirect, useNavigation } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/login-verify";
import { Alert, CsrfInput } from "~/components/forms";
import { OtpInput } from "~/components/otp-input";
import { clientIp, handleAction, readForm, safeNext } from "~/lib/http.server";
import { completeLoginWithOtp, resendLoginOtp } from "~/modules/auth/account.server";
import { clearPendingCookie, pendingCookie, readPending } from "~/modules/auth/otp.server";
import { homePath } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = () => [{ title: "Enter your sign-in code — PSG Tech Recruitment" }];

export function loader({ request }: Route.LoaderArgs) {
  if (!readPending(request)) throw redirect("/login");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  const ip = clientIp(request);
  return handleAction(async () => {
    const pending = readPending(request);
    if (!pending) throw redirect("/login");
    if (form.get("intent") === "resend") {
      const challengeId = await resendLoginOtp(pending.challengeId, ip);
      return data({ message: "A new code has been sent." }, pendingCookie(challengeId, pending.next));
    }
    const r = await completeLoginWithOtp(
      pending.challengeId,
      String(form.get("code") ?? ""),
      ip,
      request.headers.get("user-agent"),
    );
    if (r.ok !== true) return { formError: r.ok === false ? r.message : "Sign in again." };
    const roles = await prisma.userRole.findMany({
      where: { userId: r.userId },
      select: { role: true, departmentId: true, cycleId: true },
    });
    const headers = new Headers();
    headers.append("Set-Cookie", r.setCookie);
    headers.append("Set-Cookie", clearPendingCookie());
    throw redirect(safeNext(pending.next, homePath(roles)), { headers });
  });
}

function data(body: { message: string }, cookie: string) {
  return Response.json(body, { headers: { "Set-Cookie": cookie } });
}

export default function LoginVerify({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const a = actionData as { formError?: string; message?: string } | undefined;
  return (
    <AuthShell>
      <div className="space-y-5">
        <div>
          <h1>Check your e-mail</h1>
          <p className="mt-2 text-muted">
            For security, staff sign-in needs a one-time code. We sent a 6-digit code to your official e-mail
            address. It expires in 10 minutes.
          </p>
        </div>
        {a?.message && <Alert tone="success">{a.message}</Alert>}
        <Form method="post" className="space-y-4">
          <CsrfInput />
          <OtpInput error={a?.formError} />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Checking…" : "Verify and sign in"}
          </button>
        </Form>
        <Form method="post" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <CsrfInput />
          <input type="hidden" name="intent" value="resend" />
          <span className="text-muted">Didn’t get it? Check spam, or</span>
          <button type="submit" className="btn-secondary py-1.5" disabled={busy}>
            Send a new code
          </button>
        </Form>
        <p className="text-sm">
          <Link to="/login">Use a different account</Link>
        </p>
      </div>
    </AuthShell>
  );
}
