import type { Route } from "./+types/search";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS } from "~/modules/applications/workflow";
import { staffApplicationScope } from "~/modules/auth/policy.server";
import { prisma } from "~/modules/core/db.server";

/**
 * Instant search for the staff top bar: reference number, candidate name or e-mail. Only
 * applications this person may see (HODs: their department's assigned applications).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (term.length < 2) return Response.json({ results: [] });
  const scope = staffApplicationScope(user);
  if (!scope) return Response.json({ results: [] });
  const rows = await prisma.application.findMany({
    where: {
      AND: [
        scope,
        { status: { not: "DRAFT" } },
        {
          OR: [
            { referenceNo: { contains: term, mode: "insensitive" } },
            { currentRevision: { candidateName: { contains: term, mode: "insensitive" } } },
            { candidate: { email: { contains: term.toLowerCase() } } },
            { candidate: { profile: { fullName: { contains: term, mode: "insensitive" } } } },
          ],
        },
      ],
    },
    orderBy: { submittedAt: "desc" },
    take: 8,
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      currentRevision: { select: { candidateName: true } },
      candidate: { select: { profile: { select: { fullName: true } } } },
      vacancy: {
        select: {
          position: true,
          researchPositionTitle: true,
          department: { select: { code: true } },
          researchSpecialisation: { select: { name: true } },
        },
      },
    },
  });
  const results = rows.map((r) => {
    const pos = r.appliedPosition ?? r.vacancy.position;
    return {
      id: r.id,
      referenceNo: r.referenceNo ?? "—",
      name: r.candidate.profile?.fullName ?? r.currentRevision?.candidateName ?? "Candidate",
      detail: [
        pos ? POSITION_LABELS[pos] : (r.vacancy.researchPositionTitle ?? "Research"),
        r.vacancy.department?.code ?? r.vacancy.researchSpecialisation?.name,
      ]
        .filter(Boolean)
        .join(" · "),
      status: STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status,
    };
  });
  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
