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

/** Sends a plain-text notification. Bodies never contain application answers or documents. */
export async function sendNotificationEmail(to: string, subject: string, body: string): Promise<void> {
  await transporter().sendMail({
    from: env().MAIL_FROM,
    to,
    subject,
    text: `${body}\n\n—\nPSG College of Technology, Coimbatore — Staff Recruitment\nThis is an automated message. Please do not reply.`,
  });
}
