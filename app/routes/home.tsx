import { jsonLd } from "~/lib/json-ld";
import { Form, Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FlaskConical,
  GraduationCap,
  CalendarClock,
  ClipboardList,
  FileText,
  Search,
  Send,
  UserPlus,
} from "lucide-react";
import type { Route } from "./+types/home";
import { formatDate } from "~/components/forms";
import { VacancyCard } from "~/components/vacancy-card";
import { listPublishedVacancies } from "~/modules/recruitment/service.server";
import { NOTICE_PATHS } from "~/modules/notices/categories";
import { currentNotices } from "~/modules/notices/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Faculty & Staff Recruitment — PSG College of Technology, Coimbatore" },
  {
    name: "description",
    content:
      "Official faculty and research recruitment of PSG College of Technology, Coimbatore. Apply online for Assistant Professor, Associate Professor, Professor, and research positions.",
  },
  { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" },
  { property: "og:title", content: "Faculty & Staff Recruitment — PSG College of Technology" },
  {
    property: "og:description",
    content:
      "Official faculty and research recruitment of PSG College of Technology, Coimbatore. Explore faculty vacancies and apply online.",
  },
  { property: "og:type", content: "website" },
  { property: "og:image", content: "/images/psg_logo.png" },
  { name: "twitter:card", content: "summary" },
  { name: "twitter:title", content: "Faculty & Staff Recruitment — PSG College of Technology" },
  {
    name: "twitter:description",
    content: "Faculty and research recruitment at PSG College of Technology, Coimbatore.",
  },
  { name: "twitter:image", content: "/images/psg_logo.png" },
];

export async function loader() {
  const [vacancies, notices] = await Promise.all([listPublishedVacancies(), currentNotices()]);
  return {
    vacancies: vacancies.slice(0, 6),
    nextClosing: vacancies[0]?.closesAt ?? null,
    notices,
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
  const { vacancies, nextClosing, notices: published } = loaderData;
  const notices = (
    [
      ["FACULTY", "Faculty positions", GraduationCap, true],
      ["RESEARCH", "Research positions", FlaskConical, false],
    ] as const
  ).map(([category, label, Icon, primary]) => {
    const n = published[category];
    return {
      label,
      Icon,
      primary,
      pdf: !!n,
      href: n ? NOTICE_PATHS[category] : `/vacancies?category=${category}`,
      sub: n ? `PDF · ${formatDate(n.uploadedAt)}` : "View current openings",
    };
  });
  const anyPdf = notices.some((n) => n.pdf);

  return (
    <div className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollegeOrUniversity",
                "@id": "https://www.psgtech.edu/#organization",
                name: "PSG College of Technology",
                alternateName: ["PSG Tech", "PSG Tech Coimbatore"],
                url: "https://www.psgtech.edu",
                logo: "/images/psg_logo.png",
                sameAs: [
                  "https://en.wikipedia.org/wiki/PSG_College_of_Technology",
                  "https://www.annauniv.edu",
                ],
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "Avinashi Road, Peelamedu",
                  addressLocality: "Coimbatore",
                  addressRegion: "Tamil Nadu",
                  postalCode: "641004",
                  addressCountry: "IN",
                },
              },
              {
                "@type": "WebSite",
                name: "PSG College of Technology Recruitment",
                url: "/",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "/vacancies?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
            ],
          }),
        }}
      />
      {/* Hero: fills the first screen and stays in place on large screens while the page scrolls over it. */}
      <section
        aria-labelledby="hero"
        className="lg:sticky lg:top-16 lg:flex lg:min-h-[calc(100dvh-4rem-6rem)] lg:items-center"
      >
        <motion.div
          {...fade}
          className="grid w-full gap-10 py-4 sm:py-8 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-16 lg:py-0"
        >
          <div>
            <p className="flex items-center gap-4 text-xs font-semibold tracking-[0.22em] text-muted uppercase sm:text-[13px]">
              Faculty &amp; Research Recruitment
              <span className="hidden h-px w-16 bg-brand-600 sm:block" aria-hidden="true" />
            </p>
            <h1
              id="hero"
              className="mt-5 font-display text-[2.1rem] leading-[1.1] font-semibold tracking-tight text-navy-800 sm:text-[2.75rem] xl:text-[3.25rem]"
            >
              Join PSG College of Technology
            </h1>
            <p className="mt-3 font-display text-xl leading-snug font-medium text-brand-600 sm:text-2xl xl:text-[1.75rem]">
              Shape the future through education and research.
            </p>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
              We invite applications from eligible candidates for Faculty and Research positions across
              various departments. Read the official notification, then apply online.
            </p>

            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              {notices.map((n) => {
                const inner = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                      <n.Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-[15px] leading-tight font-semibold">{n.label}</span>
                      <span className="mt-0.5 block text-xs font-normal opacity-80">{n.sub}</span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                );
                const cls = `group flex items-center gap-3 rounded-xl px-4 py-3.5 no-underline shadow-sm transition-colors ${
                  n.primary
                    ? "bg-brand-600 text-white hover:bg-brand-700 hover:text-white"
                    : "bg-navy-800 text-white hover:bg-navy-900 hover:text-white"
                }`;
                return n.pdf ? (
                  <a key={n.label} href={n.href} target="_blank" rel="noreferrer" className={cls}>
                    {inner}
                  </a>
                ) : (
                  <Link key={n.label} to={n.href} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <Link to="/help" className="inline-flex items-center gap-1 font-semibold text-brand-700">
                How to apply <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <span>Applications are accepted online only.</span>
            </p>
          </div>

          <aside className="rounded-2xl border border-line bg-paper p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <Form method="get" action="/vacancies" role="search">
              <h2 className="text-2xl sm:text-3xl">
                <label htmlFor="hero-q">Find a position</label>
              </h2>
              <p className="mt-2 text-muted">
                Search current faculty and research openings by position, department or area of
                specialisation.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="hero-q"
                    name="q"
                    type="search"
                    placeholder="Position, department or keyword"
                    className="field-input h-12 pl-10"
                  />
                </div>
                <button type="submit" className="btn-primary btn-lg">
                  Search
                </button>
              </div>
            </Form>
            <div className="mt-7 border-t border-line pt-6">
              <h3 className="text-lg">Quick links</h3>
              <ul className="mt-3 space-y-2.5">
                {(
                  [
                    [GraduationCap, "Faculty positions", "/vacancies?category=FACULTY"],
                    [FlaskConical, "Research positions", "/vacancies?category=RESEARCH"],
                    [FileText, "How to apply", "/help"],
                  ] as const
                ).map(([Icon, label, to]) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="group flex items-center gap-3 rounded-lg border border-line px-4 py-3 font-medium text-ink no-underline transition-colors hover:border-brand-200 hover:bg-brand-50"
                    >
                      <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                      {label}
                      <ArrowRight
                        className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </motion.div>
      </section>

      {/* Everything below scrolls up over the hero. */}
      <div className="relative z-10 mt-12 space-y-14 sm:space-y-20 lg:-mx-8 lg:mt-6 lg:rounded-t-[2rem] lg:border lg:border-b-0 lg:border-line lg:bg-paper lg:px-8 lg:pt-14 lg:pb-4 lg:shadow-[0_-24px_48px_-28px_rgb(15_28_46/0.28)]">
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
              {notices
                .filter((n) => n.pdf)
                .map((n) => (
                  <a key={n.label} href={n.href} target="_blank" rel="noreferrer" className="btn-secondary">
                    <FileText className="h-4 w-4" aria-hidden="true" /> {n.label} PDF
                  </a>
                ))}
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
                {anyPdf ? " The latest recruitment notification is available as a PDF above." : ""}
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
              Create your candidate account once and use it for every application to PSG College of
              Technology.
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
    </div>
  );
}
