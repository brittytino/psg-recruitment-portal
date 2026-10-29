import { Readable } from "node:stream";
import type { Route } from "./+types/notice";
import { currentNotice, type NoticeCategory } from "~/modules/notices/service.server";
import { openStoredFile } from "~/modules/documents/storage.server";

/**
 * Public: the "open positions" PDFs uploaded by HR – N4 Section, opened inline in the browser.
 * /open-positions.pdf is the Faculty notice, /research-positions.pdf the Research notice.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const category: NoticeCategory = new URL(request.url).pathname.startsWith("/research")
    ? "RESEARCH"
    : "FACULTY";
  const n = await currentNotice(category);
  if (!n)
    throw new Response(
      `No ${category === "RESEARCH" ? "research" : "faculty"} positions notice has been published yet.`,
      { status: 404 },
    );
  const file = await openStoredFile(n.storageKey);
  if (!file) throw new Response("The notice is temporarily unavailable.", { status: 404 });
  return new Response(Readable.toWeb(file.stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="psg-tech-${category === "RESEARCH" ? "research" : "faculty"}-positions.pdf"`,
      "Cache-Control": "public, max-age=300",
      ETag: `"${n.sha256.slice(0, 32)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
