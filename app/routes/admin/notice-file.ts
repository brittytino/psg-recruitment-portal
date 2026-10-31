import { Readable } from "node:stream";
import type { Route } from "./+types/notice-file";
import { fileHeaders } from "~/lib/file-response.server";
import { requireStaff } from "~/lib/http.server";
import { openStoredFile } from "~/modules/documents/storage.server";
import { noticeFile } from "~/modules/notices/service.server";

/** Staff: an uploaded open-positions PDF (active or hidden), viewed in the dialog or downloaded. */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "notice:manage");
  const n = await noticeFile(user, params.id);
  const file = await openStoredFile(n.storageKey);
  if (!file) throw new Response("This file is temporarily unavailable.", { status: 404 });
  return new Response(Readable.toWeb(file.stream) as ReadableStream, {
    headers: fileHeaders(request, {
      mimeType: "application/pdf",
      size: file.size,
      downloadName: n.originalName,
    }),
  });
}
