import { ChevronRight, Search } from "lucide-react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/articles";
import { CandidateHelpDeskShell } from "~/components/helpdesk";
import { EmptyState, PageHeader } from "~/components/staff";
import { userContext } from "~/context";
import { publishedArticles } from "~/modules/helpdesk/articles.server";

export const meta: Route.MetaFunction = () => [{ title: "Help articles — Help desk" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? "";
  return { q, signedIn: !!context.get(userContext), articles: await publishedArticles(q) };
}

export default function Articles({ loaderData: L }: Route.ComponentProps) {
  const topics = [...new Set(L.articles.map((a) => a.topic))];
  return (
    <CandidateHelpDeskShell signedIn={L.signedIn}>
      <div className="page-stack">
        <PageHeader
          crumbs={[["Help desk", "/help-desk"], ["Help articles"]]}
          title="Help articles"
          description="Step-by-step guidance from the recruitment office."
        />
        <Form method="get" className="relative max-w-xl" role="search">
          <label htmlFor="a-q" className="sr-only">
            Search help articles
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="a-q"
            name="q"
            defaultValue={L.q}
            placeholder="Search articles"
            className="field-input pl-9"
          />
        </Form>
        {L.articles.length === 0 ? (
          <div className="card">
            <EmptyState title={L.q ? `No articles match “${L.q}”` : "No help articles yet"}>
              {L.q ? (
                <Link to="/help-desk/articles">Show all articles</Link>
              ) : (
                "The recruitment office has not published any articles yet."
              )}{" "}
              You can <Link to="/help-desk/new">create a support ticket</Link> instead.
            </EmptyState>
          </div>
        ) : (
          topics.map((topic) => (
            <section key={topic} className="space-y-3" aria-label={topic}>
              <h2 className="text-lg">{topic}</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {L.articles
                  .filter((a) => a.topic === topic)
                  .map((a) => (
                    <li key={a.slug}>
                      <Link
                        to={`/help-desk/articles/${a.slug}`}
                        className="card flex h-full items-start gap-3 p-4 no-underline hover:border-brand-200"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{a.title}</span>
                          <span className="mt-1 block text-sm text-muted">{a.summary}</span>
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </CandidateHelpDeskShell>
  );
}
