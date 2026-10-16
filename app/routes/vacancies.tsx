import { Form, Link } from "react-router";
import type { Route } from "./+types/vacancies";
import { formatDate } from "~/components/forms";
import { POSITION_LABELS } from "~/lib/labels";
import { listDepartments, listPublishedVacancies } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Open vacancies — PSG Tech Recruitment" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const position = url.searchParams.get("position") || undefined;
  const [vacancies, departments] = await Promise.all([
    listPublishedVacancies({
      departmentId: departmentId && /^[0-9a-f-]{36}$/.test(departmentId) ? departmentId : undefined,
      position: position && position in POSITION_LABELS ? position : undefined,
    }),
    listDepartments(),
  ]);
  return { vacancies, departments, departmentId: departmentId ?? "", position: position ?? "" };
}

export default function Vacancies({ loaderData }: Route.ComponentProps) {
  const { vacancies, departments, departmentId, position } = loaderData;
  return (
    <div className="space-y-6">
      <h1>Open vacancies</h1>
      <Form method="get" className="card flex flex-wrap items-end gap-4" aria-label="Filter vacancies">
        <div>
          <label htmlFor="department" className="block text-sm font-medium">
            Department
          </label>
          <select id="department" name="department" defaultValue={departmentId} className="field-input mt-1 min-w-56">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="position" className="block text-sm font-medium">
            Position
          </label>
          <select id="position" name="position" defaultValue={position} className="field-input mt-1 min-w-48">
            <option value="">All positions</option>
            {Object.entries(POSITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Apply filters
        </button>
      </Form>
      <p className="text-sm text-muted" role="status">
        {vacancies.length} {vacancies.length === 1 ? "vacancy" : "vacancies"} found
      </p>
      {vacancies.length === 0 ? (
        <p className="card text-muted">No open vacancies match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {vacancies.map((v) => (
            <li key={v.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  {v.department.name} · {v.cycle.title}
                </p>
                <h2 className="mt-1">
                  <Link to={`/vacancies/${v.code}`}>{v.title}</Link>
                </h2>
                <p className="mt-1 text-sm">
                  {POSITION_LABELS[v.position]}
                  {v.discipline ? ` · ${v.discipline.name}` : ""}
                  {v.numberOfPosts ? ` · ${v.numberOfPosts} post(s)` : ""}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>Closes {formatDate(v.closesAt)}</p>
                <p className="text-muted">Ref. {v.code}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
