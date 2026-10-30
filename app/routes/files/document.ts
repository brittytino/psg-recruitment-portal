import { Readable } from "node:stream";
import type { Route } from "./+types/document";
import { fileHeaders } from "~/lib/file-response.server";
import { requireUser } from "~/lib/http.server";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { authorizeDocumentDownload } from "~/modules/documents/service.server";
import { openStoredFile } from "~/modules/documents/storage.server";

/** Authorised download of an uploaded attachment. Unknown and unauthorised ids both return 404. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  if (!/^[0-9a-f-]{36}$/.test(params.id)) throw new Response("Not found", { status: 404 });
  const doc = await authorizeDocumentDownload(user, params.id, clientIp(request)).catch(() => null);
  if (!doc) throw new Response("Not found", { status: 404 });
  const file = await openStoredFile(doc.storageKey);
  if (!file)
    throw new Response("This file is temporarily unavailable. Please contact the recruitment office.", {
      status: 404,
    });
  const ext = doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType === "image/png" ? "png" : "jpg";
  // Generic file name: no personal data in headers. ?view=1 shows it in the document viewer.
  return new Response(Readable.toWeb(file.stream) as ReadableStream, {
    headers: fileHeaders(request, {
      mimeType: doc.mimeType,
      size: file.size,
      downloadName: `document-${doc.id.slice(0, 8)}.${ext}`,
    }),
  });
}
