import nodemailer, { type Transporter } from "nodemailer";
import { env } from "~/modules/core/env.server";

let transport: Transporter | undefined;

function transporter(): Transporter {
  if (!transport) {
    const e = env();
    transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
    });
  }
  return transport;
}

/**
 * Sends a one-time code directly (not through the outbox) so the code is never stored in the
 * notifications table. Plain-text and simple HTML parts.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: string,
  minutes: number,
): Promise<void> {
  const text = `Your PSG Tech recruitment portal code for ${purpose} is:\n\n    ${code}\n\nThe code expires in ${minutes} minutes and can be used once.\nIf you did not request this, ignore this e-mail; your account is safe.\n\n—\nPSG College of Technology, Coimbatore — Staff Recruitment\nThis is an automated message. Please do not reply.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#121316">
<p style="font-size:13px;color:#5b5f6b;margin:0">PSG College of Technology · Staff Recruitment Portal</p>
<h1 style="font-size:20px">Your code for ${purpose}</h1>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f3f2f6;border-radius:12px;padding:16px;text-align:center">${code}</p>
<p>The code expires in ${minutes} minutes and can be used once.</p>
<p style="color:#5b5f6b;font-size:13px">If you did not request this, ignore this e-mail; your account is safe.</p></div>`;
  await transporter().sendMail({
    from: env().MAIL_FROM,
    to,
    subject: `${code} is your PSG Tech recruitment code`,
    text,
    html,
  });
}

/** Sends a plain-text notification. Bodies never contain application answers or documents. */
export async function sendNotificationEmail(to: string, subject: string, body: string): Promise<void> {
  await transporter().sendMail({
    from: env().MAIL_FROM,
    to,
    subject,
    text: `${body}\n\n—\nPSG College of Technology, Coimbatore — Staff Recruitment\nThis is an automated message. Please do not reply.`,
  });
}
