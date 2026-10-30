import { jsonLd } from "~/lib/json-ld";
import { Form, Link } from "react-router";
import { ArrowLeft, CalendarClock, Check, Clock, Users } from "lucide-react";
import type { Route } from "./+types/vacancy";
import { Alert, CsrfInput, formatDate, formatDateTime } from "~/components/forms";
import { daysLeft } from "~/components/vacancy-card";
import { POSITION_LABELS } from "~/lib/labels";
import { userContext } from "~/context";
import { getPublishedVacancy } from "~/modules/recruitment/service.server";
import { prisma } from "~/modules/core/db.server";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: "Vacancy — PSG Tech Recruitment" }, { name: "robots", content: "noindex" }];
  const v = data.vacancy;
  const where = v.department?.name ?? v.researchSpecialisation?.name ?? "PSG College of Technology";
  const pos =
    v.researchPositionTitle ??
    (v.position ? (POSITION_LABELS[v.position] ?? v.position) : "Faculty position");
  const desc = v.description
    ? v.description.slice(0, 155).replace(/\s+/g, " ").trim()
    : `Apply for ${pos} in ${where} at PSG College of Technology, Coimbatore. Online applications close on ${new Date(v.closesAt).toLocaleDateString("en-IN")}.`;

  return [
    { title: `${pos} — ${where} | PSG Tech Recruitment` },
    { name: "description", content: desc },
    { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large" },
    { property: "og:title", content: `${pos} — ${where} | PSG College of Technology` },
    { property: "og:description", content: desc },
    { property: "og:type", content: "article" },
    { property: "og:image", content: "/images/psg_logo.png" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: `${pos} — ${where}` },
    { name: "twitter:description", content: desc },
    { name: "twitter:image", content: "/images/psg_logo.png" },
  ];
};

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
  const isResearch = v.recruitmentCategory === "RESEARCH";
  const where = v.department?.name ?? v.researchSpecialisation?.name ?? "Research";
  const position =
    v.researchPositionTitle ??
    (v.position ? (POSITION_LABELS[v.position] ?? v.position) : "Research position");

  const facts: [typeof Clock, string, string][] = [
    [CalendarClock, "Last date", formatDateTime(v.closesAt)],
    [Clock, "Time left", open ? `${days} day${days === 1 ? "" : "s"}` : "Closed"],
  ];
  if (v.numberOfPosts) facts.push([Users, "Posts", String(v.numberOfPosts)]);

  return (
    <article className="page-stack">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "JobPosting",
            title: `${position} - ${where}`,
            description:
              v.description ||
              `PSG College of Technology invites applications for the position of ${position} in ${where}. Apply online before ${formatDateTime(v.closesAt)}.`,
            identifier: {
              "@type": "PropertyValue",
              name: "PSG College of Technology",
              value: v.code,
            },
            datePosted: new Date(v.opensAt).toISOString(),
            validThrough: new Date(v.closesAt).toISOString(),
            employmentType: "FULL_TIME",
            hiringOrganization: {
              "@type": "EducationalOrganization",
              name: "PSG College of Technology",
              sameAs: "https://www.psgtech.edu",
              logo: "https://recruitment.psgtech.edu/images/psg_logo.png",
            },
            jobLocation: {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Avinashi Road, Peelamedu",
                addressLocality: "Coimbatore",
                addressRegion: "Tamil Nadu",
                postalCode: "641004",
                addressCountry: "IN",
              },
            },
            industry: "Higher Education",
          }),
        }}
      />
      <Link to="/vacancies" className="back-link">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All vacancies
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-8 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <header className="card">
            <p className="eyebrow">{isResearch ? "Research position" : "Faculty position"}</p>
            <h1 className="mt-2">{position}</h1>
            <p className="mt-1 text-lg text-muted">
              {where}
              {v.discipline ? ` · ${v.discipline.name}` : ""}
            </p>
            <p className="mt-3 text-sm text-muted">
              Vacancy code <span className="code-chip">{v.code}</span>
            </p>
            <dl className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
              {facts.map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <div>
                    <dt className="label-caps">{label}</dt>
                    <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </header>

          <section className="card" aria-labelledby="about">
            <h2 id="about">About the position</h2>
            <p className="mt-3 whitespace-pre-line text-ink/85">{v.description}</p>
          </section>

          <section className="card" aria-labelledby="eligibility">
            <h2 id="eligibility">Eligibility</h2>
            {v.eligibility.length ? (
              <ul className="mt-4 space-y-2.5">
                {v.eligibility.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{e.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted">See the official notification for eligibility criteria.</p>
            )}
            <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
              Upload your photograph, signature and certificates while filling the application. Candidates who
              are already employed should send their application through their present employer.
            </p>
          </section>
        </div>

        <aside aria-labelledby="apply" className="lg:sticky lg:top-24 lg:h-fit">
          <div className="card space-y-4">
            <h2 id="apply" className="text-xl">
              Apply for this position
            </h2>
            {!open ? (
              <Alert tone="warning" title="Applications are closed">
                This vacancy is not accepting applications.
              </Alert>
            ) : existing ? (
              <>
                <p className="text-sm text-muted">
                  You have already started an application for this vacancy.
                </p>
                <Link to={`/applications/${existing.id}`} className="btn-primary btn-lg w-full">
                  Continue application
                </Link>
              </>
            ) : !signedIn ? (
              <>
                <p className="text-sm text-muted">
                  Create an account or sign in to start the application form.
                </p>
                <Link to={`/register?next=/vacancies/${v.code}`} className="btn-primary btn-lg w-full">
                  Create account to apply
                </Link>
                <Link to={`/login?next=/vacancies/${v.code}`} className="btn-secondary w-full">
                  I already have an account
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
                <button type="submit" className="btn-primary btn-lg w-full">
                  Start application
                </button>
              </Form>
            )}
            <p className="text-xs text-muted">
              Opened {formatDate(v.opensAt)}. Your progress is saved as a draft, so you can finish later.
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
