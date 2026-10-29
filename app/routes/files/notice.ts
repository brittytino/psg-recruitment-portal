import { Readable } from "node:stream";
import type { Route } from "./+types/notice";
import { currentNotice } from "~/modules/notices/service.server";
import { streamFile } from "~/modules/documents/storage.server";

/** Public: the "Open positions" PDF uploaded by HR – N4 Section, opened inline in the browser. */
export async function loader(_: Route.LoaderArgs) {
  const n = await currentNotice();
  if (!n) throw new Response("No open positions notice has been published yet.", { status: 404 });
  return new Response(Readable.toWeb(streamFile(n.storageKey)) as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(n.sizeBytes),
      "Content-Disposition": `inline; filename="psg-tech-open-positions.pdf"`,
      "Cache-Control": "public, max-age=300",
      ETag: `"${n.sha256.slice(0, 32)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
