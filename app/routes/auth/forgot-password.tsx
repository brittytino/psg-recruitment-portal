import { Link } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/forgot-password";
import { Alert } from "~/components/forms";

export const meta: Route.MetaFunction = () => [
  { title: "Passwordless Sign In — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export default function ForgotPassword() {
  return (
    <AuthShell>
      <div>
        <h1>No password needed</h1>
        <div className="mt-4">
          <Alert tone="info" title="Sign in with a one-time code">
            This portal does not use passwords. Enter your e-mail address on the sign-in page and we send a
            6-digit code to it every time you sign in.
          </Alert>
        </div>
        <div className="mt-6">
          <Link
            to="/login"
            className="btn-primary inline-flex w-full items-center justify-center text-center"
          >
            Sign in with an e-mail code
          </Link>
        </div>
        <p className="mt-6 text-sm">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
