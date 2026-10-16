import { Form, Link } from "react-router";
import type { Route } from "./+types/vacancies";
import { VacancyCard } from "~/components/vacancy-card";
import { POSITION_LABELS } from "~/lib/labels";
import { listDepartments, listPublishedVacancies } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Open vacancies — PSG Tech Careers" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const position = url.searchParams.get("position") || undefined;
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const [vacancies, departments] = await Promise.all([
    listPublishedVacancies({
      departmentId: departmentId && /^[0-9a-f-]{36}$/.test(departmentId) ? departmentId : undefined,
      position: position && position in POSITION_LABELS ? position : undefined,
      q,
    }),
    listDepartments(),
  ]);
  return { vacancies, departments, departmentId: departmentId ?? "", position: position ?? "", q: q ?? "" };
}

export default function Vacancies({ loaderData }: Route.ComponentProps) {
  const { vacancies, departments, departmentId, position, q } = loaderData;
  const filtered = !!(departmentId || position || q);
  return (
    <div className="space-y-8">
      <section className="hero-gradient rounded-[2rem] px-6 py-10 sm:px-10">
        <p className="eyebrow">Careers</p>
        <h1 className="mt-1">Find your position 🔎</h1>
        <p className="mt-2 max-w-xl text-muted">
          Browse faculty vacancies across departments and apply with the official application form.
        </p>
        <Form
          method="get"
          role="search"
          aria-label="Filter vacancies"
          className="mt-6 grid gap-3 rounded-3xl bg-white p-3 shadow-[var(--shadow-float)] md:grid-cols-[2fr_1.3fr_1fr_auto]"
        >
          <div>
            <label htmlFor="q" className="sr-only">
              Keyword
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="🔍  Position, department or code"
              className="field-input"
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
              {Object.entries(POSITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </Form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          <strong className="text-ink">{vacancies.length}</strong>{" "}
          {vacancies.length === 1 ? "vacancy" : "vacancies"} found
        </p>
        {filtered && (
          <Link to="/vacancies" className="chip no-underline hover:bg-soft">
            ✕ Clear filters
          </Link>
        )}
      </div>

      {vacancies.length === 0 ? (
        <div className="card text-center">
          <p className="text-4xl" aria-hidden="true">
            🧐
          </p>
          <p className="mt-2 font-semibold">No vacancies match your search</p>
          <p className="text-sm text-muted">Try another keyword or clear the filters.</p>
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
