import { originFrom, seo } from "~/lib/seo";
import { BookOpen, ChevronRight, FileText, Plus } from "lucide-react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/index";
import { CandidateHelpDeskShell } from "~/components/helpdesk";
import { CandidateTicketTable } from "~/components/helpdesk-tickets";
import { userContext } from "~/context";
import { isStaff } from "~/modules/auth/permissions";
import { publishedArticles } from "~/modules/helpdesk/articles.server";
import { STATUS_LABEL, TICKET_STATUSES } from "~/modules/helpdesk/definitions";
import { myTickets, ticketListSchema } from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = ({ matches }) =>
  seo({
    title: "Help desk for applicants",
    description:
      "Get help with registration, sign-in codes, the application form, document uploads, the application PDF and submission. Raise a support ticket or read the help articles.",
    path: "/help-desk",
    origin: originFrom(matches),
  });

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (user && isStaff(user.grants)) throw redirect("/staff/help-desk");
  const articles = (await publishedArticles()).slice(0, 6);
  if (!user) return { signedIn: false as const, articles };
  const q = ticketListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { signedIn: true as const, articles, q, ...(await myTickets(user, q)) };
}

const STRIP: Record<string, string> = {
  OPEN: "border-danger",
  IN_PROGRESS: "border-info",
  AWAITING_CANDIDATE: "border-warning",
  RESOLVED: "border-success",
  CLOSED: "border-line-strong",
};

export default function HelpDesk({ loaderData: L }: Route.ComponentProps) {
  return (
    <CandidateHelpDeskShell signedIn={L.signedIn}>
      <div className="page-stack">
        <header className="grid gap-6 border-b border-line pb-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-muted">
              Help desk <span aria-hidden="true">›</span> <span className="text-ink">Overview</span>
            </nav>
            <h1 className="mt-2 flex items-center gap-4 text-3xl sm:text-4xl">
              Help desk <span aria-hidden="true" className="hidden h-0.5 w-12 bg-brand-600 sm:block" />
            </h1>
            <p className="mt-3 max-w-2xl text-muted">
              Having trouble with registration, the application form, uploads or submission? Raise a support
              ticket and the recruitment office will reply here. You can also read the help articles.
            </p>
          </div>
          <div className="border-l-2 border-brand-600 pl-5">
            <h2 className="text-lg">Support for applicants</h2>
            <p className="mt-1 text-sm text-muted">
              For sign-in codes, registration, the application form, document uploads, the application PDF or
              vacancy details.
            </p>
          </div>
        </header>

        {!L.signedIn ? (
          <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl">Sign in to raise a ticket</h2>
              <p className="mt-1 text-sm text-muted">
                Tickets are linked to your account so only you and the recruitment office can read them. Sign
                in with the 6-digit code sent to your e-mail.
              </p>
            </div>
            <Link to="/login?next=%2Fhelp-desk%2Fnew" className="btn-primary shrink-0">
              Sign in to continue
            </Link>
          </section>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  [
                    "/help-desk/new",
                    Plus,
                    "Create a new ticket",
                    "Tell us what is not working.",
                    "bg-brand-600 text-white",
                  ],
                  [
                    "/help-desk/tickets",
                    FileText,
                    "View my tickets",
                    "Status and replies to your requests.",
                    "bg-info-50 text-info",
                  ],
                  [
                    "/help-desk/articles",
                    BookOpen,
                    "Help articles",
                    "Answers to common questions.",
                    "bg-brand-50 text-brand-700",
                  ],
                ] as const
              ).map(([to, Icon, title, text, tone]) => (
                <Link
                  key={to}
                  to={to}
                  className="card group flex items-center gap-4 p-5 no-underline transition-colors hover:border-brand-200"
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold text-ink">{title}</span>
                    <span className="block text-sm text-muted">{text}</span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>

            <dl className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="border-l-2 border-navy-800 pl-3">
                <dt className="text-sm text-muted">All tickets</dt>
                <dd className="font-display text-2xl font-semibold">
                  {Object.values(L.counts).reduce((a, b) => a + b, 0)}
                </dd>
              </div>
              {TICKET_STATUSES.map((s) => (
                <div key={s} className={`border-l-2 pl-3 ${STRIP[s]}`}>
                  <dt className="text-sm text-muted">
                    <Link
                      to={`/help-desk/tickets?status=${s}`}
                      className="text-muted no-underline hover:text-ink"
                    >
                      {STATUS_LABEL[s]}
                    </Link>
                  </dt>
                  <dd className="font-display text-2xl font-semibold">{L.counts[s]}</dd>
                </div>
              ))}
            </dl>

            <CandidateTicketTable
              rows={L.rows}
              total={L.total}
              page={L.q.page}
              pages={L.pages}
              q={L.q}
              action="/help-desk"
            />
          </>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="card" aria-labelledby="topics">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="topics" className="text-xl">
                Common topics
              </h2>
              <Link to="/help-desk/articles" className="text-sm font-semibold">
                All articles →
              </Link>
            </div>
            {L.articles.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Help articles will appear here once the recruitment office publishes them. Until then, raise a
                ticket and we will answer you directly.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {L.articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      to={`/help-desk/articles/${a.slug}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm text-ink no-underline hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <span className="line-clamp-1">{a.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card" aria-labelledby="cant">
            <h2 id="cant" className="text-xl">
              Can’t find a solution?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Describe the problem in a ticket. Add a screenshot if you can — it helps us understand it
              quickly.
            </p>
            <Link to="/help-desk/new" className="btn-primary mt-4 w-full">
              Create a support ticket
            </Link>
          </section>
        </div>
      </div>
    </CandidateHelpDeskShell>
  );
}
