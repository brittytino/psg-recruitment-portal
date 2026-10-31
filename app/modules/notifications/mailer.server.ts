import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { countEmail, hasRoom, type MailPriority } from "./budget.server";

/** Today's e-mail budget is used up. The caller keeps the message in the app. */
export class MailBudgetExceededError extends Error {
  constructor() {
    super("Daily e-mail budget reached");
    this.name = "MailBudgetExceededError";
  }
}

let transport: Transporter | undefined;

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
    | "UNKNOWN_ERROR";
  message: string;
  provider: string;
  details?: string;
}

/** Resets the cached transporter (for test isolation). */
export function resetTransporterForTesting(): void {
  if (transport) {
    try {
      transport.close();
    } catch {
      // ignore
    }
  }
  transport = undefined;
  fallback = undefined;
}

/** Centralized transporter getter with connection pooling and timeouts. */
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
      // Institutional SMTP provider (production)
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

let fallback: Transporter | undefined;

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
    ].includes(e.code ?? "") || /timed? ?out|ECONNREFUSED|ECONNRESET/i.test(e.message ?? "")
  );
}

/** Explains a send failure in the server log so the IT team can act on it. */
export function smtpFailureHint(err: unknown): string {
  const e = err as { code?: string; responseCode?: number };
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534)
    return "Gmail rejected the login: the app password is wrong or revoked. Run: sudo ./prod.sh smtp-password";
  if (isConnectionError(err))
    return "Cannot connect to the mail server: outbound TCP 587/465 is blocked by the firewall. Run: ./prod.sh mailtest";
  if (e.code === "EDNS") return "DNS lookup of the mail server failed on this server.";
  return "Run ./prod.sh mailtest for a diagnosis.";
}

/**
 * Sends through the configured SMTP port; if the network blocks it (common on campus firewalls for
 * 587), retries once over the other port (465 implicit TLS, or 587).
 */
async function deliverSmtp(mail: SendMailOptions): Promise<void> {
  const e = env();
  try {
    await getTransporter().sendMail(mail);
    return;
  } catch (err) {
    if (e.EMAIL_PROVIDER !== "smtp" || !isConnectionError(err)) throw err;
    logger.warn(
      { event: "mail_port_fallback", port: e.SMTP_PORT, err: (err as Error).message },
      "mail server port unreachable, trying the other port",
    );
  }
  if (!fallback) {
    const port = e.SMTP_PORT === 465 ? 587 : 465;
    fallback = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port,
      secure: port === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
      connectionTimeout: e.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: e.SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: e.SMTP_SOCKET_TIMEOUT_MS,
      tls: { rejectUnauthorized: e.NODE_ENV === "production" },
    });
  }
  await fallback.sendMail(mail);
}

/** Diagnostic check for SMTP connectivity without sending actual emails. */
export async function verifySmtpConnection(timeoutMs = 5000): Promise<SmtpDiagnosticResult> {
  const e = env();
  const provider = e.EMAIL_PROVIDER;

  if (provider === "test") {
    return {
      ok: true,
      code: "OK",
      provider: "test",
      message: "Test email provider active.",
    };
  }

  const t = getTransporter();

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
    const error = err as { code?: string; message?: string; responseCode?: number };
    const errMsg = error.message || String(err);
    const errCode = error.code || "";

    let code: SmtpDiagnosticResult["code"] = "UNKNOWN_ERROR";
    let safeMessage = "SMTP connection check failed.";

    if (errCode === "EDNS" || errMsg.includes("ENOTFOUND") || errMsg.includes("getaddrinfo")) {
      code = "DNS_LOOKUP";
      safeMessage = "DNS resolution failed for the configured mail server.";
    } else if (errCode === "ETIMEDOUT" || errMsg.includes("timed out") || errMsg.includes("timeout")) {
      code = "TIMEOUT";
      safeMessage = "Connection to the mail server timed out.";
    } else if (errCode === "EAUTH" || error.responseCode === 535 || errMsg.includes("authentication")) {
      code = "AUTH_FAILED";
      safeMessage = "Authentication failed with the mail server.";
    } else if (
      errCode === "ESOCKET" ||
      errMsg.includes("self-signed") ||
      errMsg.includes("TLS") ||
      errMsg.includes("certificate")
    ) {
      code = "TLS_ERROR";
      safeMessage = "TLS negotiation or certificate validation failed.";
    } else if (errCode === "ECONNREFUSED" || errMsg.includes("ECONNREFUSED")) {
      code = "CONNECTION_REFUSED";
      safeMessage = "Connection refused by the mail server.";
    }

    logger.error(
      {
        event: "mail_check_failed",
        provider,
        code,
        diagnostic: safeMessage,
        rawMessage: errMsg.replace(/pass(?:word)?\s*[:=]\s*\S+/gi, "password: ***"),
      },
      "SMTP verification error",
    );

    return {
      ok: false,
      code,
      provider,
      message: safeMessage,
      details: errMsg,
    };
  }
}

/**
 * Sends one e-mail through the SMTP mailbox while today's budget has room for this priority (sign-in
 * codes always go out). Mailpit / test providers have no budget.
 */
async function deliver(mail: SendMailOptions, priority: MailPriority): Promise<void> {
  const e = env();
  const message: SendMailOptions = {
    ...mail,
    // Ask mail servers not to send out-of-office or other automatic replies to this mailbox.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All", ...mail.headers },
  };
  if (e.EMAIL_PROVIDER !== "smtp") {
    await getTransporter().sendMail(message);
    return;
  }
  if (!(await hasRoom(priority))) throw new MailBudgetExceededError();
  await deliverSmtp(message);
  void countEmail();
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
    const msg = (err as Error).message || String(err);
    logger.error(
      {
        event: "mail_send_failed",
        toDomain: to.split("@")[1] ?? "unknown",
        purpose,
        hint: smtpFailureHint(err),
        err: msg.replace(/pass(?:word)?(?:\s+is|\s*[:=])\s*\S+/gi, "password: ***"),
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
