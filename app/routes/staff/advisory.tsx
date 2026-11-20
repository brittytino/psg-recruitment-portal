import { Form, Link, useSearchParams } from "react-router";
import { CheckCircle2, Clock, Download, FileText, Scale } from "lucide-react";
import type { Route } from "./+types/advisory";
import { Badge, formatDate, statusTone } from "~/components/forms";
import { EmptyState, FilterSelect, PageHeader, StatTile, Tabs } from "~/components/staff";
import { requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { STATUS_LABELS, type AppStatus } from "~/modules/applications/workflow";
import { ADVISORY_LABELS, type AdvisoryRecommendation } from "~/modules/reviews/advisory-labels";
import { advisoryApplicationList, parseAdvisoryFilters } from "~/modules/reviews/advisory.server";
import { formatYearsMonths, splitMonths } from "~/modules/forms/experience";

export const meta: Route.MetaFunction = () => [
  { title: "Advisory review — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

const TABS = [
  ["awaiting", "Awaiting your opinion"],
  ["reviewed", "Reviewed"],
  ["all", "All"],
] as const;

const POSITION_FILTER_OPTIONS = [
  ["ASSISTANT_PROFESSOR", "Assistant Professor"],
  ["ASSOCIATE_PROFESSOR", "Associate Professor"],
  ["PROFESSOR", "Professor"],
] as const;

const HOD_LABELS: Record<string, string> = {
  ACCEPT: "Accepted",
  RECOMMEND_CHANGE: "Position change",
  REJECT: "Rejected",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "advisory:review");
  const url = new URL(request.url);
  const filters = parseAdvisoryFilters(url.searchParams);

  const { apps, departments, counts } = await advisoryApplicationList(user, {
    tab: filters.tab,
    departmentId: filters.departmentId || undefined,
    position: filters.position || undefined,
    search: filters.search || undefined,
  });

  return {
    apps,
    departments,
    counts,
    q: {
      search: filters.search,
      position: filters.position,
      department: filters.departmentId,
      tab: filters.tab,
    },
  };
}

/** Whole days since a submission date, for a lightweight "waiting N days" flag on the queue. */
function daysWaiting(submittedAt: string | Date | null): number | null {
  if (!submittedAt) return null;
  const ms = Date.now() - new Date(submittedAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export default function AdvisoryIndex({ loaderData }: Route.ComponentProps) {
  const { apps, departments, counts, q } = loaderData;
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

  const departmentOptions = departments.map((d) => [d.id, d.name] as const);
  const departmentName = departments.find((d) => d.id === q.department)?.name;

  const chips: [string, string][] = [];
  if (q.search) chips.push(["q", `Search: “${q.search}”`]);
  if (q.position)
    chips.push(["position", POSITION_LABELS[q.position as keyof typeof POSITION_LABELS] ?? q.position]);
  if (q.department) chips.push(["department", departmentName ?? "Department"]);

  const clearAll = withParams({ q: null, position: null, department: null });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="External advisory"
        title="Advisory review"
        description="Every applicant whose HOD review is complete, across all departments. Read the application and documents, then record your advisory opinion with a rating. Your opinion does not change the application status; the Dean / Principal makes the final decision."
        actions={
          counts.reviewed > 0 && (
            <a href="/staff/advisory/export.csv" className="btn-secondary">
              <Download className="h-4 w-4" aria-hidden="true" /> Export my opinions
            </a>
          )
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Totals">
        <StatTile label="In your scope" value={counts.total} icon={FileText} accent="blue" />
        <StatTile label="Awaiting your opinion" value={counts.awaiting} icon={Clock} accent="orange" />
        <StatTile label="Reviewed by you" value={counts.reviewed} icon={CheckCircle2} accent="green" />
      </section>

      {counts.awaiting === 0 && counts.total > 0 && (
        <div className="rounded-xl bg-success-50 p-4 text-[15px] ring-1 ring-success/25">
          <Scale className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          You have recorded an opinion on every application in scope.
        </div>
      )}

      {/* Filter form */}
      <Form method="get" className="card space-y-4">
        <input type="hidden" name="tab" value={q.tab} />
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            name="department"
            label="Department"
            value={q.department}
            options={departmentOptions}
            allLabel="All departments"
          />
          <FilterSelect
            name="position"
            label="Applied position"
            value={q.position}
            options={POSITION_FILTER_OPTIONS}
            allLabel="All positions"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Apply filters
            </button>
            {(q.search || q.position || q.department) && (
              <Link to={clearAll} className="btn-secondary whitespace-nowrap">
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
            <Link to={clearAll} className="text-xs font-semibold text-brand-700 hover:underline">
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
          count: k === "awaiting" ? counts.awaiting : k === "reviewed" ? counts.reviewed : counts.total,
        }))}
      />

      {apps.length === 0 ? (
        <EmptyState
          title={
            chips.length > 0
              ? "No applications match your filter criteria"
              : q.tab === "awaiting"
                ? "Nothing is waiting for your opinion"
                : "No applications here yet"
          }
        >
          {chips.length > 0 ? (
            <p>
              Try clearing some filters or searching with different keywords.{" "}
              <Link to={clearAll} className="font-medium text-brand-700 underline">
                Clear all filters
              </Link>
            </p>
          ) : (
            <p>Applications appear here once a HOD has decided on them.</p>
          )}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <caption className="sr-only">Applications for advisory review</caption>
            <thead>
              <tr>
                <th scope="col">Reference No.</th>
                <th scope="col">Candidate</th>
                <th scope="col">Department</th>
                <th scope="col">Applied for</th>
                <th scope="col">Highest degree</th>
                <th scope="col" className="text-right">
                  Experience
                </th>
                <th scope="col">HOD decision</th>
                <th scope="col">Status</th>
                <th scope="col">Your opinion</th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const applied = a.appliedPosition;
                return (
                  <tr key={a.id}>
                    <td className="font-mono text-sm whitespace-nowrap">{a.referenceNo}</td>
                    <td className="font-semibold">{a.candidateName}</td>
                    <td className="whitespace-nowrap">{a.department}</td>
                    <td className="whitespace-nowrap">
                      {applied ? (POSITION_LABELS[applied] ?? applied) : "Research"}
                    </td>
                    <td>{a.degree ?? "—"}</td>
                    <td className="text-right whitespace-nowrap">
                      {a.experienceMonths != null ? formatYearsMonths(splitMonths(a.experienceMonths)) : "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {a.hodDecision ? (
                        <>
                          {HOD_LABELS[a.hodDecision] ?? a.hodDecision}
                          {a.hodRating != null && (
                            <span className="ml-1 text-xs text-muted">· {a.hodRating}/5</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge tone={statusTone(a.status)}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                      <span className="mt-1 block text-xs text-muted">
                        Submitted {a.submittedAt ? formatDate(a.submittedAt) : "—"}
                      </span>
                      {!a.myOpinion &&
                        (() => {
                          const days = daysWaiting(a.submittedAt);
                          return days != null && days >= 7 ? (
                            <span className="mt-0.5 block text-xs font-semibold text-warning">
                              Waiting {days} days
                            </span>
                          ) : null;
                        })()}
                    </td>
                    <td className="whitespace-nowrap">
                      {a.myOpinion ? (
                        <Badge tone="success">
                          {ADVISORY_LABELS[a.myOpinion.recommendation as AdvisoryRecommendation] ??
                            a.myOpinion.recommendation}
                          {a.myOpinion.rating != null && (
                            <span className="ml-1">· {a.myOpinion.rating}/5</span>
                          )}
                        </Badge>
                      ) : (
                        <Badge tone="warning">Not yet</Badge>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/staff/advisory/${a.id}${withParams({})}`}
                        state={{ back: `/staff/advisory${withParams({})}` }}
                        className="btn-secondary px-3 py-1.5 text-sm whitespace-nowrap"
                      >
                        {a.myOpinion ? "View" : "Review"}
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
