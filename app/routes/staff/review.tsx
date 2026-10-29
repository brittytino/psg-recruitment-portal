import { Form, Link, redirect, useSearchParams } from "react-router";
import type { Position, Prisma } from "@prisma/client";
import type { Route } from "./+types/review";
import { Badge, formatDate, statusTone } from "~/components/forms";
import { EmptyState, FilterSelect, PageHeader, StatTile, Tabs } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { isHodReviewer } from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";
import { hodScope } from "~/modules/reviews/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Department review — PSG Tech Recruitment" }];

const TABS = [
  ["pending", "Waiting for your decision"],
  ["decided", "Decided"],
  ["all", "All"],
] as const;

const POSITION_FILTER_OPTIONS = [
  ["ASSISTANT_PROFESSOR", "Assistant Professor"],
  ["ASSOCIATE_PROFESSOR", "Associate Professor"],
  ["PROFESSOR", "Professor"],
] as const;

const PHD_FILTER_OPTIONS = [
  ["Awarded", "Awarded"],
  ["Thesis submitted", "Thesis submitted"],
  ["Pursuing", "Pursuing"],
  ["Not applicable", "Not applicable"],
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "application:list");
  if (!isHodReviewer(user.grants)) throw redirect("/staff");

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() || "";
  const pos = url.searchParams.get("position")?.trim() || "";
  const phd = url.searchParams.get("phd")?.trim() || "";
  const rawTab = url.searchParams.get("tab")?.trim() || "pending";
  const tab = (TABS.find(([k]) => k === rawTab)?.[0] ?? "pending") as (typeof TABS)[number][0];

  const baseScope = hodScope(user);

  // Overall department counts for summary tiles & tab badges
  const [totalCount, pendingCount, decidedCount, acceptedCount, otherDecidedCount] = await Promise.all([
    prisma.application.count({ where: baseScope }),
    prisma.application.count({ where: { AND: [baseScope, { status: "ASSIGNED_TO_HOD" }] } }),
    prisma.application.count({ where: { AND: [baseScope, { status: { not: "ASSIGNED_TO_HOD" } }] } }),
    prisma.application.count({ where: { AND: [baseScope, { hodDecision: "ACCEPT" }] } }),
    prisma.application.count({
      where: { AND: [baseScope, { hodDecision: { in: ["RECOMMEND_CHANGE", "REJECT"] } }] },
    }),
  ]);

  // Composable filter query
  const andClauses: Prisma.ApplicationWhereInput[] = [baseScope];

  if (tab === "pending") {
    andClauses.push({ status: "ASSIGNED_TO_HOD" });
  } else if (tab === "decided") {
    andClauses.push({ status: { not: "ASSIGNED_TO_HOD" } });
  }

  if (pos && (pos === "ASSISTANT_PROFESSOR" || pos === "ASSOCIATE_PROFESSOR" || pos === "PROFESSOR")) {
    const positionEnum = pos as Position;
    andClauses.push({
      OR: [{ appliedPosition: positionEnum }, { appliedPosition: null, vacancy: { position: positionEnum } }],
    });
  }

  if (phd) {
    andClauses.push({
      currentRevision: { phdStatus: phd },
    });
  }

  if (search) {
    andClauses.push({
      OR: [
        { referenceNo: { contains: search, mode: "insensitive" } },
        { currentRevision: { candidateName: { contains: search, mode: "insensitive" } } },
        {
          currentRevision: {
            qualifications: {
              some: { degree: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ],
    });
  }

  const apps = await prisma.application.findMany({
    where: { AND: andClauses },
    orderBy: [{ status: "asc" }, { referenceNo: "asc" }],
    select: {
      id: true,
      referenceNo: true,
      status: true,
      appliedPosition: true,
      effectivePosition: true,
      hodDecision: true,
      assignedAt: true,
      vacancy: {
        select: { position: true, researchPositionTitle: true, department: { select: { name: true } } },
      },
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

  const departmentRecords = await prisma.department.findMany({
    where: { applications: { some: baseScope } },
    select: { name: true },
    distinct: ["name"],
  });
  const departments = departmentRecords.map((d) => d.name);

  return {
    apps,
    name: user.displayName,
    departments,
    counts: {
      total: totalCount,
      pending: pendingCount,
      decided: decidedCount,
      accepted: acceptedCount,
      otherDecided: otherDecidedCount,
    },
    q: {
      search,
      position: pos,
      phd,
      tab,
    },
  };
}

export default function HodReview({ loaderData }: Route.ComponentProps) {
  const { apps, name, departments, counts, q } = loaderData;
  const [params] = useSearchParams();

  const withParams = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") {
        p.delete(k);
      } else {
        p.set(k, String(v));
      }
    }
    return `?${p.toString()}`;
  };

  const chips: [string, string][] = [];
  if (q.search) chips.push(["q", `Search: “${q.search}”`]);
  if (q.position) chips.push(["position", POSITION_LABELS[q.position as Position] ?? q.position]);
  if (q.phd) chips.push(["phd", `Ph.D.: ${q.phd}`]);

  return (
    <div className="page-stack">
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
        <StatTile label="Assigned to you" value={counts.total} />
        <StatTile label="Waiting for decision" value={counts.pending} tone="bg-tile-orange/40" />
        <StatTile label="Accepted" value={counts.accepted} tone="bg-tile-green/50" />
        <StatTile label="Position change / rejected" value={counts.otherDecided} tone="bg-tile-purple/50" />
      </section>

      {counts.pending === 0 && counts.total > 0 && (
        <div className="rounded-2xl bg-success-50 p-4 text-[15px] ring-1 ring-green-200">
          All applications are decided.{" "}
          <Link to="/staff/summary" className="font-semibold text-brand-700 underline">
            Generate and approve your summary sheet
          </Link>
          .
        </div>
      )}

      {/* Filter form */}
      <Form method="get" className="card space-y-4">
        <input type="hidden" name="tab" value={q.tab} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <label htmlFor="f-q" className="block text-sm font-semibold">
              Search candidate
            </label>
            <input
              id="f-q"
              type="search"
              name="q"
              defaultValue={q.search}
              placeholder="Name, ref no., degree…"
              className="field-input mt-1"
            />
          </div>
          <FilterSelect
            name="position"
            label="Applied position"
            value={q.position}
            options={POSITION_FILTER_OPTIONS}
            allLabel="All positions"
          />
          <FilterSelect
            name="phd"
            label="Ph.D. status"
            value={q.phd}
            options={PHD_FILTER_OPTIONS}
            allLabel="All Ph.D. statuses"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Apply filters
            </button>
            {(q.search || q.position || q.phd) && (
              <Link
                to={withParams({ q: null, position: null, phd: null })}
                className="btn-secondary whitespace-nowrap"
              >
                Reset
              </Link>
            )}
          </div>
        </div>

        {/* Active filter badges & count */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted">
              {apps.length} application{apps.length === 1 ? "" : "s"} found
            </span>
            {chips.map(([k, label]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200"
              >
                {label}
                <Link
                  to={withParams({ [k]: null })}
                  className="ml-0.5 text-brand-600 hover:text-danger"
                  aria-label={`Remove filter ${label}`}
                >
                  ✕
                </Link>
              </span>
            ))}
          </div>
          {chips.length > 0 && (
            <Link
              to={withParams({ q: null, position: null, phd: null })}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Clear all filters
            </Link>
          )}
        </div>
      </Form>

      <Tabs
        items={TABS.map(([k, l]) => ({
          to: withParams({ tab: k }),
          label: l,
          active: k === q.tab,
          count: k === "pending" ? counts.pending : k === "decided" ? counts.decided : counts.total,
        }))}
      />

      {apps.length === 0 ? (
        <EmptyState
          title={
            chips.length > 0
              ? "No applications match your filter criteria"
              : q.tab === "pending"
                ? "Nothing is waiting for your decision"
                : "No applications here yet"
          }
        >
          {chips.length > 0 ? (
            <p>
              Try clearing some filters or searching with different keywords.{" "}
              <Link
                to={withParams({ q: null, position: null, phd: null })}
                className="font-medium text-brand-700 underline"
              >
                Clear all filters
              </Link>
            </p>
          ) : (
            <p>Applications appear here when the Admin or HR – N4 Section assigns them to you.</p>
          )}
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
              {apps.map((a) => {
                const r = a.currentRevision;
                const applied = a.appliedPosition ?? a.vacancy.position;
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap font-mono text-sm">{a.referenceNo}</td>
                    <td className="font-semibold">{r?.candidateName}</td>
                    <td className="whitespace-nowrap">
                      {applied
                        ? (POSITION_LABELS[applied] ?? applied)
                        : (a.vacancy.researchPositionTitle ?? "Research Assistant")}
                    </td>
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
                        state={{ back: `/staff/review${withParams({})}` }}
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
