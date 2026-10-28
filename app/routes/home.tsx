import { useEffect, useRef } from "react";
import { Form, Link } from "react-router";
import { motion } from "framer-motion";
import gsap from "gsap";
import type { Route } from "./+types/home";
import { formatDate } from "~/components/forms";
import { VacancyCard } from "~/components/vacancy-card";
import { listPublishedVacancies } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Careers — PSG College of Technology" },
  { name: "description", content: "Faculty recruitment portal of PSG College of Technology, Coimbatore." },
];

export async function loader() {
  const vacancies = await listPublishedVacancies();
  const departments = new Set(vacancies.map((v) => v.departmentId).filter(Boolean)).size;
  const researchCount = vacancies.filter((v) => v.recruitmentCategory === "RESEARCH").length;
  const facultyCount = vacancies.filter((v) => v.recruitmentCategory === "FACULTY").length;
  return {
    vacancies: vacancies.slice(0, 6),
    total: vacancies.length,
    departments,
    researchCount,
    facultyCount,
    nextClosing: vacancies[0] ?? null,
  };
}


const STEPS: [string, string, string][] = [
  ["👤", "Create your account", "Register and verify your e-mail address in a minute."],
  ["🔎", "Pick a vacancy", "Read the position, eligibility and the documents required."],
  ["📝", "Fill the official form", "Section by section, saved as you go — resume any time."],
  ["🚀", "Upload & submit", "Add your photo and certificates, review, and get a reference number."],
];

export default function Home({ loaderData }: Route.ComponentProps) {
  const { vacancies, total, departments, nextClosing } = loaderData;
  const statsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !statsContainerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".stat-ribbon-tile",
        { opacity: 0, y: 18, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
          clearProps: "all",
        },
      );
    }, statsContainerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="space-y-12 sm:space-y-16 lg:space-y-20">
      {/* Expansive Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="hero"
        className="hero-gradient relative overflow-hidden rounded-3xl p-6 sm:p-12 lg:p-20 shadow-[var(--shadow-soft)] border border-pink-100/50"
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-xs backdrop-blur-sm border border-brand-100"
          >
            <span className="h-2 w-2 rounded-full bg-brand-600 animate-pulse" />
            PSG College of Technology · Faculty Recruitment
          </motion.div>

          <h1
            id="hero"
            className="mt-5 text-3xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-7xl leading-[1.1]"
          >
            Shape the future of{" "}
            <span className="bg-gradient-to-r from-brand-700 via-purple-700 to-violet-700 bg-clip-text text-transparent">
              engineering education
            </span>
          </h1>

          <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-sm sm:text-lg lg:text-xl text-muted leading-relaxed">
            Join PSG College of Technology. Find your academic post, complete the official application online
            with automatic draft saving, and follow your recruitment journey live.
          </p>

          {/* Responsive Search Bar */}
          <Form
            method="get"
            action="/vacancies"
            role="search"
            className="mx-auto mt-8 sm:mt-10 flex flex-col sm:flex-row w-full max-w-2xl items-stretch sm:items-center gap-2 rounded-2xl sm:rounded-full bg-white p-2 sm:p-2.5 shadow-[var(--shadow-float)] border border-line/70 transition-all focus-within:ring-3 focus-within:ring-brand-600/20"
          >
            <div className="flex items-center min-w-0 flex-1 pl-2 sm:pl-3">
              <label htmlFor="hero-q" className="sr-only">
                Search vacancies
              </label>
              <span aria-hidden="true" className="text-base sm:text-lg text-muted">
                🔍
              </span>
              <input
                id="hero-q"
                name="q"
                type="search"
                placeholder="Search position, department, discipline..."
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm sm:text-base text-ink outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold"
            >
              Search
            </button>
          </Form>

          {/* Quick Trending Tags */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-xs text-muted">
            <span className="font-semibold text-ink">Popular:</span>
            <Link to="/vacancies?position=ASSISTANT_PROFESSOR" className="chip no-underline">
              Assistant Professor
            </Link>
            <Link to="/vacancies?position=ASSOCIATE_PROFESSOR" className="chip no-underline">
              Associate Professor
            </Link>
            <Link to="/vacancies?position=PROFESSOR" className="chip no-underline">
              Professor
            </Link>
          </div>

          {/* Responsive 4-Column Stats Ribbon with GSAP Stagger */}
          <div
            ref={statsContainerRef}
            className="mt-10 sm:mt-12 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 w-full max-w-5xl mx-auto text-left"
          >
            <div className="stat-ribbon-tile flex items-center gap-2.5 sm:gap-3.5 rounded-2xl bg-white/95 p-3.5 sm:p-5 shadow-[var(--shadow-soft)] backdrop-blur-sm border border-white/70 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-tile-pink text-xl sm:text-2xl shadow-xs">
                💼
              </span>
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-xs font-semibold text-muted uppercase tracking-wider truncate">
                  Open Vacancies
                </span>
                <span className="block text-xl sm:text-3xl font-extrabold text-ink">{total}</span>
              </div>
            </div>

            <div className="stat-ribbon-tile flex items-center gap-2.5 sm:gap-3.5 rounded-2xl bg-white/95 p-3.5 sm:p-5 shadow-[var(--shadow-soft)] backdrop-blur-sm border border-white/70 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-tile-purple text-xl sm:text-2xl shadow-xs">
                🏛️
              </span>
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-xs font-semibold text-muted uppercase tracking-wider truncate">
                  Departments
                </span>
                <span className="block text-xl sm:text-3xl font-extrabold text-ink">{departments}</span>
              </div>
            </div>

            <div className="stat-ribbon-tile flex items-center gap-2.5 sm:gap-3.5 rounded-2xl bg-white/95 p-3.5 sm:p-5 shadow-[var(--shadow-soft)] backdrop-blur-sm border border-white/70 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-tile-orange text-xl sm:text-2xl shadow-xs">
                ⏳
              </span>
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-xs font-semibold text-muted uppercase tracking-wider truncate">
                  Next Deadline
                </span>
                <span className="block text-xs sm:text-base font-extrabold text-ink truncate">
                  {nextClosing ? formatDate(nextClosing.closesAt) : "Open"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Open Positions Section */}
      <section aria-labelledby="open" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Now hiring</p>
            <h2 id="open" className="mt-1 text-2xl sm:text-4xl font-extrabold text-ink">
              Open positions
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Explore current faculty openings across engineering and science disciplines.
            </p>
          </div>
          <Link to="/vacancies" className="btn-secondary">
            View all vacancies →
          </Link>
        </div>
        {vacancies.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-5xl" aria-hidden="true">
              🌱
            </p>
            <p className="mt-3 text-lg font-bold">No open vacancies right now</p>
            <p className="text-sm text-muted">Please check back soon for upcoming recruitment cycles.</p>
          </div>
        ) : (
          <motion.ul
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
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
      </section>

      {/* How it works */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
        aria-labelledby="how"
        className="card p-6 sm:p-12 lg:p-14"
      >
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 id="how" className="mt-2 text-2xl sm:text-4xl font-extrabold text-ink">
            Apply in four simple steps
          </h2>
          <p className="mt-2 text-xs sm:text-base text-muted">
            The application process is entirely digital, transparent, and structured according to official
            college guidelines.
          </p>
        </div>
        <ol className="mt-8 sm:mt-10 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([emoji, t, d], i) => (
            <motion.li
              key={t}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="card-soft relative p-5 sm:p-6 transition-all hover:bg-white hover:shadow-sm"
            >
              <span
                aria-hidden="true"
                className="grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-2xl bg-white text-2xl sm:text-3xl shadow-[var(--shadow-soft)]"
              >
                {emoji}
              </span>
              <p className="mt-4 sm:mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">
                Step {i + 1}
              </p>
              <p className="mt-1 text-sm sm:text-base font-bold text-ink">{t}</p>
              <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted leading-relaxed">{d}</p>
            </motion.li>
          ))}
        </ol>
      </motion.section>

      {/* Call to Action */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
        aria-labelledby="cta"
        className="hero-gradient flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 rounded-3xl p-6 sm:p-12 lg:p-16 border border-pink-100/60 shadow-[var(--shadow-soft)]"
      >
        <div className="max-w-xl text-center md:text-left">
          <h2 id="cta" className="text-2xl sm:text-4xl font-extrabold text-ink">
            Ready to shape future engineers?
          </h2>
          <p className="mt-2.5 sm:mt-3 text-sm sm:text-lg text-muted leading-relaxed">
            Create your candidate account and start your application today. Your draft saves automatically so
            you can resume at any time.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Link
            to="/register"
            className="btn-primary w-full sm:w-auto px-8 py-3.5 text-center text-sm sm:text-base font-semibold shadow-md"
          >
            Create an account
          </Link>
          <Link
            to="/vacancies"
            className="btn-secondary w-full sm:w-auto px-6 py-3.5 text-center text-sm sm:text-base font-semibold"
          >
            Browse all vacancies
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
