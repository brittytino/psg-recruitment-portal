import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/audit";
import { formatDateTime } from "~/components/forms";
import { requireStaff } from "~/lib/http.server";
import { auditLog } from "~/modules/reporting/applications.server";

export const meta: Route.MetaFunction = () => [{ title: "Audit log — Recruitment workspace" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "audit:read");
  const url = new URL(request.url);
  const entityId = url.searchParams.get("entityId") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  return {
    log: await auditLog(user, {
      entityId: entityId && /^[0-9a-f-]{36}$/.test(entityId) ? entityId : undefined,
      action: action?.slice(0, 60),
      page,
    }),
    page,
  };
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const { log, page } = loaderData;
  const [params] = useSearchParams();
  const link = (p: number) => {
    const s = new URLSearchParams(params);
    s.set("page", String(p));
    return `?${s}`;
  };
  return (
    <div className="page-stack">
      <h1>Audit log</h1>
      <p className="text-sm text-muted">
        Append-only record of sign-ins, submissions, decisions, privileged access and configuration changes.
      </p>
      <Form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="action" className="block text-sm font-medium">
            Action starts with
          </label>
          <input
            id="action"
            name="action"
            defaultValue={params.get("action") ?? ""}
            placeholder="e.g. application."
            className="field-input mt-1"
          />
        </div>
        <div>
          <label htmlFor="entityId" className="block text-sm font-medium">
            Entity id
          </label>
          <input
            id="entityId"
            name="entityId"
            defaultValue={params.get("entityId") ?? ""}
            className="field-input mt-1 w-96"
          />
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </Form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <caption className="sr-only">Audit events</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {log.rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td>{r.actor?.email ?? "system"}</td>
                <td>{r.action}</td>
                <td className="text-xs">
                  {r.entityType}
                  {r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="text-xs">
                  <code>{JSON.stringify(r.metadata)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex gap-2 text-sm">
        {page > 1 && <Link to={link(page - 1)}>Previous</Link>}
        <span>
          Page {page} of {log.pages}
        </span>
        {page < log.pages && <Link to={link(page + 1)}>Next</Link>}
      </nav>
    </div>
  );
}
