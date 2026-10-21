import { Link } from "react-router";
import { motion } from "framer-motion";
import { formatDate } from "~/components/forms";
import { POSITION_LABELS } from "~/lib/labels";

const POSITION_EMOJI: Record<string, string> = {
  ASSISTANT_PROFESSOR: "🎓",
  ASSOCIATE_PROFESSOR: "📚",
  PROFESSOR: "🏛️",
};
const POSITION_TILE: Record<string, string> = {
  ASSISTANT_PROFESSOR: "bg-tile-pink",
  ASSOCIATE_PROFESSOR: "bg-tile-purple",
  PROFESSOR: "bg-tile-blue",
};

export interface VacancyCardData {
  code: string;
  title: string;
  position: string;
  closesAt: Date | string;
  numberOfPosts: number | null;
  department: { name: string };
  discipline: { name: string } | null;
}

export function daysLeft(closesAt: Date | string): number {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 86400_000));
}

/** Vacancy card in modern executive style with smooth Framer Motion interactions and responsive layout. */
export function VacancyCard({ v }: { v: VacancyCardData }) {
  const days = daysLeft(v.closesAt);
  return (
    <motion.article
      whileHover={{ y: -4, transition: { duration: 0.22, ease: "easeOut" } }}
      whileTap={{ scale: 0.99 }}
      className="card flex h-full flex-col justify-between gap-5 transition-shadow duration-300 hover:shadow-[var(--shadow-float)] border border-line/70 hover:border-brand-600/35"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 sm:gap-3.5">
          <span
            aria-hidden="true"
            className={`grid h-12 w-12 sm:h-13 sm:w-13 shrink-0 place-items-center rounded-2xl text-xl sm:text-2xl shadow-xs transition-transform duration-300 group-hover:scale-105 ${POSITION_TILE[v.position] ?? "bg-soft"}`}
          >
            {POSITION_EMOJI[v.position] ?? "💼"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-muted">
              {v.department.name}
            </p>
            <h3 className="mt-1 text-base sm:text-lg font-bold leading-snug">
              <Link
                to={`/vacancies/${v.code}`}
                className="text-ink no-underline hover:text-brand-700 transition-colors"
              >
                {v.title}
              </Link>
            </h3>
          </div>
        </div>

        <ul className="flex flex-wrap gap-1.5 sm:gap-2" aria-label="Details">
          <li className="chip font-medium text-ink bg-soft/70 border-line">{POSITION_LABELS[v.position]}</li>
          {v.discipline && <li className="chip text-muted">{v.discipline.name}</li>}
          {v.numberOfPosts ? (
            <li className="chip text-muted">
              {v.numberOfPosts} post{v.numberOfPosts > 1 ? "s" : ""}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-t border-line/70 pt-4 text-sm">
        <span className="text-xs sm:text-sm text-muted">
          <span aria-hidden="true">⏳ </span>
          {days <= 7 ? (
            <strong className="text-warning font-semibold">
              {days} day{days === 1 ? "" : "s"} left
            </strong>
          ) : (
            <>Closes {formatDate(v.closesAt)}</>
          )}
        </span>
        <Link
          to={`/vacancies/${v.code}`}
          className="btn-primary px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold shrink-0"
          aria-label={`View details for ${v.title}`}
        >
          View Position →
        </Link>
      </div>
    </motion.article>
  );
}
