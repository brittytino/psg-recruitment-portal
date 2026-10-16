import { Link } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/verify-email";
import { Alert } from "~/components/forms";
import { verifyEmail } from "~/modules/auth/account.server";

export const meta: Route.MetaFunction = () => [{ title: "Verify e-mail — PSG Tech Recruitment" }];

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return { ok: await verifyEmail(token) };
}

export default function VerifyEmail({ loaderData }: Route.ComponentProps) {
  return (
    <AuthShell>
      <div className="space-y-4">
        <h1>E-mail verification 📧</h1>
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
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
