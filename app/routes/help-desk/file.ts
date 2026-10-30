import { Readable } from "node:stream";
import type { Route } from "./+types/file";
import { requireUser } from "~/lib/http.server";
import { audit } from "~/modules/audit/audit.server";
import { hasPermission } from "~/modules/auth/permissions";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { openStoredFile } from "~/modules/documents/storage.server";
import { authorizeAttachment } from "~/modules/helpdesk/service.server";

/**
 * Help desk attachment download. The ticket's own candidate (public messages only) or support
 * staff; anyone else gets 404. Staff downloads are audited.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const a = await authorizeAttachment(user, params.id).catch(() => null);
  if (!a) throw new Response("Not found", { status: 404 });
  const file = await openStoredFile(a.storageKey);
  if (!file) throw new Response("This file is temporarily unavailable.", { status: 404 });
  if (hasPermission(user.grants, "helpdesk:handle"))
    await audit({
      actorId: user.id,
      action: "helpdesk.attachment_downloaded",
      entityType: "support_ticket",
      entityId: a.ticketId,
      ip: clientIp(request),
      metadata: { attachmentId: a.id },
    });
  const ext = a.mimeType === "application/pdf" ? "pdf" : a.mimeType === "image/png" ? "png" : "jpg";
  return new Response(Readable.toWeb(file.stream) as ReadableStream, {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${a.ticket.referenceNo}-${a.id.slice(0, 8)}.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
