import { Form, Link, useNavigation } from "react-router";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  History,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import type { Route } from "./+types/settings";
import { Alert, ConfirmDialog, CsrfInput } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ROLE_LABELS, type RoleName } from "~/modules/auth/permissions";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { ValidationError } from "~/modules/core/errors";
import { SETTING_GROUPS, SETTINGS, type SettingKey } from "~/modules/settings/definitions";
import {
  retryFailedPdfs,
  sendTestEmail,
  signOutEveryoneElse,
  systemStatus,
} from "~/modules/settings/control.server";
import { allSettings, saveSetting } from "~/modules/settings/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Control centre — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "settings:manage");
  const [values, status] = await Promise.all([allSettings(), systemStatus(user)]);
  return { values, status };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "settings:manage");
  const form = await readForm(request, context);
  const ip = clientIp(request);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "save": {
        const keys = (Object.keys(SETTINGS) as SettingKey[]).filter(
          (k) => SETTINGS[k].group === form.get("group"),
        );
        for (const key of keys) await saveSetting(user, key, form.get(key) === "on");
        return { message: "Saved. The change applies immediately for everyone." };
      }
      case "retry-pdfs": {
        const n = await retryFailedPdfs(user, ip);
        return {
          message: n ? `${n} application PDF${n === 1 ? "" : "s"} queued again.` : "Nothing to retry.",
        };
      }
      case "signout-all": {
        const n = await signOutEveryoneElse(user, ip);
        return { message: `${n} session${n === 1 ? "" : "s"} ended. Everyone else must sign in again.` };
      }
      case "test-email":
        try {
          await sendTestEmail(user, ip);
          return { message: `Test e-mail sent to ${user.email}. Check the inbox (and spam).` };
        } catch {
          return {
            formError:
              "The test e-mail could not be sent. On the server run: sudo ./prod.sh mailtest — it shows the cause and the fix.",
          };
        }
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const SHORTCUTS = [
  [Users, "Users & roles", "/admin/users", "Add staff, change roles, disable accounts, sign a user out"],
  [Building2, "Departments & HODs", "/admin/departments", "Departments, HOD invitations"],
  [SlidersHorizontal, "Job profiles", "/admin", "Create, edit, open and close vacancies"],
  [FileText, "Open-positions PDFs", "/admin/notices", "Faculty and Research notices on the home page"],
  [UserCog, "Applications", "/staff", "Every application; bulk-assign to HODs"],
  [History, "Audit log", "/staff/audit", "Who did what and when"],
] as const;

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { values, status } = loaderData;
  const busy = useNavigation().state !== "idle";
  const a = actionData as { message?: string; formError?: string } | undefined;
  const allOk = status.checks.every((c) => c.ok);
  const roleCount = (r: RoleName) => status.counts.usersByRole[r] ?? 0;

  return (
    <div className="page-stack max-w-6xl">
      <PageHeader
        eyebrow="Super Admin"
        title="Control centre"
        description="Everything that keeps the portal running: live system status, portal switches, recruitment rules and emergency actions. Every change here is recorded in the audit log."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

      {/* System status */}
      <section className="card space-y-4" aria-labelledby="st">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="st" className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-brand-600" aria-hidden="true" /> System status
          </h2>
          <span className={`text-sm font-semibold ${allOk ? "text-success" : "text-danger"}`}>
            {allOk ? "All systems working" : "Attention needed"}
          </span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {status.checks.map((c) => (
            <li key={c.name} className="rounded-xl border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
                )}
                {c.name}
              </p>
              <p className={`mt-1 text-xs ${c.ok ? "text-muted" : "text-danger"}`}>{c.detail}</p>
            </li>
          ))}
        </ul>
        <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Submitted applications", status.counts.applications],
              ["Candidates", roleCount("CANDIDATE")],
              ["Staff (HR / HOD / Admin)", roleCount("HR") + roleCount("HOD") + roleCount("ADMIN")],
              ["Signed-in sessions", status.counts.sessions],
              ["Sign-ins (24 h)", status.counts.signIns24h],
              ["Wrong codes (24 h)", status.counts.failedCodes24h],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-soft p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-display text-2xl font-semibold text-ink tabular-nums">
                {v.toLocaleString("en-IN")}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">
          Version {status.version} · E-mails sent from {status.mailFrom} · Roles:{" "}
          {(["SUPER_ADMIN", "ADMIN", "HR", "HOD"] as const)
            .map((r) => `${ROLE_LABELS[r]} ${roleCount(r)}`)
            .join(" · ")}
        </p>
      </section>

      {/* Switches and rules */}
      <div className="grid gap-6 lg:grid-cols-2">
        {(Object.keys(SETTING_GROUPS) as (keyof typeof SETTING_GROUPS)[]).map((g) => (
          <Form key={g} method="post" className="card space-y-3" aria-labelledby={`g-${g}`}>
            <CsrfInput />
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="group" value={g} />
            <h2 id={`g-${g}`} className="text-xl">
              {SETTING_GROUPS[g]}
            </h2>
            {(Object.keys(SETTINGS) as SettingKey[])
              .filter((k) => SETTINGS[k].group === g)
              .map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 has-[:checked]:border-brand-200 has-[:checked]:bg-brand-50/40"
                >
                  <input
                    type="checkbox"
                    name={k}
                    defaultChecked={values[k]}
                    className="mt-1 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-ink">{SETTINGS[k].label}</span>
                    <span className="text-sm text-muted">{SETTINGS[k].help}</span>
                  </span>
                </label>
              ))}
            <button type="submit" className="btn-primary" disabled={busy}>
              Save {SETTING_GROUPS[g].toLowerCase()}
            </button>
          </Form>
        ))}
      </div>

      {/* Operations */}
      <section className="card space-y-4" aria-labelledby="ops">
        <h2 id="ops" className="flex items-center gap-2 text-xl">
          <ShieldAlert className="h-5 w-5 text-brand-600" aria-hidden="true" /> Operations
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Form method="post" className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <CsrfInput />
            <input type="hidden" name="intent" value="retry-pdfs" />
            <p className="flex items-center gap-2 font-semibold text-ink">
              <RefreshCw className="h-4 w-4 text-muted" aria-hidden="true" /> Retry failed PDFs
            </p>
            <p className="flex-1 text-sm text-muted">
              {status.counts.failedPdfs
                ? `${status.counts.failedPdfs} application PDF${status.counts.failedPdfs === 1 ? "" : "s"} failed to generate. Queue them again.`
                : "No failed application PDFs."}
            </p>
            <button type="submit" className="btn-secondary" disabled={busy || !status.counts.failedPdfs}>
              Retry {status.counts.failedPdfs || ""}
            </button>
          </Form>

          <Form method="post" className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <CsrfInput />
            <input type="hidden" name="intent" value="test-email" />
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Mail className="h-4 w-4 text-muted" aria-hidden="true" /> Send a test e-mail
            </p>
            <p className="flex-1 text-sm text-muted">
              Sends an e-mail to you now, to confirm sign-in codes can be delivered.
            </p>
            <button type="submit" className="btn-secondary" disabled={busy}>
              Send test e-mail
            </button>
          </Form>

          <Form method="post" className="flex flex-col gap-3 rounded-xl border border-danger/30 p-4">
            <CsrfInput />
            <input type="hidden" name="intent" value="signout-all" />
            <p className="flex items-center gap-2 font-semibold text-ink">
              <LogOut className="h-4 w-4 text-danger" aria-hidden="true" /> Sign everyone out
            </p>
            <p className="flex-1 text-sm text-muted">
              Ends all {Math.max(0, status.counts.sessions - 1)} other session
              {status.counts.sessions - 1 === 1 ? "" : "s"} (staff and candidates). Use after a suspected
              misuse. You stay signed in.
            </p>
            <ConfirmDialog
              trigger="Sign everyone else out"
              tone="danger"
              triggerClassName="btn-danger"
              title="Sign everyone else out?"
              confirmLabel="Sign everyone out"
              disabled={busy}
            >
              <p>
                Every staff member and candidate except you will be signed out immediately and must sign in
                again with an e-mail code. Unsaved form changes on their screens may be lost.
              </p>
            </ConfirmDialog>
          </Form>
        </div>
      </section>

      {/* Shortcuts */}
      <section aria-labelledby="sc" className="space-y-3">
        <h2 id="sc" className="flex items-center gap-2 text-xl">
          <Database className="h-5 w-5 text-brand-600" aria-hidden="true" /> Everything else
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map(([Icon, title, to, text]) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-xl border border-line bg-paper p-4 no-underline transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="text-sm text-muted">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
