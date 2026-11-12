import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env, type Env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import {
  getMailConfigSignature,
  loadRuntimeConfig,
  type MailChannelConfig,
  type MailChannelId,
  type MailChannelsConfig,
  type MailTransport,
  runtimeEnvSync,
} from "~/modules/settings/runtime-config.server";
import {
  type ChannelCooldownKind,
  channelSentToday,
  clearChannelCooldown,
  countChannelEmail,
  getChannelCooldown,
  hasChannelRoom,
  type MailPriority,
  setChannelCooldown,
} from "./budget.server";

/** Today's e-mail budget is used up across all active routes. The caller keeps the message in the app. */
export class MailBudgetExceededError extends Error {
  constructor() {
    super("Daily e-mail budget reached");
    this.name = "MailBudgetExceededError";
  }
}

let transport: Transporter | undefined;
let fallback: Transporter | undefined;

interface CachedChannelTransport {
  signature: string;
  main: Transporter;
  alt?: Transporter;
}

const channelTransporters = new Map<MailChannelId, CachedChannelTransport>();

export interface SmtpDiagnosticResult {
  ok: boolean;
  code:
    | "OK"
    | "CONFIG_ERROR"
    | "DNS_LOOKUP"
    | "TIMEOUT"
    | "AUTH_FAILED"
    | "TLS_ERROR"
    | "CONNECTION_REFUSED"
    | "QUOTA_EXCEEDED"
    | "BLOCKED"
    | "UNKNOWN_ERROR";
  message: string;
  provider: string;
  details?: string;
}

export interface MailDeliveryOutcome {
  channelId: MailChannelId;
  transport: MailTransport;
  host: string;
  failoverUsed: boolean;
}

function sanitizeSecretText(msg: string): string {
  return msg
    .replace(/pass(?:word)?(?:\s+is|\s*[:=])\s*\S+/gi, "password: ***")
    .replace(/(?:xkeysib|xsmtpsib)-[A-Za-z0-9._-]+/gi, "brevo-key:***")
    .replace(/api[-_ ]?key\s*[:=]\s*\S+/gi, "api-key: ***");
}

function closeSafe(t: Transporter | undefined): void {
  if (!t) return;
  try {
    t.close();
  } catch {
    // ignore
  }
}

/** Resets cached transporters (for test isolation or after config change). */
export function resetTransporterForTesting(): void {
  closeSafe(transport);
  closeSafe(fallback);
  transport = undefined;
  fallback = undefined;
  for (const entry of channelTransporters.values()) {
    closeSafe(entry.main);
    closeSafe(entry.alt);
  }
  channelTransporters.clear();
}

/** Centralized default transporter getter with connection pooling and timeouts. */
export function getTransporter(): Transporter {
  if (!transport) {
    const e = env();
    const provider = e.EMAIL_PROVIDER;

    if (provider === "test") {
      transport = nodemailer.createTransport({
        jsonTransport: true,
      });
    } else if (provider === "mailpit") {
      transport = nodemailer.createTransport({
        host: e.SMTP_HOST || "mailpit",
        port: e.SMTP_PORT || 1025,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: e.SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: e.SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: e.SMTP_SOCKET_TIMEOUT_MS,
      });
    } else {
      // Institutional / configured SMTP provider
      transport = nodemailer.createTransport({
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
        connectionTimeout: e.SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: e.SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: e.SMTP_SOCKET_TIMEOUT_MS,
        tls: {
          rejectUnauthorized: e.NODE_ENV === "production",
        },
      });
    }
  }
  return transport;
}

function createChannelSmtpTransport(ch: MailChannelConfig, e: Env, portOverride?: number): Transporter {
  const rt = runtimeEnvSync();
  const port = portOverride ?? ch.port;
  const secure = portOverride !== undefined ? portOverride === 465 : ch.secure;
  return nodemailer.createTransport({
    pool: portOverride === undefined,
    maxConnections: 5,
    maxMessages: 100,
    host: ch.host,
    port,
    secure,
    auth: ch.user ? { user: ch.user, pass: ch.password ?? "" } : undefined,
    connectionTimeout: rt.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: rt.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: rt.SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      rejectUnauthorized: e.NODE_ENV === "production",
    },
  });
}

function getChannelSmtpTransport(
  ch: MailChannelConfig,
  mailCfg: MailChannelsConfig,
  signature: string,
  e: Env,
): Transporter {
  if (!mailCfg.fromDb && ch.id === "primary") {
    return getTransporter();
  }
  const existing = channelTransporters.get(ch.id);
  if (existing && existing.signature === signature) {
    return existing.main;
  }
  if (existing) {
    closeSafe(existing.main);
    closeSafe(existing.alt);
  }
  const main = createChannelSmtpTransport(ch, e);
  channelTransporters.set(ch.id, { signature, main });
  return main;
}

/** Network-level failures (blocked port, timeout), as opposed to a rejected login or address. */
function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    [
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ECONNRESET",
      "ESOCKET",
      "ECONNECTION",
      "EHOSTUNREACH",
      "ENETUNREACH",
    ].includes(e.code ?? "") || /timed? ?out|ECONNREFUSED|ECONNRESET|fetch failed/i.test(e.message ?? "")
  );
}

interface MailErrorClassification {
  diagnosticCode: SmtpDiagnosticResult["code"];
  cooldownKind?: ChannelCooldownKind;
  ttlSeconds?: number;
  safeMessage: string;
  recipientError?: boolean;
}

export function classifyMailError(err: unknown): MailErrorClassification {
  const error = err as {
    code?: string;
    message?: string;
    response?: string;
    responseCode?: number;
    httpStatus?: number;
    brevoCode?: string;
  };
  const errCode = error.code ?? "";
  const errMsg = sanitizeSecretText(`${error.message ?? ""} ${error.response ?? ""}`.trim());
  const status = error.httpStatus;
  const smtpCode = error.responseCode;

  // Single-recipient bounces should not pause the entire sending channel.
  if (
    smtpCode === 550 &&
    /5\.1\.1|user unknown|no such user|does not exist|recipient address rejected|mailbox unavailable/i.test(errMsg) &&
    !/limit exceeded|daily.*limit|quota|blocked|unauthorized ip/i.test(errMsg)
  ) {
    return {
      diagnosticCode: "UNKNOWN_ERROR",
      recipientError: true,
      safeMessage: "The recipient mailbox rejected the address.",
    };
  }

  if (
    status === 402 ||
    status === 429 ||
    error.brevoCode === "not_enough_credits" ||
    error.brevoCode === "too_many_requests" ||
    /5\.4\.5|daily.*sending limit|daily.*limit exceeded|quota exceeded|too many messages|credits exhausted/i.test(
      errMsg,
    )
  ) {
    return {
      diagnosticCode: "QUOTA_EXCEEDED",
      cooldownKind: "quota",
      ttlSeconds: 2 * 3600,
      safeMessage: "Daily sending quota exceeded on this mail channel.",
    };
  }

  if (
    /unauthorized ip|unrecognized ip|ip.*not authorized|account.*suspended|account.*deactivated|sender.*blocked|blacklisted/i.test(
      errMsg,
    ) ||
    status === 403
  ) {
    return {
      diagnosticCode: "BLOCKED",
      cooldownKind: "blocked",
      ttlSeconds: 3600,
      safeMessage: "Mail provider blocked sending from this account or server IP.",
    };
  }

  if (
    errCode === "EAUTH" ||
    smtpCode === 535 ||
    smtpCode === 534 ||
    status === 401 ||
    /authentication failed|invalid login|username and password not accepted|invalid api key|key not found/i.test(
      errMsg,
    )
  ) {
    return {
      diagnosticCode: "AUTH_FAILED",
      cooldownKind: "auth",
      ttlSeconds: 15 * 60,
      safeMessage: "Authentication failed with the mail server.",
    };
  }

  if (errCode === "EDNS" || /ENOTFOUND|getaddrinfo/i.test(errMsg)) {
    return {
      diagnosticCode: "DNS_LOOKUP",
      cooldownKind: "error",
      ttlSeconds: 120,
      safeMessage: "DNS resolution failed for the configured mail server.",
    };
  }

  if (errCode === "ETIMEDOUT" || /timed? ?out|timeout|AbortError/i.test(errMsg)) {
    return {
      diagnosticCode: "TIMEOUT",
      cooldownKind: "error",
      ttlSeconds: 120,
      safeMessage: "Connection to the mail server timed out.",
    };
  }

  if (errCode === "ESOCKET" || /self-signed|TLS|certificate/i.test(errMsg)) {
    return {
      diagnosticCode: "TLS_ERROR",
      cooldownKind: "error",
      ttlSeconds: 120,
      safeMessage: "TLS negotiation or certificate validation failed.",
    };
  }

  if (errCode === "ECONNREFUSED" || /ECONNREFUSED/i.test(errMsg)) {
    return {
      diagnosticCode: "CONNECTION_REFUSED",
      cooldownKind: "error",
      ttlSeconds: 120,
      safeMessage: "Connection refused by the mail server.",
    };
  }

  if (isConnectionError(err)) {
    return {
      diagnosticCode: "CONNECTION_REFUSED",
      cooldownKind: "error",
      ttlSeconds: 120,
      safeMessage: "Network connection to the mail provider failed.",
    };
  }

  return {
    diagnosticCode: "UNKNOWN_ERROR",
    cooldownKind: "error",
    ttlSeconds: 90,
    safeMessage: errMsg || "Mail delivery check failed.",
  };
}

/** Explains a send failure in the server log so operations can act on it. */
export function smtpFailureHint(err: unknown): string {
  const c = classifyMailError(err);
  if (c.diagnosticCode === "QUOTA_EXCEEDED") {
    return "Channel hit its daily sending limit (e.g., Gmail 550-5.4.5 or Brevo credits). Failover channel handles traffic automatically, or configure Brevo in Super Admin Settings.";
  }
  if (c.diagnosticCode === "BLOCKED") {
    return "Provider blocked sending IP or account. If using Brevo, verify authorized IPs in Brevo -> Security -> Authorized IPs is off or includes this server.";
  }
  if (c.diagnosticCode === "AUTH_FAILED") {
    return "Mail provider rejected the login or API key. Update the credentials in Super Admin -> System Settings.";
  }
  if (c.diagnosticCode === "TIMEOUT" || c.diagnosticCode === "CONNECTION_REFUSED") {
    return "Cannot connect to the mail server port (outbound 587/465 may be firewalled). Switch channel transport to Brevo HTTPS API (port 443) or check firewall.";
  }
  if (c.diagnosticCode === "DNS_LOOKUP") return "DNS lookup of the mail server failed on this server.";
  return "Check Super Admin -> System Settings -> Mail Delivery or run ./prod.sh mailtest for diagnostics.";
}

function isChannelConfigured(ch: MailChannelConfig, e: Env): boolean {
  if (!ch.enabled) return false;
  if (ch.transport === "brevo-api") {
    return Boolean(ch.password && (ch.fromEmail || ch.user || e.SMTP_FROM_EMAIL));
  }
  if (e.EMAIL_PROVIDER === "test" || e.EMAIL_PROVIDER === "mailpit") return true;
  return Boolean(ch.host);
}

function buildChannelEnvelope(ch: MailChannelConfig, mail: SendMailOptions, e: Env): SendMailOptions {
  const fromEmail = ch.fromEmail || e.SMTP_FROM_EMAIL || ch.user || e.SMTP_USER;
  const cleanName = (ch.fromName || e.SMTP_FROM_NAME).replace(/["\r\n]/g, "").trim();
  const computedFrom = fromEmail ? (cleanName ? `"${cleanName}" <${fromEmail}>` : fromEmail) : mail.from ?? e.MAIL_FROM;
  const replyTo = ch.replyTo || mail.replyTo;
  return {
    ...mail,
    from: computedFrom,
    ...(replyTo ? { replyTo } : {}),
  };
}

function parseAddressList(value: SendMailOptions["to"]): { email: string; name?: string }[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const out: { email: string; name?: string }[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const m = item.match(/^(.*?)\s*<([^>]+)>$/);
      if (m?.[2]) {
        out.push({ email: m[2].trim(), name: (m[1] ?? "").replace(/^"|"$/g, "").trim() || undefined });
      } else if (item.trim()) {
        out.push({ email: item.trim() });
      }
    } else if (item && typeof item === "object" && "address" in item && item.address) {
      out.push({ email: item.address, name: item.name || undefined });
    }
  }
  return out;
}

async function deliverBrevoApi(ch: MailChannelConfig, mail: SendMailOptions, e: Env): Promise<void> {
  if (!ch.password) {
    const err = new Error("Brevo API key is missing") as Error & { httpStatus?: number };
    err.httpStatus = 401;
    throw err;
  }
  const fromEmail = ch.fromEmail || e.SMTP_FROM_EMAIL || ch.user;
  if (!fromEmail) {
    throw new Error("Sender e-mail address is required for Brevo HTTP API");
  }
  const to = parseAddressList(mail.to);
  if (to.length === 0) {
    throw new Error("No valid recipient e-mail address provided");
  }

  const headers: Record<string, string> = {};
  if (mail.headers && typeof mail.headers === "object" && !Array.isArray(mail.headers)) {
    for (const [k, v] of Object.entries(mail.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const payload = {
    sender: {
      name: (ch.fromName || e.SMTP_FROM_NAME).trim(),
      email: fromEmail,
    },
    to,
    ...(ch.replyTo ? { replyTo: { email: ch.replyTo } } : {}),
    subject: mail.subject ?? "",
    ...(mail.html ? { htmlContent: String(mail.html) } : {}),
    ...(mail.text ? { textContent: String(mail.text) } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": ch.password,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    let bodyText = "";
    let brevoCode: string | undefined;
    try {
      const json = (await res.json()) as { code?: string; message?: string };
      brevoCode = json.code;
      bodyText = json.message ?? JSON.stringify(json);
    } catch {
      bodyText = await res.text().catch(() => res.statusText);
    }
    const err = new Error(`Brevo API error (${res.status}): ${bodyText || res.statusText}`) as Error & {
      httpStatus?: number;
      brevoCode?: string;
    };
    err.httpStatus = res.status;
    err.brevoCode = brevoCode;
    throw err;
  }
}

async function deliverSmtpOnChannel(
  ch: MailChannelConfig,
  mail: SendMailOptions,
  mailCfg: MailChannelsConfig,
  signature: string,
  e: Env,
): Promise<void> {
  const main = getChannelSmtpTransport(ch, mailCfg, signature, e);
  try {
    await main.sendMail(mail);
    return;
  } catch (err) {
    const canTryAltPort =
      e.EMAIL_PROVIDER === "smtp" &&
      (ch.port === 587 || ch.port === 465) &&
      isConnectionError(err);
    if (!canTryAltPort) throw err;
    logger.warn(
      { event: "mail_port_fallback", channelId: ch.id, host: ch.host, port: ch.port, err: (err as Error).message },
      "mail server port unreachable, trying the alternate port",
    );
  }

  const altPort = ch.port === 465 ? 587 : 465;
  if (!mailCfg.fromDb && ch.id === "primary") {
    if (!fallback) {
      const rt = runtimeEnvSync();
      fallback = nodemailer.createTransport({
        host: ch.host,
        port: altPort,
        secure: altPort === 465,
        auth: ch.user ? { user: ch.user, pass: ch.password ?? "" } : undefined,
        connectionTimeout: rt.SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: rt.SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: rt.SMTP_SOCKET_TIMEOUT_MS,
        tls: { rejectUnauthorized: e.NODE_ENV === "production" },
      });
    }
    await fallback.sendMail(mail);
    return;
  }

  const entry = channelTransporters.get(ch.id);
  const alt = entry?.alt ?? createChannelSmtpTransport(ch, e, altPort);
  if (entry) entry.alt = alt;
  await alt.sendMail(mail);
}

async function sendViaChannel(
  ch: MailChannelConfig,
  baseMail: SendMailOptions,
  mailCfg: MailChannelsConfig,
  signature: string,
  e: Env,
): Promise<void> {
  const envelope = buildChannelEnvelope(ch, baseMail, e);
  if (ch.transport === "brevo-api") {
    await deliverBrevoApi(ch, envelope, e);
  } else {
    await deliverSmtpOnChannel(ch, envelope, mailCfg, signature, e);
  }
}

async function verifyBrevoApi(ch: MailChannelConfig, timeoutMs: number): Promise<SmtpDiagnosticResult> {
  if (!ch.password) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      provider: "brevo-api",
      message: "Brevo API key is not configured.",
    };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": ch.password,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => res.statusText);
      const err = new Error(`Brevo API returned HTTP ${res.status}: ${bodyText}`) as Error & {
        httpStatus?: number;
      };
      err.httpStatus = res.status;
      const c = classifyMailError(err);
      return {
        ok: false,
        code: c.diagnosticCode,
        provider: "brevo-api",
        message: c.safeMessage,
        details: sanitizeSecretText(err.message),
      };
    }
    return {
      ok: true,
      code: "OK",
      provider: "brevo-api",
      message: "Brevo HTTPS API verified and ready.",
    };
  } catch (err) {
    const c = classifyMailError(err);
    return {
      ok: false,
      code: c.diagnosticCode,
      provider: "brevo-api",
      message: c.safeMessage,
      details: sanitizeSecretText((err as Error).message || String(err)),
    };
  }
}

/** Diagnostic check for a specific channel (primary or fallback) without sending mail. */
export async function verifyChannelConnection(
  channelId: MailChannelId,
  timeoutMs = 5000,
): Promise<SmtpDiagnosticResult> {
  const e = env();
  const { mail: mailCfg } = await loadRuntimeConfig();
  const ch = mailCfg[channelId];

  if ((e.EMAIL_PROVIDER === "test" || e.EMAIL_PROVIDER === "mailpit") && !mailCfg.fromDb && channelId === "primary") {
    if (e.EMAIL_PROVIDER === "test") {
      return { ok: true, code: "OK", provider: "test", message: "Test email provider active." };
    }
  }

  if (!ch.enabled) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      provider: ch.transport === "brevo-api" ? "brevo-api" : e.EMAIL_PROVIDER,
      message: "Channel is disabled.",
    };
  }

  if (ch.transport === "brevo-api") {
    return verifyBrevoApi(ch, timeoutMs);
  }

  if (!ch.host && e.EMAIL_PROVIDER === "smtp") {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      provider: "smtp",
      message: "SMTP host is not configured.",
    };
  }

  const signature = getMailConfigSignature();
  const t = getChannelSmtpTransport(ch, mailCfg, signature, e);
  const provider = mailCfg.fromDb ? "smtp" : e.EMAIL_PROVIDER;

  try {
    const verifyPromise = t.verify();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), timeoutMs),
    );
    await Promise.race([verifyPromise, timeoutPromise]);
    return {
      ok: true,
      code: "OK",
      provider,
      message: "SMTP transporter verified and ready.",
    };
  } catch (err: unknown) {
    const c = classifyMailError(err);
    const errMsg = sanitizeSecretText((err as Error).message || String(err));

    logger.error(
      {
        event: "mail_check_failed",
        channelId,
        provider,
        code: c.diagnosticCode,
        diagnostic: c.safeMessage,
        rawMessage: errMsg,
      },
      "SMTP verification error",
    );

    return {
      ok: false,
      code: c.diagnosticCode,
      provider,
      message: c.safeMessage,
      details: errMsg,
    };
  }
}

/** Diagnostic check for active mail connectivity without sending actual emails. */
export async function verifySmtpConnection(timeoutMs = 5000): Promise<SmtpDiagnosticResult> {
  const e = env();
  const { mail: mailCfg } = await loadRuntimeConfig();

  if (e.EMAIL_PROVIDER === "test" && !mailCfg.fromDb) {
    return {
      ok: true,
      code: "OK",
      provider: "test",
      message: "Test email provider active.",
    };
  }

  const order: MailChannelId[] =
    mailCfg.strategy === "fallback-only"
      ? ["fallback"]
      : mailCfg.fallback.enabled
        ? ["primary", "fallback"]
        : ["primary"];

  let firstResult: SmtpDiagnosticResult | undefined;
  for (const id of order) {
    const ch = mailCfg[id];
    if (!ch.enabled && id !== order[0]) continue;
    const res = await verifyChannelConnection(id, timeoutMs);
    if (!firstResult) firstResult = res;
    if (res.ok) {
      return id === order[0]
        ? res
        : {
            ...res,
            message: `Fallback channel verified and ready (${ch.label || ch.host}).`,
          };
    }
  }

  return (
    firstResult ?? {
      ok: false,
      code: "CONFIG_ERROR",
      provider: e.EMAIL_PROVIDER,
      message: "No active mail channel configured.",
    }
  );
}

/**
 * Sends one e-mail with automatic failover across configured channels:
 *  - skips channels currently on cooldown or over their priority budget when a healthy route exists,
 *  - retries across remaining channels immediately if SMTP returns 550 quota/block or times out,
 *  - keeps OTP delivery resilient even if soft daily budgets are exceeded.
 */
async function deliverWithOutcome(mail: SendMailOptions, priority: MailPriority): Promise<MailDeliveryOutcome> {
  const e = env();
  const { mail: mailCfg } = await loadRuntimeConfig();
  const signature = getMailConfigSignature();

  const message: SendMailOptions = {
    ...mail,
    // Ask mail servers not to send out-of-office or other automatic replies to this mailbox.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All", ...mail.headers },
  };

  if ((e.EMAIL_PROVIDER === "test" || e.EMAIL_PROVIDER === "mailpit") && !mailCfg.fromDb) {
    await getTransporter().sendMail(message);
    return {
      channelId: "primary",
      transport: "smtp",
      host: e.SMTP_HOST,
      failoverUsed: false,
    };
  }

  const orderedRaw =
    mailCfg.strategy === "fallback-only" ? [mailCfg.fallback] : [mailCfg.primary, mailCfg.fallback];
  const configured = orderedRaw.filter((ch) => isChannelConfigured(ch, e));

  if (configured.length === 0) {
    throw new Error("No mail delivery channel is enabled and configured.");
  }

  // When only a single un-overridden channel handles an OTP in test mode, skip Redis cooldown
  // round-trips since there is no alternate route to fail over to.
  const singleOtpEnvOnly = configured.length === 1 && priority === "otp" && !mailCfg.fromDb && e.NODE_ENV === "test";
  const states = await Promise.all(
    configured.map(async (ch, index) => {
      if (singleOtpEnvOnly) {
        return {
          ch,
          index,
          cooldown: { active: false as const },
          sent: 0,
          inBudget: true,
        };
      }
      const [cooldown, sent] = await Promise.all([getChannelCooldown(ch), channelSentToday(ch)]);
      return {
        ch,
        index,
        cooldown,
        sent,
        inBudget: hasChannelRoom(sent, ch.dailyBudget, priority),
      };
    }),
  );

  const healthy = states.filter((s) => !s.cooldown.active && s.inBudget);
  let candidates = healthy;

  if (priority === "otp") {
    // For sign-in codes: try healthy channels first; if none remain, fall back to over-budget
    // channels or ones whose cooldown is shortest rather than silently locking users out.
    const backup = states
      .filter((s) => !healthy.includes(s))
      .sort((a, b) => {
        const score = (s: (typeof states)[number]) => {
          if (!s.cooldown.active) return 0;
          if (s.cooldown.kind === "error" || s.cooldown.kind === "auth") return 1;
          return 2;
        };
        const diff = score(a) - score(b);
        if (diff !== 0) return diff;
        return (a.cooldown.ttlSeconds ?? 0) - (b.cooldown.ttlSeconds ?? 0);
      });
    candidates = [...healthy, ...backup];
  } else if (healthy.length === 0) {
    const allQuotaOrBlocked = states.every(
      (s) => !s.inBudget || s.cooldown.kind === "quota" || s.cooldown.kind === "blocked",
    );
    if (allQuotaOrBlocked) {
      throw new MailBudgetExceededError();
    }
    // Transient cooldown on a channel while budget remains: try the one with shortest cooldown once.
    candidates = [...states].sort((a, b) => (a.cooldown.ttlSeconds ?? 0) - (b.cooldown.ttlSeconds ?? 0));
  }

  let lastErr: unknown;
  let allAttemptedQuota = true;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    const ch = candidate.ch;
    const isFailover = candidate.index > 0 || i > 0;
    try {
      await sendViaChannel(ch, message, mailCfg, signature, e);
      if (!singleOtpEnvOnly) {
        void countChannelEmail(ch, ch.dailyBudget);
      }
      if (candidate.cooldown.active) {
        void clearChannelCooldown(ch);
      }
      if (isFailover) {
        logger.info(
          {
            event: "mail_failover_succeeded",
            channelId: ch.id,
            transport: ch.transport,
            host: ch.host,
            priority,
          },
          `Delivered ${priority} e-mail via failover channel (${ch.label || ch.host})`,
        );
      }
      return {
        channelId: ch.id,
        transport: ch.transport,
        host: ch.host,
        failoverUsed: isFailover,
      };
    } catch (err) {
      lastErr = err;
      const classification = classifyMailError(err);
      if (classification.diagnosticCode !== "QUOTA_EXCEEDED") {
        allAttemptedQuota = false;
      }
      if (!singleOtpEnvOnly && !classification.recipientError && classification.cooldownKind && classification.ttlSeconds) {
        await setChannelCooldown(
          ch,
          classification.cooldownKind,
          classification.safeMessage,
          classification.ttlSeconds,
        );
      }
      logger.warn(
        {
          event: "mail_channel_attempt_failed",
          channelId: ch.id,
          transport: ch.transport,
          host: ch.host,
          code: classification.diagnosticCode,
          willFailover: i + 1 < candidates.length && !classification.recipientError,
          err: sanitizeSecretText((err as Error).message || String(err)),
        },
        `Mail delivery attempt failed on ${ch.id} (${ch.host})`,
      );
      if (classification.recipientError) {
        throw err;
      }
    }
  }

  if (priority !== "otp" && allAttemptedQuota) {
    throw new MailBudgetExceededError();
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Mail delivery failed"));
}

async function deliver(mail: SendMailOptions, priority: MailPriority): Promise<void> {
  await deliverWithOutcome(mail, priority);
}

/** Sends a live test e-mail targeting either a specific channel or full auto-failover routing. */
export async function sendChannelTestEmail(
  target: MailChannelId | "auto",
  to: string,
): Promise<MailDeliveryOutcome> {
  const e = env();
  const { mail: mailCfg } = await loadRuntimeConfig(true);
  const signature = getMailConfigSignature();
  const subject = "PSG Tech Recruitment Portal — mail test";
  const body = `This is a live test message from ${mailCfg.primary.fromName || "PSG Tech Recruitment Portal"}.

Delivery target: ${target === "auto" ? "Automatic Primary/Fallback failover" : `Direct channel test (${target})`}
Server origin: ${e.APP_ORIGIN}
Timestamp: ${new Date().toISOString()}`;

  const { text, html } = renderNotificationEmail(subject, body);
  const mail: SendMailOptions = { from: e.MAIL_FROM, to, subject, text, html };

  if (target === "auto") {
    return deliverWithOutcome(mail, "otp");
  }

  const ch = mailCfg[target];
  if (ch.transport === "brevo-api" && !ch.password) {
    throw new Error("Configure a Brevo API key on this channel before testing.");
  }
  if (ch.transport === "smtp" && !ch.host && e.EMAIL_PROVIDER === "smtp") {
    throw new Error("Configure an SMTP host on this channel before testing.");
  }

  try {
    await sendViaChannel(ch, mail, mailCfg, signature, e);
    void countChannelEmail(ch, ch.dailyBudget);
    await clearChannelCooldown(ch);
    return {
      channelId: ch.id,
      transport: ch.transport,
      host: ch.host,
      failoverUsed: ch.id === "fallback",
    };
  } catch (err) {
    const classification = classifyMailError(err);
    if (!classification.recipientError && classification.cooldownKind && classification.ttlSeconds) {
      await setChannelCooldown(
        ch,
        classification.cooldownKind,
        classification.safeMessage,
        classification.ttlSeconds,
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------
// Templates: one formal layout for every e-mail. Table-based with inline styles so it renders the same
// in Gmail, Outlook and phone mail apps; a plain-text part is always included.
// ---------------------------------------------------------------------------------------------------

const C = {
  ink: "#0f1c2e",
  muted: "#545b66",
  line: "#e3e0d8",
  canvas: "#f4f3ef",
  soft: "#f7f6f2",
  brand: "#a3195b",
  navy: "#10223b",
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ADDRESS = "PSG College of Technology, Avinashi Road, Peelamedu, Coimbatore - 641004";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function helpDeskUrl(): string {
  return `${env().APP_ORIGIN.replace(/\/$/, "")}/help-desk`;
}

/** The no-reply notice that ends every e-mail (plain text). */
function textFooter(): string {
  return `----------------------------------------
This e-mail was sent from an unattended address. Replies are not read.
For any question, please raise a ticket at the Help desk: ${helpDeskUrl()}

PSG College of Technology, Coimbatore - Staff Recruitment
${ADDRESS}`;
}

function layout(opts: { title: string; preheader: string; body: string }): string {
  const help = helpDeskUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.canvas};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.line};border-radius:6px;">
<tr><td style="height:4px;background:${C.brand};border-radius:6px 6px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 40px 20px;border-bottom:1px solid ${C.line};">
<p style="margin:0;font-family:${SERIF};font-size:18px;font-weight:bold;color:${C.navy};letter-spacing:0.3px;">PSG College of Technology, Coimbatore</p>
<p style="margin:4px 0 0;font-family:${SANS};font-size:12px;color:${C.muted};letter-spacing:1.2px;text-transform:uppercase;">Staff Recruitment</p>
</td></tr>
<tr><td style="padding:32px 40px 8px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.ink};">
${opts.body}
</td></tr>
<tr><td style="padding:24px 40px 32px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid ${C.line};padding-top:20px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">
This e-mail was sent from an unattended address. Replies are not read.<br>
For any question, please raise a ticket at the <a href="${esc(help)}" style="color:${C.brand};text-decoration:underline;">Help desk</a>.
</td></tr></table>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.muted};text-align:center;">${ADDRESS}</p>
</td></tr>
</table>
</body>
</html>`;
}

/** Sign-in / verification code e-mail. */
export function renderOtpEmail(
  code: string,
  purpose: string,
  minutes: number,
): { subject: string; text: string; html: string } {
  const subject = `${code} is your PSG Tech recruitment verification code`;

  const text = `PSG COLLEGE OF TECHNOLOGY, COIMBATORE
Staff Recruitment

Your verification code for ${purpose}:

    ${code}

The code expires in ${minutes} minutes and can be used only once.
Never share this verification code with anyone. College staff will never ask for it.
If you did not request it, you can safely ignore this e-mail.

${textFooter()}`;

  const html = layout({
    title: `${code} - PSG Tech recruitment verification code`,
    preheader: `Your verification code is ${code}. It expires in ${minutes} minutes.`,
    body: `<p style="margin:0 0 6px;font-family:${SERIF};font-size:22px;color:${C.navy};">Verification code</p>
<p style="margin:0 0 24px;color:${C.muted};">Use this code for ${esc(purpose)} on the recruitment portal.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td align="center" style="background:${C.soft};border:1px solid ${C.line};border-radius:4px;padding:22px 12px;">
<span style="font-family:Consolas,'SFMono-Regular',Menlo,'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:${C.navy};">${code}</span>
</td></tr></table>
<p style="margin:16px 0 24px;font-size:13px;color:${C.muted};text-align:center;">Valid for <strong style="color:${C.ink};">${minutes} minutes</strong> &middot; single use</p>
<p style="margin:0 0 8px;font-size:13px;color:${C.muted};">Never share this code with anyone. College staff will never ask for it.</p>
<p style="margin:0;font-size:13px;color:${C.muted};">If you did not request it, you can safely ignore this e-mail.</p>`,
  });

  return { subject, text, html };
}

/** Notification e-mail: the plain-text body becomes paragraphs in the same layout. */
export function renderNotificationEmail(subject: string, body: string): { text: string; html: string } {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;">${esc(p)
          .replace(/\n/g, "<br>")
          .replace(
            /(https?:\/\/[^\s<]+)/g,
            `<a href="$1" style="color:${C.brand};text-decoration:underline;word-break:break-all;">$1</a>`,
          )}</p>`,
    )
    .join("\n");
  return {
    text: `${body.trim()}\n\n${textFooter()}`,
    html: layout({
      title: subject,
      preheader: body.trim().split("\n")[0]?.slice(0, 120) ?? subject,
      body: `<p style="margin:0 0 20px;font-family:${SERIF};font-size:20px;color:${C.navy};">${esc(subject)}</p>\n${paragraphs}`,
    }),
  };
}

/**
 * Sends a one-time code directly (not through the outbox) so the code is never stored in the
 * notifications table.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: string,
  minutes: number,
): Promise<void> {
  const e = env();
  const { subject, text, html } = renderOtpEmail(code, purpose, minutes);

  try {
    await deliver({ from: e.MAIL_FROM, to, subject, text, html }, "otp");
  } catch (err) {
    const msg = sanitizeSecretText((err as Error).message || String(err));
    logger.error(
      {
        event: "mail_send_failed",
        toDomain: to.split("@")[1] ?? "unknown",
        purpose,
        hint: smtpFailureHint(err),
        err: msg,
      },
      "Failed to deliver OTP email",
    );
    throw new Error(
      "The verification code could not be sent to your e-mail address. Please try again shortly.",
      { cause: err },
    );
  }
}

/** Sends a notification. Bodies never contain application answers or documents. */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  body: string,
  priority: "critical" | "routine" = "routine",
): Promise<void> {
  const e = env();
  const { text, html } = renderNotificationEmail(subject, body);
  await deliver({ from: e.MAIL_FROM, to, subject, text, html }, priority);
}
