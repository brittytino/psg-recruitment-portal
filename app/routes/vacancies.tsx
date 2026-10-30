import { originFrom, seo } from "~/lib/seo";
import { jsonLd } from "~/lib/json-ld";
import { Form, Link } from "react-router";
import { Search, X } from "lucide-react";
import type { Route } from "./+types/vacancies";
import { VacancyCard } from "~/components/vacancy-card";
import { EmptyState } from "~/components/staff";
import { POSITION_LABELS } from "~/lib/labels";
import { listDepartments, listPublishedVacancies } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = ({ matches }) =>
  seo({
    title: "Open vacancies — faculty and research positions",
    description:
      "Current faculty and research openings at PSG College of Technology, Coimbatore, with departments, eligibility and closing dates. Apply online.",
    path: "/vacancies",
    origin: originFrom(matches),
  });

const FACULTY_POSITIONS = ["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const position = url.searchParams.get("position") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const [vacancies, departments] = await Promise.all([
    listPublishedVacancies({
      departmentId: departmentId && /^[0-9a-f-]{36}$/.test(departmentId) ? departmentId : undefined,
      position:
        position && (FACULTY_POSITIONS as readonly string[]).includes(position) ? position : undefined,
      recruitmentCategory: category === "FACULTY" || category === "RESEARCH" ? category : undefined,
      q,
    }),
    listDepartments(),
  ]);
  return {
    vacancies,
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    departmentId: departmentId ?? "",
    position: position ?? "",
    category: category ?? "",
    q: q ?? "",
  };
}

export default function Vacancies({ loaderData }: Route.ComponentProps) {
  const { vacancies, departments, departmentId, position, category, q } = loaderData;
  const filtered = !!(departmentId || position || category || q);
  const qs = (c: string) => {
    const p = new URLSearchParams();
    if (c) p.set("category", c);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/vacancies${s ? `?${s}` : ""}`;
  };

  return (
    <div className="page-stack">
      {vacancies.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "PSG College of Technology Faculty and Research Vacancies",
              itemListElement: vacancies.map((v, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: v.title,
                url: `/vacancies/${encodeURIComponent(v.code)}`,
              })),
            }),
          }}
        />
      )}
      <header className="max-w-3xl">
        <p className="eyebrow">Careers at PSG Tech</p>
        <h1 className="mt-2">Open vacancies</h1>
        <p className="mt-2 text-muted">
          Faculty and research positions currently accepting applications. Choose a vacancy to read the
          eligibility and apply online.
        </p>
      </header>

      <div className="space-y-4">
        <nav aria-label="Category" className="flex flex-wrap gap-2">
          {(
            [
              ["", "All"],
              ["FACULTY", "Faculty"],
              ["RESEARCH", "Research"],
            ] as const
          ).map(([k, label]) => (
            <Link
              key={k}
              to={qs(k)}
              aria-current={category === k ? "page" : undefined}
              className="chip px-4 py-1.5 text-sm aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>

        <Form
          method="get"
          role="search"
          aria-label="Filter vacancies"
          className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-paper p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[2fr_1.4fr_1.2fr_auto]"
        >
          {category && <input type="hidden" name="category" value={category} />}
          <div className="relative">
            <label htmlFor="q" className="sr-only">
              Keyword
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Position, department or research area"
              className="field-input pl-9"
            />
          </div>
          <div>
            <label htmlFor="department" className="sr-only">
              Department
            </label>
            <select id="department" name="department" defaultValue={departmentId} className="field-input">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="position" className="sr-only">
              Position
            </label>
            <select id="position" name="position" defaultValue={position} className="field-input">
              <option value="">All positions</option>
              {FACULTY_POSITIONS.map((k) => (
                <option key={k} value={k}>
                  {POSITION_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-1">
            Search
          </button>
        </Form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          <strong className="text-ink">{vacancies.length}</strong>{" "}
          {vacancies.length === 1 ? "vacancy" : "vacancies"}
          {filtered ? " match your search" : " open"}
        </p>
        {filtered && (
          <Link to="/vacancies" className="chip">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
          </Link>
        )}
      </div>

      {vacancies.length === 0 ? (
        <EmptyState title={filtered ? "No vacancies match your search" : "No vacancies are open right now"}>
          {filtered ? (
            <Link to="/vacancies">Clear the filters</Link>
          ) : (
            "New openings are published here and in the official notification."
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {vacancies.map((v) => (
            <li key={v.id}>
              <VacancyCard v={v} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
