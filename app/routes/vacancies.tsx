import { Form, Link } from "react-router";
import { motion } from "framer-motion";
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
    <div className="space-y-8 sm:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="hero-gradient rounded-3xl p-6 sm:p-12 lg:p-14 border border-pink-100/60 shadow-[var(--shadow-soft)]"
      >
        <p className="eyebrow">PSG Tech Careers</p>
        <h1 className="mt-2 text-2xl sm:text-4xl lg:text-5xl font-extrabold text-ink">
          Find your faculty position 🔎
        </h1>
        <p className="mt-2.5 sm:mt-3 max-w-2xl text-sm sm:text-lg text-muted leading-relaxed">
          Explore faculty openings across engineering, science, and humanities departments. Apply directly
          online with automatic draft saving.
        </p>

        <Form
          method="get"
          role="search"
          aria-label="Filter vacancies"
          className="mt-6 sm:mt-8 grid gap-3 rounded-2xl sm:rounded-3xl bg-white p-3 sm:p-4 shadow-[var(--shadow-float)] border border-line/70 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1.2fr_auto]"
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
              placeholder="🔍  Search position, department, discipline..."
              className="field-input h-11 w-full"
            />
          </div>
          <div>
            <label htmlFor="department" className="sr-only">
              Department
            </label>
            <select
              id="department"
              name="department"
              defaultValue={departmentId}
              className="field-input h-11 w-full"
            >
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
            <select id="position" name="position" defaultValue={position} className="field-input h-11 w-full">
              <option value="">All positions</option>
              {Object.entries(POSITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn-primary h-11 w-full sm:w-auto px-8 text-sm sm:text-base font-semibold"
          >
            Search
          </button>
        </Form>
      </motion.section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-4">
        <p className="text-xs sm:text-sm text-muted" role="status">
          Showing <strong className="text-ink font-bold">{vacancies.length}</strong>{" "}
          {vacancies.length === 1 ? "position" : "positions"} available
        </p>
        {filtered && (
          <Link
            to="/vacancies"
            className="chip no-underline hover:bg-soft text-xs font-semibold text-brand-700"
          >
            ✕ Clear all filters
          </Link>
        )}
      </div>

      {vacancies.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-5xl" aria-hidden="true">
            🧐
          </p>
          <p className="mt-4 text-xl font-bold text-ink">No vacancies match your criteria</p>
          <p className="mt-2 text-sm text-muted">Try adjusting your keywords or clearing the filters.</p>
          <Link to="/vacancies" className="btn-secondary mt-6 inline-flex">
            Reset search filters
          </Link>
        </div>
      ) : (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
          }}
          className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {vacancies.map((v) => (
            <motion.li
              key={v.id}
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
              }}
            >
              <VacancyCard v={v} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
