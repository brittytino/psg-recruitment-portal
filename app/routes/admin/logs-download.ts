import type { Route } from "./+types/logs-download";
import { requireStaff } from "~/lib/http.server";
import { audit } from "~/modules/audit/audit.server";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { formatLogText, LOG_CATEGORIES, readLogs, type LogCategory } from "~/modules/settings/logs.server";

/** Downloads one day of system logs (filtered by category / text) as a readable .log file. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "system:manage");
  const sp = new URL(request.url).searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : "";
  if (!date) throw new Response("Choose a day", { status: 400 });
  const cat = sp.get("category");
  const category: LogCategory = cat && cat in LOG_CATEGORIES ? (cat as LogCategory) : "all";
  const search = sp.get("q")?.slice(0, 100) || undefined;
  const { entries } = await readLogs(user, { date, category, search }, 200_000);
  await audit({
    actorId: user.id,
    action: "system.logs_downloaded",
    entityType: "system",
    ip: clientIp(request),
    metadata: { date, category, rows: entries.length },
  });
  const body = formatLogText(
    entries,
    `PSG Tech Recruitment — system logs — ${date} — ${LOG_CATEGORIES[category]}${search ? ` — containing "${search}"` : ""}`,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="psg-recruitment-logs-${date}-${category}.log"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
