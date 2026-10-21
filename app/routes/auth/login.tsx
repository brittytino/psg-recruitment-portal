import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { AuthShell } from "~/components/auth-shell";
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
    const r = await login(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? ""),
      clientIp(request),
      request.headers.get("user-agent"),
    );
    if (!r.ok) return { formError: r.message };
    const roles = await prisma.userRole.findMany({
      where: { userId: r.userId },
      select: { role: true, departmentId: true, cycleId: true },
    });
    const fallback = hasPermission(roles, "application:list")
      ? "/staff"
      : hasPermission(roles, "recruitment:manage")
        ? "/admin"
        : hasPermission(roles, "user:manage")
          ? "/admin/users"
          : "/account";
    throw redirect(safeNext(String(form.get("next") ?? ""), fallback), {
      headers: { "Set-Cookie": r.setCookie },
    });
  });
}

import { useState } from "react";

const DEMO_PRESETS = [
  {
    role: "Dean Administration (Admin)",
    email: "dean.admn@psgtech.ac.in",
    badge: "Admin",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "Full Control: System oversight, all applications, roles, vacancies & audit",
  },
  {
    role: "Principal (Admin)",
    email: "principal@psgtech.ac.in",
    badge: "Admin",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "Full Control: Institutional governance, all applications & audit oversight",
  },
  {
    role: "HR - N4 Section (Recruitment)",
    email: "admin.n4@psgtech.ac.in",
    badge: "HR-N4 Section",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Job profile entry, vacancies, screening, reviewer assignment & complete dossiers",
  },
  {
    role: "HOD - CSE (Dept Reviewer)",
    email: "hod.cse@psgtech.ac.in",
    badge: "HOD CSE",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "Reviewing CSE applicants only, academic scoring & recommendations",
  },
  {
    role: "HOD - MCA",
    email: "hod.mca@psgtech.ac.in",
    badge: "MCA Dept",
    badgeColor: "bg-teal-100 text-teal-800 border-teal-200",
    desc: "Review Computer Applications applicants & academic evaluation",
  },
  {
    role: "HOD - EEE",
    email: "hod.eee@psgtech.ac.in",
    badge: "EEE Dept",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    desc: "Review Electrical & Electronics Engineering applicants",
  },
  {
    role: "HOD - ECE",
    email: "hod.ece@psgtech.ac.in",
    badge: "ECE Dept",
    badgeColor: "bg-orange-100 text-orange-800 border-orange-200",
    desc: "Review Electronics & Communication Engineering applicants",
  },
  {
    role: "Candidate 1 (Dr. Sathish)",
    email: "candidate@example.test",
    badge: "Applicant",
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
    desc: "Browse vacancies, view submitted forms, continue drafts",
  },
  {
    role: "Candidate 2 (Dr. Priya)",
    email: "candidate2@example.test",
    badge: "Applicant",
    badgeColor: "bg-pink-100 text-pink-800 border-pink-200",
    desc: "Secondary applicant in HR review queue",
  },
];

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showDemoList, setShowDemoList] = useState(true);

  const fillCredentials = (userEmail: string) => {
    setEmail(userEmail);
    setPassword("Demo@12345");
  };

  return (
    <AuthShell>
      <div>
        <div className="flex items-center justify-between">
          <h1>Sign in 👋</h1>
          <span className="badge-soft text-[11px] font-mono">Password: Demo@12345</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          New candidate? <Link to="/register">Create an account</Link>
        </p>

        {/* Demo Quick-Fill Bar */}
        <div className="mt-5 rounded-2xl border border-line bg-gradient-to-br from-slate-50 to-pink-50/30 p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>⚡</span> Quick Demo Login
            </span>
            <button
              type="button"
              onClick={() => setShowDemoList(!showDemoList)}
              className="text-[11px] font-medium text-brand-700 hover:underline"
            >
              {showDemoList ? "Hide presets" : "Show presets"}
            </button>
          </div>

          {showDemoList && (
            <div className="mt-2.5 grid gap-1.5 max-h-48 overflow-y-auto pr-1">
              {DEMO_PRESETS.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  onClick={() => fillCredentials(p.email)}
                  className="flex items-center justify-between rounded-xl bg-white p-2 text-left border border-line hover:border-brand-300 hover:bg-brand-50/40 transition-colors group"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-ink group-hover:text-brand-700 truncate">
                      {p.role}
                    </p>
                    <p className="text-[11px] text-muted truncate font-mono">{p.email}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${p.badgeColor}`}
                  >
                    {p.badge}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Form method="post" className="mt-6 space-y-4">
          <CsrfInput />
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          {actionData && "formError" in actionData && actionData.formError && (
            <Alert tone="danger">{actionData.formError}</Alert>
          )}
          <TextInput
            label="E-mail address"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <TextInput
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn-primary w-full" disabled={nav.state !== "idle"}>
            {nav.state !== "idle" ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center justify-between text-xs text-muted pt-1">
            <Link to="/forgot-password" className="hover:underline">
              Forgot your password?
            </Link>
            <span>
              Demo Password: <strong className="font-mono text-ink">Demo@12345</strong>
            </span>
          </div>
        </Form>
      </div>
    </AuthShell>
  );
}
