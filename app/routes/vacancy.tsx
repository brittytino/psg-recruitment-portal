import { Form, Link } from "react-router";
import { motion } from "framer-motion";
import type { Route } from "./+types/vacancy";
import { Alert, CsrfInput, formatDate } from "~/components/forms";
import { daysLeft } from "~/components/vacancy-card";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { userContext } from "~/context";
import { getPublishedVacancy } from "~/modules/recruitment/service.server";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: data ? `${data.vacancy.title} — PSG Tech Careers` : "Vacancy" },
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
  const days = daysLeft(v.closesAt);
  const tiles: [string, string, string, string][] = [
    ["bg-tile-green", "Position", POSITION_LABELS[v.position] ?? v.position, "🎓"],
    ["bg-tile-blue", "Department", v.department.name, "🏛️"],
    ["bg-tile-orange", "Closes", formatDate(v.closesAt), "⏳"],
    ["bg-tile-purple", "Time left", open ? `${days} day${days === 1 ? "" : "s"}` : "Closed", "🗓️"],
  ];
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/vacancies">Vacancies</Link> <span aria-hidden="true">›</span>{" "}
        <span className="text-muted">{v.code}</span>
      </nav>
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_25rem]">
        <div className="space-y-6">
          <header className="card p-5 sm:p-8">
            <div className="flex items-start gap-3.5 sm:gap-4">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 sm:h-16 sm:w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-200 to-violet-200 text-2xl sm:text-3xl shadow-xs"
              >
                🏛️
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted truncate">
                  {v.department.name}
                  {v.discipline ? ` · ${v.discipline.name}` : ""}
                </p>
                <h1 className="mt-1 text-xl sm:text-3xl lg:text-4xl font-extrabold text-ink leading-tight">
                  {v.title}
                </h1>
                <p className="mt-2 text-xs sm:text-sm text-muted">
                  Ref. <code className="font-semibold text-ink">{v.code}</code> · {v.cycle.title}
                </p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
              {tiles.map(([bg, label, value, emoji]) => (
                <div key={label} className={`stat-tile p-3 sm:p-4 ${bg}`}>
                  <dt className="text-xs font-medium truncate">
                    <span aria-hidden="true">{emoji} </span>
                    {label}
                  </dt>
                  <dd className="mt-1 font-bold text-sm sm:text-base truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <section className="card space-y-2" aria-labelledby="about">
            <h2 id="about">About the position</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{v.description}</p>
          </section>

          <section className="card" aria-labelledby="eligibility">
            <h2 id="eligibility">Eligibility</h2>
            {v.eligibility.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {v.eligibility.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span aria-hidden="true">✔️</span>
                    <span>{e.description}</span>
                  </li>
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
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              <li className="card-soft flex items-center gap-3 p-3 text-sm">
                <span aria-hidden="true" className="text-xl">
                  📷
                </span>
                Recent passport size photograph (JPEG or PNG)
              </li>
              {v.requiredDocuments.map((d) => (
                <li key={d.id} className="card-soft flex items-center gap-3 p-3 text-sm">
                  <span aria-hidden="true" className="text-xl">
                    📄
                  </span>
                  <span>
                    {d.label}
                    {d.required ? "" : <span className="text-muted"> (if applicable)</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Official form: {FORM_LABELS[v.formTemplate.code]} (version {v.formTemplate.version}). Attested
              copies of degrees, certificates, testimonials, community etc. should be annexed. Candidates
              already employed should send their applications through their present employer.
            </p>
          </section>
        </div>

        <aside aria-labelledby="apply" className="lg:sticky lg:top-28 lg:h-fit">
          <div className="card space-y-4">
            <h2 id="apply">Apply for this position</h2>
            {!open ? (
              <Alert tone="warning" title="Applications are closed">
                This vacancy is not accepting applications.
              </Alert>
            ) : existing ? (
              <>
                <p className="text-sm text-muted">
                  You have already started an application for this vacancy.
                </p>
                <Link to={`/applications/${existing.id}`} className="btn-primary w-full py-3">
                  Continue application →
                </Link>
              </>
            ) : !signedIn ? (
              <>
                <p className="text-sm text-muted">
                  Create an account or sign in to start the official application form.
                </p>
                <Link to="/register" className="btn-primary w-full py-3">
                  Register to apply
                </Link>
                <Link to={`/login?next=/vacancies/${v.code}`} className="btn-secondary w-full py-3">
                  Sign in
                </Link>
              </>
            ) : !isCandidate ? (
              <p className="text-sm text-muted">
                Staff accounts cannot apply. Use a separate candidate account.
              </p>
            ) : !verified ? (
              <Alert tone="warning" title="Verify your e-mail address">
                Use the link we sent you before starting an application.
              </Alert>
            ) : (
              <Form method="post" action={`/apply/${v.code}`}>
                <CsrfInput />
                <button type="submit" className="btn-primary w-full py-3">
                  Apply now 🚀
                </button>
              </Form>
            )}
            <p className="text-xs text-muted">Your progress is saved as a draft — you can finish later.</p>
          </div>
        </aside>
      </div>
    </motion.article>
  );
}
