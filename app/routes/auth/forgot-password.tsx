import { Link } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/forgot-password";
import { Alert } from "~/components/forms";

export const meta: Route.MetaFunction = () => [{ title: "Passwordless Sign In — PSG Tech Recruitment" }];

export default function ForgotPassword() {
  return (
    <AuthShell>
      <div>
        <h1>Passwordless Access 🔐</h1>
        <div className="mt-4">
          <Alert tone="info" title="Passwordless 6-Digit Email OTP Authentication">
            The PSG College of Technology Staff Recruitment Portal uses passwordless authentication
            exclusively. You do not need to create, remember, or reset a password. Every user (Candidates,
            HODs, HR, Dean, Principal, and Super Admin) authenticates securely via a 6-digit one-time code
            sent directly to their registered e-mail address.
          </Alert>
        </div>
        <div className="mt-6">
          <Link
            to="/login"
            className="btn-primary inline-flex w-full items-center justify-center text-center"
          >
            Sign In with 6-Digit Email OTP →
          </Link>
        </div>
        <p className="mt-6 text-sm">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
