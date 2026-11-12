import { useEffect, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import {
  Activity,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  LogOut,
  Mail,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Send,
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
import {
  clearMailCooldown,
  refreshMailDeliveryState,
  retryFailedPdfs,
  sendChannelTest,
  signOutEveryoneElse,
  systemStatus,
} from "~/modules/settings/control.server";
import { SETTING_GROUPS, SETTINGS, type SettingKey } from "~/modules/settings/definitions";
import {
  getEditableMailConfig,
  getEditableRuntimeEnv,
  resetRuntimeEnvConfig,
  saveMailChannelsConfig,
  saveRuntimeEnvConfig,
  swapMailChannelsConfig,
  type MailChannelId,
  type MailStrategy,
  type MailTransport,
  type RedactedMailChannel,
} from "~/modules/settings/runtime-config.server";
import { allSettings, saveSetting } from "~/modules/settings/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Control centre — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "settings:manage");
  const [values, status, mailConfig, runtimeEnv] = await Promise.all([
    allSettings(),
    systemStatus(user),
    getEditableMailConfig(user),
    getEditableRuntimeEnv(user),
  ]);
  return { values, status, mailConfig, runtimeEnv, userEmail: user.email };
}

function readChannelForm(form: FormData, prefix: MailChannelId) {
  const get = (k: string) => form.get(`${prefix}.${k}`);
  const transportRaw = String(get("transport") ?? "smtp");
  return {
    enabled: get("enabled") === "on",
    label: String(get("label") ?? ""),
    transport: (transportRaw === "brevo-api" ? "brevo-api" : "smtp") as MailTransport,
    host: String(get("host") ?? ""),
    port: Number(get("port") ?? 587) || 587,
    secure: get("secure") === "on",
    user: String(get("user") ?? ""),
    password: String(get("password") ?? ""),
    clearPassword: get("clearPassword") === "on",
    useEnvPassword: get("useEnvPassword") === "on",
    fromName: String(get("fromName") ?? ""),
    fromEmail: String(get("fromEmail") ?? ""),
    replyTo: String(get("replyTo") ?? ""),
    dailyBudget: Number(get("dailyBudget") ?? 300) || 300,
  };
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
      case "save-mail-channels": {
        const strategyRaw = String(form.get("strategy") ?? "primary-first");
        const strategy: MailStrategy = strategyRaw === "fallback-only" ? "fallback-only" : "primary-first";
        await saveMailChannelsConfig(
          user,
          {
            strategy,
            primary: readChannelForm(form, "primary"),
            fallback: readChannelForm(form, "fallback"),
          },
          ip,
        );
        await refreshMailDeliveryState();
        return {
          message:
            "Mail delivery & failover configuration saved (credentials encrypted in PostgreSQL). Changes take effect across web and worker within 5 seconds.",
        };
      }
      case "swap-mail-channels": {
        await swapMailChannelsConfig(user, ip);
        await refreshMailDeliveryState();
        return {
          message: "Primary and Fallback mail channels swapped cleanly (encrypted passwords preserved).",
        };
      }
      case "save-runtime-env": {
        const editable = await getEditableRuntimeEnv(user);
        const payload: Record<string, number> = {};
        for (const f of editable.fields) {
          const raw = String(form.get(`env.${f.key}`) ?? "").trim();
          if (raw === "") continue;
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            throw new ValidationError(`${f.label} must be a valid number.`);
          }
          if (n !== f.envDefault || f.overridden) {
            payload[f.key] = n;
          }
        }
        await saveRuntimeEnvConfig(user, payload, ip);
        return {
          message: "Runtime environment settings saved in database and active immediately without restart.",
        };
      }
      case "reset-runtime-env": {
        await resetRuntimeEnvConfig(user, ip);
        return { message: "Runtime environment overrides cleared; using server .env defaults." };
      }
      case "clear-cooldown": {
        const ch = String(form.get("channelId") ?? "");
        if (ch !== "primary" && ch !== "fallback") throw new ValidationError("Unknown mail channel.");
        await clearMailCooldown(user, ch, ip);
        return { message: `Cooldown cleared on ${ch === "primary" ? "Primary" : "Fallback"} mail channel.` };
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
      case "test-channel": {
        const targetRaw = String(form.get("target") ?? "auto");
        const target =
          targetRaw === "primary" || targetRaw === "fallback" ? targetRaw : ("auto" as const);
        const recipient = String(form.get("recipient") ?? user.email).trim() || user.email;
        try {
          const outcome = await sendChannelTest(user, target, recipient, ip);
          const via = `${outcome.channelId === "primary" ? "Primary" : "Fallback"} (${
            outcome.transport === "brevo-api" ? "Brevo HTTPS API" : outcome.host
          })`;
          const failoverNote =
            target === "auto" && outcome.failoverUsed ? " — automatic failover engaged" : "";
          return {
            message: `Test e-mail sent to ${recipient} via ${via}${failoverNote}. Check the inbox (and spam).`,
          };
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Delivery failed.";
          return {
            formError: `Test e-mail failed: ${detail}`,
          };
        }
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

function formatCooldownTtl(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m left` : `${hrs}h left`;
}

function ChannelEditor({
  title,
  subtitle,
  prefix,
  initial,
  fallbackFromEmail,
}: {
  title: string;
  subtitle: string;
  prefix: MailChannelId;
  initial: RedactedMailChannel;
  fallbackFromEmail: string;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [label, setLabel] = useState(initial.label);
  const [transport, setTransport] = useState<MailTransport>(initial.transport);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [secure, setSecure] = useState(initial.secure);
  const [user, setUser] = useState(initial.user);
  const [useEnvPassword, setUseEnvPassword] = useState(initial.useEnvPassword);
  const [clearPassword, setClearPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fromName, setFromName] = useState(initial.fromName);
  const [fromEmail, setFromEmail] = useState(initial.fromEmail || fallbackFromEmail);
  const [replyTo, setReplyTo] = useState(initial.replyTo);
  const [dailyBudget, setDailyBudget] = useState(String(initial.dailyBudget));

  const applyPreset = (preset: "brevo-smtp" | "brevo-api" | "gmail-smtp" | "custom-smtp") => {
    setEnabled(true);
    setPasswordDraft("");
    if (preset === "brevo-smtp") {
      setLabel("Brevo SMTP");
      setTransport("smtp");
      setHost("smtp-relay.brevo.com");
      setPort("587");
      setSecure(false);
      setUseEnvPassword(false);
      setClearPassword(true);
      setFromEmail((cur) => cur || fallbackFromEmail);
      setDailyBudget("280");
    } else if (preset === "brevo-api") {
      setLabel("Brevo HTTPS API");
      setTransport("brevo-api");
      setHost("api.brevo.com");
      setPort("443");
      setSecure(true);
      setUser("");
      setUseEnvPassword(false);
      setClearPassword(true);
      setFromEmail((cur) => cur || fallbackFromEmail);
      setDailyBudget("280");
    } else if (preset === "gmail-smtp") {
      setLabel("Gmail SMTP (App Password)");
      setTransport("smtp");
      setHost("smtp.gmail.com");
      setPort("587");
      setSecure(false);
      setUser((cur) => (cur.includes("smtp-brevo") ? fallbackFromEmail : cur || fallbackFromEmail));
      setFromEmail((cur) => cur || fallbackFromEmail);
      setUseEnvPassword(false);
      setClearPassword(false);
      setDailyBudget("450");
    } else {
      setLabel("Custom SMTP");
      setTransport("smtp");
      setHost("");
      setPort("587");
      setSecure(false);
      setUser("");
      setUseEnvPassword(false);
      setClearPassword(true);
      setFromEmail((cur) => cur || fallbackFromEmail);
      setDailyBudget("500");
    }
  };

  const p = (name: string) => `${prefix}.${name}`;
  const isBrevoApi = transport === "brevo-api";

  const pwBadge = clearPassword
    ? { cls: "bg-warning-50 text-warning-700 border-warning/30", text: "Stored password will be cleared on save" }
    : passwordDraft.trim()
      ? { cls: "bg-brand-50 text-brand-700 border-brand-200", text: "New key/password ready to save" }
      : initial.passwordSource === "db"
        ? { cls: "bg-success-50 text-success-700 border-success/30", text: "Encrypted key saved in DB" }
        : useEnvPassword
          ? { cls: "bg-soft text-ink border-line", text: "Using server .env SMTP_PASSWORD" }
          : { cls: "bg-danger-50 text-danger border-danger/30", text: "No key / password configured" };

  return (
    <div className="space-y-4 rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-soft px-3 py-1.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name={p("enabled")}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Enabled
        </label>
      </div>

      {/* Quick provider presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Quick preset:</span>
        <button
          type="button"
          onClick={() => applyPreset("brevo-api")}
          className="rounded-lg border border-line bg-soft px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50/40"
        >
          Brevo HTTPS API (443)
        </button>
        <button
          type="button"
          onClick={() => applyPreset("brevo-smtp")}
          className="rounded-lg border border-line bg-soft px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50/40"
        >
          Brevo SMTP (587)
        </button>
        <button
          type="button"
          onClick={() => applyPreset("gmail-smtp")}
          className="rounded-lg border border-line bg-soft px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50/40"
        >
          Gmail / App Password
        </button>
        <button
          type="button"
          onClick={() => applyPreset("custom-smtp")}
          className="rounded-lg border border-line bg-soft px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50/40"
        >
          Custom SMTP
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink">Channel label</label>
          <input
            type="text"
            name={p("label")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={prefix === "primary" ? "e.g. Brevo SMTP" : "e.g. Gmail Backup"}
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink">Transport</label>
          <select
            name={p("transport")}
            value={transport}
            onChange={(e) => {
              const next = e.target.value as MailTransport;
              setTransport(next);
              if (next === "brevo-api") {
                setHost("api.brevo.com");
                setPort("443");
                setSecure(true);
                setUseEnvPassword(false);
              } else if (host === "api.brevo.com") {
                setHost("smtp-relay.brevo.com");
                setPort("587");
                setSecure(false);
              }
            }}
            className="input mt-1"
          >
            <option value="smtp">SMTP (port 587 / 465)</option>
            <option value="brevo-api">Brevo Transactional HTTPS API (port 443)</option>
          </select>
        </div>

        {!isBrevoApi && (
          <>
            <div>
              <label className="block text-xs font-semibold text-ink">SMTP server host</label>
              <input
                type="text"
                name={p("host")}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp-relay.brevo.com"
                className="input mt-1 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-ink">Port</label>
                <input
                  type="number"
                  name={p("port")}
                  value={port}
                  onChange={(e) => {
                    const nextPort = e.target.value;
                    setPort(nextPort);
                    if (nextPort === "465") setSecure(true);
                    else if (nextPort === "587" || nextPort === "2525") setSecure(false);
                  }}
                  min={1}
                  max={65535}
                  className="input mt-1 font-mono text-sm"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                  <input
                    type="checkbox"
                    name={p("secure")}
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                    className="h-4 w-4"
                  />
                  TLS on connect (465)
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink">SMTP login / username</label>
              <input
                type="text"
                name={p("user")}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="e.g. xxxxxx@smtp-brevo.com"
                className="input mt-1 font-mono text-sm"
              />
            </div>
          </>
        )}

        <div>
          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-ink">
            <span>{isBrevoApi ? "Brevo API key (xkeysib-...)" : "App password / SMTP key"}</span>
          </label>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              name={p("password")}
              value={passwordDraft}
              onChange={(e) => {
                const v = e.target.value;
                setPasswordDraft(v);
                if (v.trim()) {
                  setClearPassword(false);
                  setUseEnvPassword(false);
                }
              }}
              autoComplete="new-password"
              placeholder={
                initial.passwordSource === "db"
                  ? "•••••••• (leave blank to keep stored key)"
                  : isBrevoApi
                    ? "Paste Brevo API key"
                    : "Paste Gmail app password or SMTP key"
              }
              className="input pr-9 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-2 flex items-center text-muted hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${pwBadge.cls}`}>
              <KeyRound className="h-3 w-3" aria-hidden="true" />
              {pwBadge.text}
            </span>
            {initial.passwordSource === "db" ? (
              <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted">
                <input
                  type="checkbox"
                  name={p("clearPassword")}
                  checked={clearPassword}
                  onChange={(e) => setClearPassword(e.target.checked)}
                />
                Clear DB key
              </label>
            ) : (
              clearPassword && <input type="hidden" name={p("clearPassword")} value="on" />
            )}
          </div>
        </div>

        {!isBrevoApi && (
          <div className="sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                name={p("useEnvPassword")}
                checked={useEnvPassword}
                onChange={(e) => setUseEnvPassword(e.target.checked)}
                className="h-4 w-4"
              />
              Fall back to server <code className="rounded bg-soft px-1">.env SMTP_PASSWORD</code> if no DB password
              is stored above (recommended for Gmail)
            </label>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-ink">From name</label>
          <input
            type="text"
            name={p("fromName")}
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="PSG College of Technology Recruitment"
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink">From e-mail address</label>
          <input
            type="email"
            name={p("fromEmail")}
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="recruitments@psgtech.ac.in"
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink">Reply-To address (optional)</label>
          <input
            type="email"
            name={p("replyTo")}
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="recruitments@psgtech.ac.in"
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink">Daily send budget</label>
          <input
            type="number"
            name={p("dailyBudget")}
            value={dailyBudget}
            onChange={(e) => setDailyBudget(e.target.value)}
            min={1}
            max={500000}
            className="input mt-1 font-mono text-sm"
          />
          <p className="mt-0.5 text-[11px] text-muted">
            Brevo Free = 280 (leaves 20 buffer under 300/day). Gmail = 450.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { values, status, mailConfig, runtimeEnv, userEmail } = loaderData;
  const busy = useNavigation().state !== "idle";
  const a = actionData as { message?: string; formError?: string } | undefined;
  const allOk = status.checks.every((c) => c.ok);
  const roleCount = (r: RoleName) => status.counts.usersByRole[r] ?? 0;
  const [strategy, setStrategy] = useState<MailStrategy>(mailConfig.strategy);
  useEffect(() => {
    setStrategy(mailConfig.strategy);
  }, [mailConfig.strategy]);
  const [testRecipient, setTestRecipient] = useState(userEmail);

  const channelList = [status.mail.channels.primary, status.mail.channels.fallback];

  return (
    <div className="page-stack max-w-6xl">
      <PageHeader
        eyebrow="System"
        title="Control centre"
        description="Live system status, mail failover channels, runtime environment overrides and recruitment rules in one place. Every change here is recorded in the audit log."
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

        {/* E-mail usage per channel */}
        <div className="space-y-4 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">E-mail channels today</p>
              <p className="text-xs text-muted">
                Routing:{" "}
                <strong className="text-ink">
                  {status.mail.strategy === "fallback-only"
                    ? "Fallback only (Primary bypassed)"
                    : "Primary first, auto-failover to Fallback"}
                </strong>
              </p>
            </div>
            <p className="text-sm text-muted">
              {status.mail.skipped ? `${status.mail.skipped} kept in the app only` : "None held back"}
              {status.mail.failed ? ` · ${status.mail.failed} failed` : ""}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {channelList.map((ch) => {
              const level =
                ch.sent >= ch.budget * 0.95
                  ? "usage-danger"
                  : ch.sent >= ch.budget * 0.7
                    ? "usage-warning"
                    : "";
              return (
                <div
                  key={ch.id}
                  className={`rounded-xl border p-3.5 ${
                    ch.cooldown.active
                      ? "border-warning/50 bg-warning-50/40"
                      : ch.enabled
                        ? "border-line bg-soft/40"
                        : "border-line bg-soft/20 opacity-75"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      {!ch.enabled ? (
                        <PauseCircle className="h-4 w-4 text-muted" aria-hidden="true" />
                      ) : ch.cooldown.active ? (
                        <Clock className="h-4 w-4 text-warning-700" aria-hidden="true" />
                      ) : ch.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
                      )}
                      {ch.id === "primary" ? "Primary" : "Fallback"}: {ch.label}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {ch.sent.toLocaleString("en-IN")} / {ch.budget.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {ch.transport === "brevo-api"
                      ? "Brevo HTTPS API (port 443)"
                      : `${ch.host || "No host"}:${ch.port}`}{" "}
                    · {ch.detail}
                  </p>
                  <progress
                    className={`usage-bar mt-2 ${level}`}
                    max={Math.max(1, ch.budget)}
                    value={Math.min(ch.sent, ch.budget)}
                    aria-label={`${ch.id} e-mails sent today`}
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Routine notices switch over / stop at {ch.routineLimit.toLocaleString("en-IN")}; sign-in
                    codes use remaining budget and fail over automatically.
                  </p>
                  {ch.cooldown.active && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-paper px-2.5 py-1.5 text-xs">
                      <span className="text-warning-800">
                        Paused ({ch.cooldown.kind}
                        {ch.cooldown.ttlSeconds ? `, ${formatCooldownTtl(ch.cooldown.ttlSeconds)}` : ""}):{" "}
                        {ch.cooldown.reason}
                      </span>
                      <Form method="post">
                        <CsrfInput />
                        <input type="hidden" name="intent" value="clear-cooldown" />
                        <input type="hidden" name="channelId" value={ch.id} />
                        <button
                          type="submit"
                          className="rounded border border-line bg-soft px-2 py-0.5 font-medium text-ink hover:bg-brand-50"
                          disabled={busy}
                        >
                          Clear pause
                        </button>
                      </Form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted">
          Version {status.version} · E-mails sent from {status.mailFrom} · Roles:{" "}
          {(["SUPER_ADMIN", "MANAGER", "ADMIN", "HR", "HOD", "VIEWER"] as const)
            .map((r) => `${ROLE_LABELS[r]} ${roleCount(r)}`)
            .join(" · ")}
        </p>
      </section>

      {/* Live Mail Delivery & Failover Configuration (stored encrypted in PostgreSQL) */}
      <section className="card space-y-5" aria-labelledby="mail-cfg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="mail-cfg" className="flex items-center gap-2 text-xl">
              <ArrowRightLeft className="h-5 w-5 text-brand-600" aria-hidden="true" />
              Mail delivery &amp; auto-failover (Brevo + Gmail)
            </h2>
            <p className="mt-1 text-sm text-muted">
              Configure both a Primary channel (recommended: Brevo) and a Fallback channel (recommended:
              Gmail Workspace). When one reaches its daily quota or returns an error (such as Gmail 550 daily
              limit), traffic fails over automatically to the other. Credentials are encrypted with AES-256-GCM
              using <code className="rounded bg-soft px-1">SESSION_SECRET</code> and require no server{" "}
              <code className="rounded bg-soft px-1">.env</code> edits.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Form method="post">
              <CsrfInput />
              <input type="hidden" name="intent" value="swap-mail-channels" />
              <button type="submit" className="btn-secondary text-xs" disabled={busy}>
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" /> Swap Primary ↔ Fallback
              </button>
            </Form>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                mailConfig.fromDb
                  ? "bg-success-50 text-success-700"
                  : "bg-soft text-muted"
              }`}
            >
              {mailConfig.fromDb ? "Saved in database" : "Using .env defaults"}
            </span>
          </div>
        </div>

        <Form method="post" className="space-y-5">
          <CsrfInput />
          <input type="hidden" name="intent" value="save-mail-channels" />

          <div className="rounded-xl border border-line bg-soft/40 p-4">
            <label htmlFor="mail-strategy" className="block text-sm font-semibold text-ink">
              Delivery strategy
            </label>
            <select
              id="mail-strategy"
              name="strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as MailStrategy)}
              className="input mt-1.5 max-w-xl"
            >
              <option value="primary-first">
                Primary first, automatic failover to Fallback (recommended)
              </option>
              <option value="fallback-only">
                Fallback only (bypass Primary completely until restored)
              </option>
            </select>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChannelEditor
              key={`primary:${JSON.stringify(mailConfig.primary)}`}
              title="Primary mail channel"
              subtitle="Handles normal traffic first (e.g., Brevo SMTP or Brevo HTTPS API)."
              prefix="primary"
              initial={mailConfig.primary}
              fallbackFromEmail={status.mailFrom || userEmail}
            />
            <ChannelEditor
              key={`fallback:${JSON.stringify(mailConfig.fallback)}`}
              title="Fallback mail channel"
              subtitle="Takes over automatically if Primary hits quota, cooldown, or connection error."
              prefix="fallback"
              initial={mailConfig.fallback}
              fallbackFromEmail={status.mailFrom || userEmail}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-muted">
              Changes propagate to both web and background email worker containers automatically within 5
              seconds.
            </p>
            <button type="submit" className="btn-primary" disabled={busy}>
              Save mail delivery &amp; failover config
            </button>
          </div>
        </Form>

        {/* Live test delivery bar */}
        <div className="rounded-xl border border-line bg-soft/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Send className="h-4 w-4 text-brand-600" aria-hidden="true" /> Test mail delivery right now
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Sends a live verification e-mail directly without waiting for the background queue. Use after saving
            above to verify Brevo and Gmail.
          </p>
          <Form method="post" className="mt-3 flex flex-wrap items-end gap-2">
            <CsrfInput />
            <input type="hidden" name="intent" value="test-channel" />
            <div className="min-w-[220px] flex-1">
              <label htmlFor="test-recipient" className="block text-xs font-medium text-muted">
                Recipient e-mail
              </label>
              <input
                id="test-recipient"
                type="email"
                name="recipient"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                required
                className="input mt-1"
              />
            </div>
            <button
              type="submit"
              name="target"
              value="auto"
              className="btn-primary"
              disabled={busy}
            >
              Test Auto-Failover
            </button>
            <button
              type="submit"
              name="target"
              value="primary"
              className="btn-secondary"
              disabled={busy}
            >
              Test Primary only
            </button>
            <button
              type="submit"
              name="target"
              value="fallback"
              className="btn-secondary"
              disabled={busy}
            >
              Test Fallback only
            </button>
          </Form>
        </div>
      </section>

      {/* Runtime Environment Overrides */}
      <section className="card space-y-4" aria-labelledby="rt-env">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="rt-env" className="flex items-center gap-2 text-xl">
              <SlidersHorizontal className="h-5 w-5 text-brand-600" aria-hidden="true" />
              Runtime environment overrides
            </h2>
            <p className="mt-1 text-sm text-muted">
              Adjust OTP policy, rate limits, session lifetime, upload sizes, and SMTP timeouts directly in
              PostgreSQL without modifying <code className="rounded bg-soft px-1">.env.production</code> or
              restarting containers.
            </p>
          </div>
          <Form method="post">
            <CsrfInput />
            <input type="hidden" name="intent" value="reset-runtime-env" />
            <button type="submit" className="btn-secondary text-xs" disabled={busy}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset all to .env defaults
            </button>
          </Form>
        </div>

        <Form method="post" className="space-y-4">
          <CsrfInput />
          <input type="hidden" name="intent" value="save-runtime-env" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {runtimeEnv.fields.map((f) => (
              <div
                key={`${f.key}:${f.value}:${f.overridden}`}
                className={`rounded-xl border p-3.5 ${
                  f.overridden ? "border-brand-300 bg-brand-50/30" : "border-line bg-soft/30"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`env-${f.key}`} className="text-xs font-semibold text-ink">
                    {f.label}
                  </label>
                  {f.overridden && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                      DB override
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{f.help}</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={`env-${f.key}`}
                    type="number"
                    name={`env.${f.key}`}
                    defaultValue={f.value}
                    min={f.min}
                    max={f.max}
                    className="input font-mono text-sm"
                  />
                  <span className="shrink-0 text-xs text-muted">{f.unit}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {f.key} · .env default: {f.envDefault}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={busy}>
              Save runtime overrides
            </button>
          </div>
        </Form>
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
              <Mail className="h-4 w-4 text-muted" aria-hidden="true" /> Quick self-test e-mail
            </p>
            <p className="flex-1 text-sm text-muted">
              Sends a quick test message to {userEmail} through auto-failover routing.
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
