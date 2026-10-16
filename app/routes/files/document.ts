import { Readable } from "node:stream";
import type { Route } from "./+types/document";
import { requireUser } from "~/lib/http.server";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { authorizeDocumentDownload } from "~/modules/documents/service.server";
import { streamFile } from "~/modules/documents/storage.server";

/** Authorised download of an uploaded attachment. Unknown and unauthorised ids both return 404. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  if (!/^[0-9a-f-]{36}$/.test(params.id)) throw new Response("Not found", { status: 404 });
  const doc = await authorizeDocumentDownload(user, params.id, clientIp(request)).catch(() => null);
  if (!doc) throw new Response("Not found", { status: 404 });
  const ext = doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType === "image/png" ? "png" : "jpg";
  return new Response(Readable.toWeb(streamFile(doc.storageKey)) as ReadableStream, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.sizeBytes),
      // Generic file name: no personal data in headers, and the browser downloads instead of rendering.
      "Content-Disposition": `attachment; filename="document-${doc.id.slice(0, 8)}.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
