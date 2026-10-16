import { Link } from "react-router";
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

/** Vacancy card in the style of the job cards: icon tile, title, chips, closing info, CTA. */
export function VacancyCard({ v }: { v: VacancyCardData }) {
  const days = daysLeft(v.closesAt);
  return (
    <article className="card flex h-full flex-col gap-4 transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${POSITION_TILE[v.position] ?? "bg-soft"}`}
        >
          {POSITION_EMOJI[v.position] ?? "💼"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{v.department.name}</p>
          <h3 className="mt-0.5 font-semibold leading-snug">
            <Link to={`/vacancies/${v.code}`} className="text-ink no-underline hover:underline">
              {v.title}
            </Link>
          </h3>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Details">
        <li className="chip">{POSITION_LABELS[v.position]}</li>
        {v.discipline && <li className="chip">{v.discipline.name}</li>}
        {v.numberOfPosts ? (
          <li className="chip">
            {v.numberOfPosts} post{v.numberOfPosts > 1 ? "s" : ""}
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="text-muted">
          <span aria-hidden="true">⏳ </span>
          {days <= 7 ? (
            <strong className="text-warning">
              {days} day{days === 1 ? "" : "s"} left
            </strong>
          ) : (
            <>Closes {formatDate(v.closesAt)}</>
          )}
        </span>
        <Link to={`/vacancies/${v.code}`} className="btn-primary px-4 py-2" aria-label={`View ${v.title}`}>
          View
        </Link>
      </div>
    </article>
  );
}
