import { Form, Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FileDown,
  FileText,
  Search,
  Send,
  UserPlus,
} from "lucide-react";
import type { Route } from "./+types/home";
import { formatDate } from "~/components/forms";
import { VacancyCard } from "~/components/vacancy-card";
import { listPublishedVacancies } from "~/modules/recruitment/service.server";
import { currentNotice } from "~/modules/notices/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Recruitment — PSG College of Technology" },
  {
    name: "description",
    content: "Faculty and research recruitment portal of PSG College of Technology, Coimbatore.",
  },
];

export async function loader() {
  const [vacancies, notice] = await Promise.all([listPublishedVacancies(), currentNotice()]);
  return {
    vacancies: vacancies.slice(0, 6),
    total: vacancies.length,
    faculty: vacancies.filter((v) => v.recruitmentCategory === "FACULTY").length,
    research: vacancies.filter((v) => v.recruitmentCategory === "RESEARCH").length,
    departments: new Set(vacancies.map((v) => v.departmentId).filter(Boolean)).size,
    nextClosing: vacancies[0]?.closesAt ?? null,
    notice: notice ? { title: notice.title, uploadedAt: notice.uploadedAt } : null,
  };
}

const STEPS = [
  [UserPlus, "Create an account", "Register with your e-mail address and confirm it with the link we send."],
  [Search, "Choose a vacancy", "Read the position details and eligibility for each opening."],
  [
    ClipboardList,
    "Fill the application",
    "Complete the official form section by section; drafts save automatically.",
  ],
  [
    Send,
    "Upload and submit",
    "Attach your certificates, review everything and receive your reference number.",
  ],
] as const;

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { vacancies, total, faculty, research, departments, nextClosing, notice } = loaderData;
  const stats: [string, string | number][] = [
    ["Open vacancies", total],
    ["Faculty", faculty],
    ["Research", research],
    ["Departments hiring", departments],
  ];

  return (
    <div className="space-y-14 sm:space-y-20">
      {/* Hero */}
      <motion.section {...fade} aria-labelledby="hero" className="relative">
        <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
              {total > 0
                ? `${total} position${total === 1 ? "" : "s"} open now`
                : "PSG College of Technology, Coimbatore"}
            </p>
            <h1
              id="hero"
              className="mt-5 max-w-2xl text-4xl leading-[1.1] font-semibold text-navy-800 sm:text-5xl lg:text-[3.4rem]"
            >
              Join the faculty that <span className="text-brand-600">shapes engineers</span>.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
              Apply online for faculty and research positions at PSG College of Technology. Upload your
              documents securely and follow your application through to the decision.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {notice && (
                <a href="/open-positions.pdf" target="_blank" rel="noreferrer" className="btn-primary btn-lg">
                  <FileDown className="h-5 w-5" aria-hidden="true" /> Open positions (PDF)
                </a>
              )}
              <Link to="/vacancies" className={notice ? "btn-secondary btn-lg" : "btn-primary btn-lg"}>
                Browse vacancies <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            {notice && (
              <p className="mt-3 text-xs text-muted">
                {notice.title} · published {formatDate(notice.uploadedAt)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-paper p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <Form method="get" action="/vacancies" role="search">
              <label htmlFor="hero-q" className="block font-display text-lg font-semibold text-ink">
                Find a position
              </label>
              <p className="mt-1 text-sm text-muted">Search by position, department or research area.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="hero-q"
                    name="q"
                    type="search"
                    placeholder="e.g. Assistant Professor, CSE"
                    className="field-input pl-9"
                  />
                </div>
                <button type="submit" className="btn-dark">
                  Search
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link to="/vacancies?category=FACULTY" className="chip">
                  Faculty
                </Link>
                <Link to="/vacancies?category=RESEARCH" className="chip">
                  Research
                </Link>
                <Link to="/vacancies?position=ASSISTANT_PROFESSOR" className="chip">
                  Assistant Professor
                </Link>
              </div>
            </Form>
            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-canvas px-3 py-2.5">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-xl font-bold text-navy-800 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </motion.section>

      {/* Open positions */}
      <section aria-labelledby="open" className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Now accepting applications</p>
            <h2 id="open" className="mt-1 text-2xl sm:text-3xl">
              Open positions
            </h2>
            {nextClosing && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Next closing date: {formatDate(nextClosing)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {notice && (
              <a href="/open-positions.pdf" target="_blank" rel="noreferrer" className="btn-secondary">
                <FileText className="h-4 w-4" aria-hidden="true" /> Notification PDF
              </a>
            )}
            <Link to="/vacancies" className="btn-secondary">
              All vacancies <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        {vacancies.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-paper px-6 py-14 text-center">
            <p className="font-display text-xl font-semibold text-ink">No vacancies are open right now</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              New openings appear here as soon as they are published.
              {notice ? " The latest recruitment notification is available as a PDF above." : ""}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
            {vacancies.map((v) => (
              <li key={v.id}>
                <VacancyCard v={v} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-14">
        <div>
          <p className="eyebrow">How to apply</p>
          <h2 id="how" className="mt-1 text-2xl sm:text-3xl">
            Four steps, entirely online
          </h2>
          <p className="mt-3 text-muted">
            The online form follows the college&apos;s official application. You can stop at any point and
            continue later.
          </p>
          <Link to="/help" className="mt-4 inline-flex items-center gap-1 font-semibold">
            Read the full guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([Icon, title, text], i) => (
            <li key={title} className="card flex gap-4 p-5">
              <span className="icon-tile">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="label-caps">Step {i + 1}</p>
                <p className="mt-0.5 font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Call to action */}
      <section
        aria-labelledby="cta"
        className="flex flex-col items-start justify-between gap-6 rounded-xl border border-line bg-paper p-6 sm:p-10 md:flex-row md:items-center"
      >
        <div className="max-w-xl">
          <h2 id="cta" className="text-2xl sm:text-3xl">
            Ready to apply?
          </h2>
          <p className="mt-2 text-muted">
            Create your candidate account once and use it for every application to PSG College of Technology.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/register" className="btn-primary btn-lg">
            Create an account
          </Link>
          <Link to="/login" className="btn-secondary btn-lg">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
