import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { countEmail } from "./budget.server";

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
 * Sends through the configured SMTP port; if the network blocks it (common on campus firewalls
 * for 587), retries once over the other Gmail port (465 implicit TLS, or 587 STARTTLS).
 */
async function deliver(mail: SendMailOptions): Promise<void> {
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
 * Builds the accessible, responsive, institutional OTP email content.
 */
export function renderOtpEmail(
  code: string,
  purpose: string,
  minutes: number,
): { subject: string; text: string; html: string } {
  const subject = `${code} is your PSG Tech recruitment verification code`;

  const text = `PSG COLLEGE OF TECHNOLOGY, COIMBATORE
Staff Recruitment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your 6-digit one-time password (OTP) for ${purpose} is:

    ${code}

• This verification code expires in ${minutes} minutes and can be used once.
• If you did not request this code, please ignore this e-mail.
• SECURITY WARNING: Never share this verification code with anyone. PSG Tech administrators will never ask for your code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PSG College of Technology, Peelamedu, Coimbatore - 641004
This is an automated system message. Please do not reply to this email.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${code} - PSG Tech Recruitment Verification Code</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f6f8fa;color:#1f2328;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <div style="background-color:#0b2545;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8da9c4;font-weight:600;">PSG College of Technology, Coimbatore</p>
      <h1 style="margin:8px 0 0;font-size:20px;color:#ffffff;font-weight:700;">Staff Recruitment</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1f2328;font-weight:600;">One-Time Verification Code</h2>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#57606a;">
        A request was made to authenticate your account for <strong>${purpose}</strong>. Use the 6-digit code below to proceed:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;padding:16px 28px;background:#f3f6fc;border:2px dashed #0b2545;border-radius:10px;font-family:Consolas,Monaco,'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#0b2545;">
          ${code}
        </div>
      </div>
      <div style="background-color:#fff8e6;border:1px solid #ffe199;border-radius:8px;padding:14px 18px;margin:24px 0;font-size:13px;line-height:1.5;color:#7a4b04;">
        <strong>Important Security Notices:</strong>
        <ul style="margin:6px 0 0;padding-left:20px;">
          <li>This code is valid for <strong>${minutes} minutes</strong> and can only be used once.</li>
          <li>Never share this code with anyone. PSG Tech staff will never ask for your code.</li>
          <li>If you did not request this code, no action is needed; your account remains secure.</li>
        </ul>
      </div>
      <p style="margin:20px 0 0;font-size:13px;color:#656d76;line-height:1.5;">
        PSG College of Technology Staff Recruitment Section<br>
        Avinashi Road, Peelamedu, Coimbatore – 641 004, Tamil Nadu, India
      </p>
    </div>
    <div style="background-color:#f6f8fa;padding:16px 32px;border-top:1px solid #d0d7de;text-align:center;font-size:12px;color:#8c959f;">
      This is an automated institutional message. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Sends a one-time code directly (not through the outbox) so the code is never stored in the
 * notifications table. Plain-text and accessible HTML parts.
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
    await deliver({ from: e.MAIL_FROM, to, subject, text, html });
    void countEmail();
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

/** Sends a plain-text notification. Bodies never contain application answers or documents. */
export async function sendNotificationEmail(to: string, subject: string, body: string): Promise<void> {
  const e = env();
  await deliver({
    from: e.MAIL_FROM,
    to,
    subject,
    text: `${body}\n\n—\nPSG College of Technology, Coimbatore — Staff Recruitment\nThis is an automated message. Please do not reply.`,
  });
}
