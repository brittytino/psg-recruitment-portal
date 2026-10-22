import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/login";
import { Alert, CsrfInput, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm, safeNext } from "~/lib/http.server";
import { userContext } from "~/context";
import { login } from "~/modules/auth/account.server";
import { pendingCookie } from "~/modules/auth/otp.server";
import { homePath } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = () => [{ title: "Sign in — PSG Tech Recruitment" }];

export function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (user) throw redirect(homePath(user.grants));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const r = await login(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? ""),
      clientIp(request),
      request.headers.get("user-agent"),
    );
    if (r.ok === false) return { formError: r.message };
    const next = safeNext(String(form.get("next") ?? ""), "");
    if (r.ok === "otp")
      throw redirect("/login/verify", { headers: { "Set-Cookie": pendingCookie(r.challengeId, next) } });
    const roles = await prisma.userRole.findMany({
      where: { userId: r.userId },
      select: { role: true, departmentId: true, cycleId: true },
    });
    throw redirect(next || homePath(roles), { headers: { "Set-Cookie": r.setCookie } });
  });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
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
              Sign in to start your application.
            </Alert>
          </div>
        )}
        <Form method="post" className="mt-6 space-y-5">
          <CsrfInput />
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          {actionData && "formError" in actionData && actionData.formError && (
            <Alert tone="danger">{actionData.formError}</Alert>
          )}
          <TextInput label="E-mail address" name="email" type="email" required autoComplete="username" />
          <TextInput
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
            {nav.state !== "idle" ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-sm">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
          <p className="rounded-xl bg-soft p-3 text-sm text-muted">
            Staff accounts (Admin, HR – N4 Section and HODs) confirm each sign-in with a one-time code sent to
            their official e-mail address.
          </p>
        </Form>
      </div>
    </AuthShell>
  );
}
