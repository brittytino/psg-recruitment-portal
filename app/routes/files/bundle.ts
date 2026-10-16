import { Readable } from "node:stream";
import type { Route } from "./+types/bundle";
import { requireUser } from "~/lib/http.server";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { prisma } from "~/modules/core/db.server";
import { authorizeGeneratedDownload } from "~/modules/documents/service.server";
import { streamFile } from "~/modules/documents/storage.server";

/** Authorised download of a consolidated application PDF (a specific immutable version). */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  if (!/^[0-9a-f-]{36}$/.test(params.id)) throw new Response("Not found", { status: 404 });
  const g = await authorizeGeneratedDownload(user, params.id, clientIp(request)).catch(() => null);
  if (!g || !g.storageKey) throw new Response("Not found", { status: 404 });
  const app = await prisma.application.findUnique({
    where: { id: g.applicationId },
    select: { referenceNo: true },
  });
  const rev = await prisma.applicationRevision.findUnique({
    where: { id: g.revisionId },
    select: { revisionNo: true },
  });
  const name = `${app?.referenceNo ?? "application"}-r${rev?.revisionNo ?? 1}-v${g.version}.pdf`;
  return new Response(Readable.toWeb(streamFile(g.storageKey)) as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(g.sizeBytes ?? ""),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Checksum-SHA256": g.sha256 ?? "",
    },
  });
}
