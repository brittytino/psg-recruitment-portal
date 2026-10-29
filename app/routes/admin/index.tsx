import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { Pencil, Plus } from "lucide-react";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDate, statusTone } from "~/components/forms";
import { EmptyState, PageHeader, Tabs } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { ValidationError } from "~/modules/core/errors";
import { adminOverview, setVacancyStatus } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Job profiles — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const { vacancies } = await adminOverview(user);
  return { vacancies };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const f = Object.fromEntries(form);
  return handleAction(async () => {
    switch (f.intent) {
      case "vacancy-status":
        await setVacancyStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED");
        return { message: "Job profile updated." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const TABS = [
  ["all", "All"],
  ["PUBLISHED", "Published"],
  ["DRAFT", "Drafts"],
  ["CLOSED", "Closed"],
] as const;

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { vacancies: all } = loaderData;
  const [params] = useSearchParams();
  const tab = TABS.find(([k]) => k === params.get("status"))?.[0] ?? "all";
  const vacancies = tab === "all" ? all : all.filter((v) => v.status === tab);
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Recruitment set-up"
        title="Job profiles"
        description="Create job openings, publish them for candidates and close them when the last date passes."
        actions={
          <Link to="/admin/vacancies/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New job opening
          </Link>
        }
      />
      {params.get("updated") === "1" && !actionData && <Alert tone="success">Job opening updated.</Alert>}
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <Tabs
        items={TABS.map(([k, l]) => ({
          to: k === "all" ? "?" : `?status=${k}`,
          label: l,
          active: k === tab,
          count: k === "all" ? all.length : all.filter((v) => v.status === k).length,
        }))}
      />

      <section className="card p-0" aria-label="Job profiles">
        {vacancies.length === 0 ? (
          <div className="p-6">
            <EmptyState title={tab === "all" ? "No job openings yet" : "Nothing here"}>
              <Link to="/admin/vacancies/new">Create a job opening</Link> — it starts as a draft.
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Job profiles</caption>
              <thead>
                <tr>
                  <th scope="col">Job profile</th>
                  <th scope="col">Department / Specialisation</th>
                  <th scope="col">Posts</th>
                  <th scope="col">Open</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Applications
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="font-semibold">{v.title}</span>
                      <span className="block text-sm text-muted">
                        {v.code} ·{" "}
                        {v.position
                          ? (POSITION_LABELS[v.position] ?? v.position)
                          : (v.researchPositionTitle ?? "Research Assistant")}{" "}
                      </span>
                    </td>
                    <td>
                      {v.department ? (
                        <>
                          {v.department.name}
                          {v.discipline ? (
                            <span className="block text-sm text-muted">{v.discipline.name}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="font-medium text-ink">
                          {v.researchSpecialisation?.name ?? "Research"}
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums">{v.numberOfPosts ?? "—"}</td>
                    <td className="whitespace-nowrap text-sm">
                      {formatDate(v.opensAt)} – {formatDate(v.closesAt)}
                    </td>
                    <td>
                      <Badge tone={statusTone(v.status)}>
                        {v.status === "PUBLISHED" ? "Published" : v.status === "DRAFT" ? "Draft" : "Closed"}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums">{v._count.applications}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/vacancies/${v.id}/edit`} className="btn-secondary btn-sm">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                        </Link>
                        <Form method="post">
                          <CsrfInput />
                          <input type="hidden" name="intent" value="vacancy-status" />
                          <input type="hidden" name="id" value={v.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={v.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED"}
                          />
                          <ConfirmDialog
                            trigger={v.status === "PUBLISHED" ? "Close" : "Publish"}
                            triggerClassName="btn-secondary btn-sm"
                            title={`${v.status === "PUBLISHED" ? "Close" : "Publish"} ${v.code}?`}
                            confirmLabel="Confirm"
                            tone={v.status === "PUBLISHED" ? "danger" : "primary"}
                          >
                            <p>
                              {v.status === "PUBLISHED"
                                ? "Candidates will no longer be able to start or submit applications."
                                : "The job profile becomes public and open for applications within its dates."}
                            </p>
                          </ConfirmDialog>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
