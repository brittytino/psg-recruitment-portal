import { Form, Link } from "react-router";
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
  const departments = new Set(vacancies.map((v) => v.departmentId)).size;
  const posts = vacancies.reduce((n, v) => n + (v.numberOfPosts ?? 0), 0);
  return {
    vacancies: vacancies.slice(0, 6),
    total: vacancies.length,
    departments,
    posts,
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
  const { vacancies, total, departments, posts, nextClosing } = loaderData;
  return (
    <div className="space-y-14">
      <section
        aria-labelledby="hero"
        className="hero-gradient relative overflow-hidden rounded-[2rem] px-6 py-16 sm:px-12 sm:py-20"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="float-card absolute left-10 top-12 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-pink text-xl">💼</span>
            <span>
              <span className="block text-[11px] text-muted">Open vacancies</span>
              <span className="block text-lg font-bold">{total}</span>
            </span>
          </div>
          <div className="float-card absolute bottom-14 left-16 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-purple text-xl">🏛️</span>
            <span>
              <span className="block text-[11px] text-muted">Departments hiring</span>
              <span className="block text-lg font-bold">{departments}</span>
            </span>
          </div>
          <div className="float-card absolute right-10 top-16 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-blue text-xl">🎓</span>
            <span>
              <span className="block text-[11px] text-muted">Faculty posts</span>
              <span className="block text-lg font-bold">{posts || "—"}</span>
            </span>
          </div>
          {nextClosing && (
            <div className="float-card absolute bottom-16 right-14 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-tile-orange text-xl">⏳</span>
              <span>
                <span className="block text-[11px] text-muted">Next closing date</span>
                <span className="block text-sm font-bold">{formatDate(nextClosing.closesAt)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="chip mx-auto">✨ Faculty recruitment {new Date().getFullYear()}</p>
          <h1 id="hero" className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl">
            Shape the future of engineering education
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Join PSG College of Technology. Find your position, complete the official application online and
            track every step.
          </p>
          <Form
            method="get"
            action="/vacancies"
            role="search"
            className="mx-auto mt-8 flex max-w-lg items-center gap-2 rounded-full bg-white p-1.5 shadow-[var(--shadow-float)]"
          >
            <label htmlFor="hero-q" className="sr-only">
              Search vacancies
            </label>
            <span aria-hidden="true" className="pl-3">
              🔍
            </span>
            <input
              id="hero-q"
              name="q"
              type="search"
              placeholder="Search a position or department…"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            />
            <button type="submit" className="btn-primary">
              Search
            </button>
          </Form>
        </div>
      </section>

      <section aria-labelledby="open">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Now hiring</p>
            <h2 id="open" className="mt-1 text-3xl font-bold">
              Open positions
            </h2>
          </div>
          <Link to="/vacancies" className="btn-secondary">
            View all vacancies →
          </Link>
        </div>
        {vacancies.length === 0 ? (
          <div className="card mt-6 text-center">
            <p className="text-4xl" aria-hidden="true">
              🌱
            </p>
            <p className="mt-2 font-semibold">No open vacancies right now</p>
            <p className="text-sm text-muted">Please check again soon.</p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vacancies.map((v) => (
              <li key={v.id}>
                <VacancyCard v={v} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how" className="card">
        <p className="eyebrow">How it works</p>
        <h2 id="how" className="mt-1 text-3xl font-bold">
          Apply in four simple steps
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([emoji, t, d], i) => (
            <li key={t} className="card-soft">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl shadow-[var(--shadow-soft)]"
              >
                {emoji}
              </span>
              <p className="mt-4 text-xs font-semibold text-muted">Step {i + 1}</p>
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="cta"
        className="hero-gradient flex flex-wrap items-center justify-between gap-6 rounded-[2rem] px-8 py-10"
      >
        <div>
          <h2 id="cta" className="text-3xl font-bold">
            Ready to apply?
          </h2>
          <p className="mt-2 text-muted">
            Create your account and start your application — your draft is saved as you go.
          </p>
        </div>
        <Link to="/register" className="btn-primary px-6 py-3">
          Create an account
        </Link>
      </section>
    </div>
  );
}
