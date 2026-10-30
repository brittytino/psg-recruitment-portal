import { Link } from "react-router";
import type { Route } from "./+types/article";
import { formatDateTime } from "~/components/forms";
import { CandidateHelpDeskShell } from "~/components/helpdesk";
import { PageHeader } from "~/components/staff";
import { userContext } from "~/context";
import { publishedArticle } from "~/modules/helpdesk/articles.server";

export const meta: Route.MetaFunction = ({ data }) => [
  { title: `${data?.article.title ?? "Article"} — Help desk` },
  { name: "description", content: data?.article.summary ?? "" },
];

export async function loader({ params, context }: Route.LoaderArgs) {
  const a = await publishedArticle(params.slug);
  return {
    signedIn: !!context.get(userContext),
    article: {
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      body: a.body,
      topic: a.topic,
      updatedAt: a.updatedAt,
    },
  };
}

export default function Article({ loaderData: L }: Route.ComponentProps) {
  const a = L.article;
  // Plain text with blank lines between paragraphs; rendered as text, never as HTML.
  const paragraphs = a.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <CandidateHelpDeskShell signedIn={L.signedIn}>
      <article className="page-stack max-w-3xl">
        <PageHeader
          crumbs={[["Help desk", "/help-desk"], ["Help articles", "/help-desk/articles"], [a.topic]]}
          title={a.title}
          description={a.summary}
        />
        <div className="card space-y-4 text-[15px] leading-relaxed text-ink">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
          <p className="text-xs text-muted">Last updated {formatDateTime(a.updatedAt)}</p>
        </div>
        <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg">Did this not solve the problem?</h2>
            <p className="text-sm text-muted">Raise a ticket; we will see which article you read.</p>
          </div>
          <Link to={`/help-desk/new?article=${a.slug}`} className="btn-primary shrink-0">
            Create a support ticket
          </Link>
        </section>
      </article>
    </CandidateHelpDeskShell>
  );
}
