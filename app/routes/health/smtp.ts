import { verifySmtpConnection } from "~/modules/notifications/mailer.server";

/**
 * Dedicated SMTP health check endpoint (/healthz/smtp).
 * Verifies email transport connectivity without sending actual OTP emails.
 * Never exposes credentials, passwords, or internal network hostnames in responses.
 */
export async function loader() {
  const result = await verifySmtpConnection(5000);
  const ok = result.ok;

  return Response.json(
    {
      status: ok ? "ok" : "error",
      provider: result.provider,
      message: result.message,
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
