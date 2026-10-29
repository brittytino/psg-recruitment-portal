import { Link } from "react-router";
import { ArrowRight, CalendarClock, FlaskConical, GraduationCap, Users } from "lucide-react";
import { formatDate } from "~/components/forms";
import { POSITION_LABELS } from "~/lib/labels";

export interface VacancyCardData {
  code: string;
  title: string;
  position?: string | null;
  recruitmentCategory?: string;
  researchPositionTitle?: string | null;
  researchSpecialisation?: { name: string } | null;
  closesAt: Date | string;
  numberOfPosts: number | null;
  department?: { name: string } | null;
  discipline?: { name: string } | null;
}

export function daysLeft(closesAt: Date | string): number {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 86400_000));
}

/** Vacancy summary card: the whole card is one link target (the title), details below. */
export function VacancyCard({ v }: { v: VacancyCardData }) {
  const days = daysLeft(v.closesAt);
  const isResearch = v.recruitmentCategory === "RESEARCH";
  const where = v.department?.name ?? v.researchSpecialisation?.name ?? "Research";
  const position =
    v.researchPositionTitle ??
    (v.position ? (POSITION_LABELS[v.position] ?? v.position) : "Research position");
  const Icon = isResearch ? FlaskConical : GraduationCap;

  return (
    <article className="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-paper p-5 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-soft)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="icon-tile">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="rounded-md bg-soft px-2 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {isResearch ? "Research" : "Faculty"}
        </span>
      </div>
      <p className="mt-4 truncate text-xs font-semibold tracking-wide text-muted uppercase">{where}</p>
      <h3 className="mt-1 text-lg leading-snug">
        <Link
          to={`/vacancies/${v.code}`}
          className="text-ink no-underline after:absolute after:inset-0 after:rounded-[var(--radius-card)] group-hover:text-brand-700"
        >
          {position}
        </Link>
      </h3>
      {v.discipline && <p className="mt-0.5 text-sm text-muted">{v.discipline.name}</p>}

      <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Closing date</dt>
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <dd className={days <= 7 ? "font-semibold text-warning" : ""}>
            {days <= 7 ? `${days} day${days === 1 ? "" : "s"} left` : `Closes ${formatDate(v.closesAt)}`}
          </dd>
        </div>
        {v.numberOfPosts ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Posts</dt>
            <Users className="h-4 w-4" aria-hidden="true" />
            <dd>
              {v.numberOfPosts} post{v.numberOfPosts === 1 ? "" : "s"}
            </dd>
          </div>
        ) : null}
      </dl>
      <span
        aria-hidden="true"
        className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-brand-700"
      >
        View & apply <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </article>
  );
}
