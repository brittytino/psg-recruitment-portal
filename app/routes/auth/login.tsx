import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { Alert, CsrfInput, TextInput } from "~/components/forms";
import { clientIp, handleAction, readForm, safeNext } from "~/lib/http.server";
import { userContext } from "~/context";
import { login } from "~/modules/auth/account.server";
import { hasPermission } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = () => [{ title: "Sign in — PSG Tech Recruitment" }];

export function loader({ context }: Route.LoaderArgs) {
  if (context.get(userContext)) throw redirect("/account");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  return handleAction(async () => {
    const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""), clientIp(request), request.headers.get("user-agent"));
    if (!r.ok) return { formError: r.message };
    const roles = await prisma.userRole.findMany({ where: { userId: r.userId }, select: { role: true, departmentId: true, cycleId: true } });
    const fallback = hasPermission(roles, "application:list") ? "/staff" : hasPermission(roles, "recruitment:manage") ? "/admin" : hasPermission(roles, "user:manage") ? "/admin/users" : "/account";
    throw redirect(safeNext(String(form.get("next") ?? ""), fallback), { headers: { "Set-Cookie": r.setCookie } });
  });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  return (
    <div className="mx-auto max-w-md">
      <h1>Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        New candidate? <Link to="/register">Create an account</Link>
      </p>
      <Form method="post" className="card mt-6 space-y-4">
        <CsrfInput />
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        {actionData && "formError" in actionData && actionData.formError && <Alert tone="danger">{actionData.formError}</Alert>}
        <TextInput label="E-mail address" name="email" type="email" required autoComplete="username" />
        <TextInput label="Password" name="password" type="password" required autoComplete="current-password" />
        <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
          {nav.state !== "idle" ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      </Form>
    </div>
  );
}
