import { Link, redirect } from "react-router";
import { AuthShell } from "~/components/auth-shell";
import type { Route } from "./+types/reset-password";
import { Alert } from "~/components/forms";

export const meta: Route.MetaFunction = () => [
  { title: "Passwordless Sign In — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export function loader() {
  // Passwords are not used; redirect directly to passwordless OTP login
  return redirect("/login");
}

export default function ResetPassword() {
  return (
    <AuthShell>
      <div>
        <h1>No password needed</h1>
        <div className="mt-4">
          <Alert tone="info" title="No Password Required">
            The PSG College of Technology Staff Recruitment Portal uses passwordless sign-in exclusively. You
            do not need to choose or reset a password. Simply enter your registered email address on the
            sign-in page to receive a secure 6-digit one-time code (OTP).
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
      </div>
    </AuthShell>
  );
}
