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
      <motion.section
        {...fade}
        aria-labelledby="hero"
        className="hero-gradient relative -mx-4 overflow-hidden px-5 py-12 sm:mx-0 sm:rounded-2xl sm:px-10 sm:py-16 lg:px-14 lg:py-20"
      >
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden="true" />
              PSG College of Technology, Coimbatore
            </p>
            <h1
              id="hero"
              className="mt-5 max-w-2xl text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl"
            >
              Join the faculty that shapes engineers.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">
              Apply online for faculty and research positions, upload your documents securely and follow your
              application through to the decision.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {notice ? (
                <a
                  href="/open-positions.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-lg bg-gold-400 text-navy-900 shadow-sm hover:bg-[#e2b85c] hover:text-navy-900"
                >
                  <FileDown className="h-5 w-5" aria-hidden="true" /> Open positions (PDF)
                </a>
              ) : null}
              <Link
                to="/vacancies"
                className={
                  notice
                    ? "btn btn-lg border border-white/30 text-white hover:bg-white/10 hover:text-white"
                    : "btn btn-lg bg-gold-400 text-navy-900 hover:bg-[#e2b85c] hover:text-navy-900"
                }
              >
                Browse vacancies <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            {notice && (
              <p className="mt-3 text-xs text-white/55">
                {notice.title} · published {formatDate(notice.uploadedAt)}
              </p>
            )}
          </div>

          <Form
            method="get"
            action="/vacancies"
            role="search"
            className="rounded-xl bg-paper p-4 text-ink shadow-[var(--shadow-float)] sm:p-5"
          >
            <label htmlFor="hero-q" className="block text-sm font-semibold">
              Search vacancies
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
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
              <button type="submit" className="btn-primary">
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
        </div>

        <dl className="relative mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-navy-900/40 px-4 py-4 sm:px-5">
              <dt className="text-xs text-white/60">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-white sm:text-3xl">{value}</dd>
            </div>
          ))}
        </dl>
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
        className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-paper p-6 sm:p-10 md:flex-row md:items-center"
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
