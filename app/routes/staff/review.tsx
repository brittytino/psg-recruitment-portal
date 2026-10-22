import { Link, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/review";
import { Badge, formatDate, statusTone } from "~/components/forms";
import { EmptyState, PageHeader, StatTile, Tabs } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { isHodReviewer } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";
import { hodScope } from "~/modules/reviews/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Department review — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  if (!isHodReviewer(user.grants)) throw redirect("/staff");
  const apps = await prisma.application.findMany({
    where: hodScope(user),
    orderBy: [{ status: "asc" }, { referenceNo: "asc" }],
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      effectivePosition: true,
      hodDecision: true,
      assignedAt: true,
      vacancy: { select: { position: true, department: { select: { name: true } } } },
      currentRevision: {
        select: {
          candidateName: true,
          phdStatus: true,
          totalExperienceMonths: true,
          journalCount: true,
          hIndex: true,
          qualifications: {
            where: { category: "COLLEGE" },
            orderBy: { sortOrder: "desc" },
            take: 1,
            select: { degree: true },
          },
        },
      },
    },
  });
  return { apps, name: user.displayName };
}

const TABS = [
  ["pending", "Waiting for your decision"],
  ["decided", "Decided"],
  ["all", "All"],
] as const;

export default function HodReview({ loaderData }: Route.ComponentProps) {
  const { apps, name } = loaderData;
  const [params] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "pending") as (typeof TABS)[number][0];
  const pending = apps.filter((a) => a.status === "ASSIGNED_TO_HOD");
  const decided = apps.filter((a) => a.status !== "ASSIGNED_TO_HOD");
  const rows = tab === "pending" ? pending : tab === "decided" ? decided : apps;
  const departments = [...new Set(apps.map((a) => a.vacancy.department.name))];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`HOD${departments.length ? ` · ${departments.join(", ")}` : ""}`}
        title="Department review"
        description={`Welcome, ${name}. Open each application, then accept it, recommend a different position or reject it. When every application is decided, approve your summary sheet.`}
        actions={
          <Link to="/staff/summary" className="btn-primary">
            Summary sheet
          </Link>
        }
      />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totals">
        <StatTile label="Assigned to you" value={apps.length} />
        <StatTile label="Waiting for decision" value={pending.length} tone="bg-tile-orange/40" />
        <StatTile
          label="Accepted"
          value={apps.filter((a) => a.hodDecision === "ACCEPT").length}
          tone="bg-tile-green/50"
        />
        <StatTile
          label="Position change / rejected"
          value={apps.filter((a) => a.hodDecision && a.hodDecision !== "ACCEPT").length}
          tone="bg-tile-purple/50"
        />
      </section>
      {pending.length === 0 && apps.length > 0 && (
        <div className="rounded-2xl bg-success-50 p-4 text-[15px] ring-1 ring-green-200">
          All applications are decided.{" "}
          <Link to="/staff/summary">Generate and approve your summary sheet</Link>.
        </div>
      )}
      <Tabs
        items={TABS.map(([k, l]) => ({
          to: `?tab=${k}`,
          label: l,
          active: k === tab,
          count: k === "pending" ? pending.length : k === "decided" ? decided.length : apps.length,
        }))}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Nothing is waiting for your decision" : "No applications here yet"}
        >
          Applications appear here when the Admin or HR – N4 Section assigns them to you.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption className="sr-only">Applications assigned to you</caption>
            <thead>
              <tr>
                <th scope="col">Reference No.</th>
                <th scope="col">Candidate</th>
                <th scope="col">Applied for</th>
                <th scope="col">Highest degree</th>
                <th scope="col">Ph.D.</th>
                <th scope="col" className="text-right">
                  Experience
                </th>
                <th scope="col" className="text-right">
                  Journals
                </th>
                <th scope="col" className="text-right">
                  h-index
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const r = a.currentRevision;
                const applied = a.appliedPosition ?? a.vacancy.position;
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap font-mono text-sm">{a.referenceNo}</td>
                    <td className="font-semibold">{r?.candidateName}</td>
                    <td className="whitespace-nowrap">{POSITION_LABELS[applied]}</td>
                    <td>{r?.qualifications[0]?.degree ?? "—"}</td>
                    <td>{r?.phdStatus ?? "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      {r?.totalExperienceMonths != null
                        ? formatYearsMonths(splitMonths(r.totalExperienceMonths))
                        : "—"}
                    </td>
                    <td className="text-right tabular-nums">{r?.journalCount ?? "—"}</td>
                    <td className="text-right tabular-nums">{r?.hIndex ?? "—"}</td>
                    <td>
                      <Badge tone={statusTone(a.status)}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                      <span className="mt-1 block text-xs text-muted">
                        Assigned {formatDate(a.assignedAt)}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={`/staff/applications/${a.id}`}
                        state={{ back: `/staff/review?tab=${tab}` }}
                        className="btn-secondary whitespace-nowrap px-3 py-1.5 text-sm"
                      >
                        {a.status === "ASSIGNED_TO_HOD" ? "Review" : "View"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
