import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/help-desk-settings";
import { Alert, Badge, CsrfInput, formatDateTime } from "~/components/forms";
import { EmptyState, PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import { allArticles, saveArticle } from "~/modules/helpdesk/articles.server";
import { ARTICLE_TOPICS } from "~/modules/helpdesk/definitions";
import { getHelpdeskConfig, saveHelpdeskConfig, supportStaff } from "~/modules/helpdesk/config.server";

export const meta: Route.MetaFunction = () => [
  { title: "Help desk settings" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "helpdesk:admin");
  const [config, staff, articles] = await Promise.all([
    getHelpdeskConfig(),
    supportStaff(),
    allArticles(user),
  ]);
  return {
    config,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.profile?.fullName?.trim() || s.email,
      role: s.roles.some((r) => r.role === "SUPER_ADMIN") ? "Super Admin" : "HR – N4 Section",
    })),
    articles,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "helpdesk:admin");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "config": {
        const to = String(form.get("defaultAssigneeId") ?? "");
        await saveHelpdeskConfig(user, {
          defaultAssigneeId: to ? to : null,
          emailStaffOnNewTicket: form.get("emailStaffOnNewTicket") === "on",
        });
        return { message: "Help desk settings saved." };
      }
      case "article":
        await saveArticle(user, {
          id: form.get("id") || undefined,
          title: form.get("title"),
          summary: form.get("summary"),
          body: form.get("body"),
          topic: form.get("topic"),
          published: form.get("published") === "on",
          sortOrder: form.get("sortOrder") || 0,
        });
        return { message: "Article saved." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function HelpDeskSettings({ loaderData: L, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const busy = useNavigation().state !== "idle";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const editing = params.get("edit");
  const art = editing && editing !== "new" ? L.articles.find((x) => x.id === editing) : undefined;
  const fe = a?.fieldErrors ?? {};

  return (
    <div className="page-stack max-w-5xl">
      <PageHeader
        crumbs={[["Help desk", "/staff/help-desk"], ["Settings"]]}
        title="Help desk settings"
        description="Who receives new tickets, how staff are notified, and the help articles candidates can read."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && <Alert tone="danger">{a.formError}</Alert>}

      <Form method="post" className="card space-y-4" aria-labelledby="cfg">
        <CsrfInput />
        <input type="hidden" name="intent" value="config" />
        <h2 id="cfg" className="text-xl">
          New tickets
        </h2>
        <div>
          <label htmlFor="c-assignee" className="block text-sm font-medium">
            Assign new tickets to
          </label>
          <select
            id="c-assignee"
            name="defaultAssigneeId"
            defaultValue={L.config.defaultAssigneeId ?? ""}
            className="field-input mt-1 max-w-md"
          >
            <option value="">Nobody — they wait in the Unassigned queue</option>
            {L.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Only active HR – N4 Section and Super Admin accounts can receive tickets.
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-line p-4">
          <input
            type="checkbox"
            name="emailStaffOnNewTicket"
            defaultChecked={L.config.emailStaffOnNewTicket}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-semibold text-ink">
              Also e-mail support staff about every new ticket
            </span>
            <span className="text-sm text-muted">
              Staff always see new tickets in the bell icon. Leave this off to save the daily e-mail quota.
            </span>
          </span>
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          Save
        </button>
      </Form>

      <section className="card space-y-4" aria-labelledby="arts">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="arts" className="text-xl">
            Help articles
          </h2>
          <Link to="?edit=new" className="btn-secondary">
            New article
          </Link>
        </div>
        {L.articles.length === 0 ? (
          <EmptyState title="No articles yet">
            Write articles from the portal’s actual behaviour and the approved recruitment instructions. Only
            published articles are shown to candidates.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {L.articles.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{x.title}</span>
                  <span className="text-xs text-muted">
                    {x.topic} · updated {formatDateTime(x.updatedAt)}
                  </span>
                </span>
                <Badge tone={x.published ? "success" : "neutral"}>
                  {x.published ? "Published" : "Draft"}
                </Badge>
                <Link to={`?edit=${x.id}`} className="text-sm font-semibold">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}

        {editing && (
          <Form method="post" className="space-y-4 border-t border-line pt-4" key={editing}>
            <CsrfInput />
            <input type="hidden" name="intent" value="article" />
            {art && <input type="hidden" name="id" value={art.id} />}
            <h3 className="text-lg">{art ? `Edit “${art.title}”` : "New article"}</h3>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_6rem]">
              <div>
                <label htmlFor="ar-title" className="block text-sm font-medium">
                  Title
                </label>
                <input
                  id="ar-title"
                  name="title"
                  required
                  maxLength={150}
                  defaultValue={art?.title}
                  className="field-input mt-1"
                />
                {fe.title?.[0] && <p className="text-sm text-danger">{fe.title[0]}</p>}
              </div>
              <div>
                <label htmlFor="ar-topic" className="block text-sm font-medium">
                  Topic
                </label>
                <select id="ar-topic" name="topic" defaultValue={art?.topic} className="field-input mt-1">
                  {ARTICLE_TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ar-order" className="block text-sm font-medium">
                  Order
                </label>
                <input
                  id="ar-order"
                  name="sortOrder"
                  type="number"
                  min={0}
                  max={999}
                  defaultValue={art?.sortOrder ?? 0}
                  className="field-input mt-1"
                />
              </div>
            </div>
            <div>
              <label htmlFor="ar-summary" className="block text-sm font-medium">
                One-line summary
              </label>
              <input
                id="ar-summary"
                name="summary"
                required
                maxLength={300}
                defaultValue={art?.summary}
                className="field-input mt-1"
              />
              {fe.summary?.[0] && <p className="text-sm text-danger">{fe.summary[0]}</p>}
            </div>
            <div>
              <label htmlFor="ar-body" className="block text-sm font-medium">
                Article
              </label>
              <p className="text-xs text-muted">Plain text. Leave a blank line between paragraphs.</p>
              <textarea
                id="ar-body"
                name="body"
                required
                rows={12}
                maxLength={20000}
                defaultValue={art?.body}
                className="field-input mt-1"
              />
              {fe.body?.[0] && <p className="text-sm text-danger">{fe.body[0]}</p>}
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="published" defaultChecked={art?.published} className="h-5 w-5" />{" "}
              Published (visible to candidates)
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                Save article
              </button>
              <Link to="?" className="btn-secondary">
                Cancel
              </Link>
            </div>
          </Form>
        )}
      </section>
    </div>
  );
}
