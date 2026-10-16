import { Link } from "react-router";
import type { Route } from "./+types/home";
import { formatDate } from "~/components/forms";
import { listPublishedVacancies } from "~/modules/recruitment/service.server";
import { POSITION_LABELS } from "~/lib/labels";

export const meta: Route.MetaFunction = () => [
  { title: "Staff Recruitment — PSG College of Technology" },
  { name: "description", content: "Faculty recruitment portal of PSG College of Technology, Coimbatore." },
];

export async function loader() {
  const vacancies = await listPublishedVacancies();
  return { vacancies: vacancies.slice(0, 6), total: vacancies.length };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { vacancies, total } = loaderData;
  return (
    <div className="space-y-10">
      <section aria-labelledby="intro" className="card border-l-4 border-l-brand-600">
        <h1 id="intro">Faculty recruitment at PSG College of Technology</h1>
        <p className="mt-3 max-w-3xl text-muted">
          PSG College of Technology, Coimbatore — autonomous and affiliated to Anna University, an ISO
          9001:2015 certified institution — invites applications for faculty positions through this portal.
          Browse open vacancies, complete the official application form online, upload your supporting
          documents and track the status of your application.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/vacancies" className="btn-primary">
            View open vacancies ({total})
          </Link>
          <Link to="/register" className="btn-secondary">
            Create a candidate account
          </Link>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how">How to apply</h2>
        <ol className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Register", "Create an account and verify your e-mail address."],
            ["Choose a vacancy", "Read the position details, eligibility and the documents required."],
            [
              "Complete the official form",
              "Fill in each section of the official application. Your progress is saved as a draft.",
            ],
            [
              "Upload and submit",
              "Upload your photograph and attested copies, review the form and submit. You will receive a reference number.",
            ],
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <p className="text-sm font-semibold text-brand-700">Step {i + 1}</p>
              <p className="mt-1 font-medium">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="open">
        <div className="flex items-baseline justify-between">
          <h2 id="open">Open vacancies</h2>
          <Link to="/vacancies">All vacancies</Link>
        </div>
        {vacancies.length === 0 ? (
          <p className="mt-3 text-muted">
            There are no open vacancies at the moment. Please check again later.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {vacancies.map((v) => (
              <li key={v.id} className="card">
                <p className="text-xs uppercase tracking-wide text-muted">{v.department.name}</p>
                <h3 className="mt-1 font-semibold">
                  <Link to={`/vacancies/${v.code}`}>{v.title}</Link>
                </h3>
                <p className="mt-1 text-sm">
                  {POSITION_LABELS[v.position]}
                  {v.discipline ? ` · ${v.discipline.name}` : ""}
                </p>
                <p className="mt-2 text-sm text-muted">Closes {formatDate(v.closesAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
