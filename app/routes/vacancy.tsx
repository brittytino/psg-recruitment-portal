import { Form, Link } from "react-router";
import type { Route } from "./+types/vacancy";
import { Alert, CsrfInput, formatDateTime } from "~/components/forms";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { userContext } from "~/context";
import { getPublishedVacancy } from "~/modules/recruitment/service.server";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: data ? `${data.vacancy.title} — PSG Tech Recruitment` : "Vacancy" },
];

export async function loader({ params, context }: Route.LoaderArgs) {
  const vacancy = await getPublishedVacancy(params.code);
  const user = context.get(userContext);
  const now = new Date();
  const open = vacancy.status === "PUBLISHED" && vacancy.opensAt <= now && vacancy.closesAt > now;
  const existing = user
    ? await prisma.application.findUnique({
        where: { candidateId_vacancyId: { candidateId: user.id, vacancyId: vacancy.id } },
        select: { id: true, status: true },
      })
    : null;
  const isCandidate = !!user?.grants.some((g) => g.role === "CANDIDATE");
  return { vacancy, open, signedIn: !!user, isCandidate, verified: !!user?.emailVerified, existing };
}

export default function Vacancy({ loaderData }: Route.ComponentProps) {
  const { vacancy: v, open, signedIn, isCandidate, verified, existing } = loaderData;
  return (
    <article className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/vacancies">Vacancies</Link> <span aria-hidden="true">/</span> <span>{v.code}</span>
      </nav>
      <header className="card">
        <p className="text-xs uppercase tracking-wide text-muted">
          {v.department.name}
          {v.discipline ? ` · ${v.discipline.name}` : ""}
        </p>
        <h1 className="mt-1">{v.title}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Position</dt>
            <dd className="font-medium">{POSITION_LABELS[v.position]}</dd>
          </div>
          <div>
            <dt className="text-muted">Number of posts</dt>
            <dd className="font-medium">{v.numberOfPosts ?? "Not specified"}</dd>
          </div>
          <div>
            <dt className="text-muted">Opens</dt>
            <dd className="font-medium">{formatDateTime(v.opensAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Closes</dt>
            <dd className="font-medium">{formatDateTime(v.closesAt)}</dd>
          </div>
        </dl>
      </header>

      <section className="card space-y-2" aria-labelledby="about">
        <h2 id="about">About the position</h2>
        <p className="whitespace-pre-line text-sm">{v.description}</p>
      </section>

      <section className="card" aria-labelledby="eligibility">
        <h2 id="eligibility">Eligibility</h2>
        {v.eligibility.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {v.eligibility.map((e) => (
              <li key={e.id}>{e.description}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Eligibility criteria have not been published for this vacancy.
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="docs">
        <h2 id="docs">Documents to upload</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Recent passport size photograph (JPEG or PNG) — printed on the application form</li>
          {v.requiredDocuments.map((d) => (
            <li key={d.id}>
              {d.label}
              {d.required ? "" : " (if applicable)"}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Application form: {FORM_LABELS[v.formTemplate.code]} (official form, version{" "}
          {v.formTemplate.version}). Note from the official form: attested copies of degrees, certificates,
          testimonials, community etc. should be annexed to the application. Candidates already employed
          should send their applications only through their present employer.
        </p>
      </section>

      <section aria-labelledby="apply" className="card">
        <h2 id="apply">Apply</h2>
        <div className="mt-3">
          {!open ? (
            <Alert tone="warning" title="Applications are closed">
              This vacancy is not accepting applications.
            </Alert>
          ) : existing ? (
            <p>
              You have already started an application for this vacancy.{" "}
              <Link to={`/applications/${existing.id}`}>Continue your application</Link>
            </p>
          ) : !signedIn ? (
            <p className="flex flex-wrap gap-3">
              <Link to={`/register`} className="btn-primary">
                Register to apply
              </Link>
              <Link to={`/login?next=/vacancies/${v.code}`} className="btn-secondary">
                Sign in
              </Link>
            </p>
          ) : !isCandidate ? (
            <p className="text-sm text-muted">
              Staff accounts cannot apply. Use a separate candidate account.
            </p>
          ) : !verified ? (
            <Alert tone="warning" title="Verify your e-mail address">
              Please verify your e-mail address using the link we sent you before starting an application.
            </Alert>
          ) : (
            <Form method="post" action={`/apply/${v.code}`}>
              <CsrfInput />
              <button type="submit" className="btn-primary">
                Start application
              </button>
            </Form>
          )}
        </div>
      </section>
    </article>
  );
}
