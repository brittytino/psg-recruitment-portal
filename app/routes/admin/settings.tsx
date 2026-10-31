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
        eyebrow="System"
        title="Control centre"
        description="Live system status, switches, recruitment rules and emergency actions in one place. Every change here is recorded in the audit log."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

      {/* System status */}
      <section
        className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-white shadow-[var(--shadow-float)] sm:p-8"
        aria-labelledby="st"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-white/60 uppercase">
              <Activity className="h-4 w-4" aria-hidden="true" /> System status
            </p>
            <h2 id="st" className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
              {allOk ? "All systems working" : "Attention needed"}
            </h2>
            <p className="mt-1 text-sm text-white/70">
              {status.checks.filter((c) => c.ok).length} of {status.checks.length} services healthy · version{" "}
              <span className="font-mono">{status.version.slice(0, 7)}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${allOk ? "bg-success/20 text-[#9fe3b8]" : "bg-danger/25 text-[#ffb4ab]"}`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${allOk ? "bg-[#4ade80]" : "bg-[#f87171]"}`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${allOk ? "bg-[#4ade80]" : "bg-[#f87171]"}`}
              />
            </span>
            {allOk ? "Operational" : "Degraded"}
          </span>
        </div>
      </section>
      <section className="card space-y-4" aria-label="Services and usage">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {status.checks.map((c) => (
            <li
              key={c.name}
              className={`rounded-xl border p-3 ${c.ok ? "border-line" : "border-danger/40 bg-danger-50"}`}
            >
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
              ["Staff", roleCount("HR") + roleCount("HOD") + roleCount("ADMIN") + roleCount("MANAGER")],
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
        <div className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">E-mail today</p>
            <p className="text-sm text-muted">
              {status.mail.skipped ? `${status.mail.skipped} kept in the app only` : "None held back"}
              {status.mail.failed ? ` · ${status.mail.failed} failed` : ""}
            </p>
          </div>
          {(() => {
            const m = status.mail.smtp;
            const level =
              m.sent >= m.budget * 0.95 ? "usage-danger" : m.sent >= m.budget * 0.7 ? "usage-warning" : "";
            return (
              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    {m.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
                    )}
                    Mail server {m.host ? `(${m.host})` : ""}
                  </span>
                  <span className="text-muted tabular-nums">
                    {m.sent.toLocaleString("en-IN")} / {m.budget.toLocaleString("en-IN")}
                  </span>
                </div>
                <progress
                  className={`usage-bar mt-2 ${level}`}
                  max={m.budget}
                  value={Math.min(m.sent, m.budget)}
                  aria-label="E-mails sent today"
                />
                <p className="mt-1 text-xs text-muted">
                  Routine updates stop at {m.routineLimit.toLocaleString("en-IN")} and then appear in the app
                  only; sign-in codes always go out.
                </p>
              </div>
            );
          })()}
        </div>
        <p className="text-xs text-muted">
          Version {status.version} · E-mails sent from {status.mailFrom} · Roles:{" "}
          {(["SUPER_ADMIN", "MANAGER", "ADMIN", "HR", "HOD", "VIEWER"] as const)
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
                className="group flex h-full items-start gap-3 rounded-xl border border-line bg-paper p-4 no-underline transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-soft)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
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
