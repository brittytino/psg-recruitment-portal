import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/users";
import { Alert, Badge, ConfirmDialog, CsrfInput, TextInput } from "~/components/forms";
import { handleAction, readForm, requireUser } from "~/lib/http.server";
import { hasPermission, ROLE_LABELS, type RoleName } from "~/modules/auth/permissions";
import { ForbiddenError, ValidationError } from "~/modules/core/errors";
import { prisma } from "~/modules/core/db.server";
import {
  createStaffUser,
  grantableRoles,
  grantRole,
  listUsers,
  revokeRole,
  setUserStatus,
} from "~/modules/users/service.server";
import { data } from "react-router";

export const meta: Route.MetaFunction = () => [{ title: "Users and roles — Administration" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const roles = grantableRoles(user);
  if (!roles.length) throw data("You do not have access to this page.", { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) || undefined;
  const [users, departments, cycles] = await Promise.all([
    listUsers(user, q),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.recruitmentCycle.findMany({ orderBy: { opensAt: "desc" }, select: { id: true, title: true } }),
  ]);
  return {
    users,
    departments,
    cycles,
    roles,
    canCreate: hasPermission(user.grants, "user:manage"),
    selfId: user.id,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "create":
        await createStaffUser(user, Object.fromEntries(form));
        return { message: "Staff account created. A password-setup link has been e-mailed." };
      case "grant":
        await grantRole(user, Object.fromEntries(form));
        return { message: "Role granted." };
      case "revoke":
        await revokeRole(user, String(form.get("roleId")));
        return { message: "Role revoked." };
      case "status":
        await setUserStatus(
          user,
          String(form.get("userId")),
          form.get("status") === "DISABLED" ? "DISABLED" : "ACTIVE",
        );
        return { message: "Account status updated." };
      default:
        throw new ValidationError("Unknown action");
    }
  }).catch((e) => {
    if (e instanceof ForbiddenError) throw data("Forbidden", { status: 403 });
    throw e;
  });
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const { users, departments, cycles, roles, canCreate, selfId } = loaderData;
  const [params] = useSearchParams();
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  return (
    <div className="space-y-6">
      <h1>Users and roles</h1>
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      {canCreate && (
        <section className="card" aria-labelledby="new-staff">
          <h2 id="new-staff">Create a staff account</h2>
          <Form method="post" className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <CsrfInput />
            <input type="hidden" name="intent" value="create" />
            <TextInput label="Full name" name="fullName" required error={fe?.fullName?.[0]} />
            <TextInput label="E-mail" name="email" type="email" required error={fe?.email?.[0]} />
            <button type="submit" className="btn-primary">
              Create and send invitation
            </button>
          </Form>
        </section>
      )}
      <Form method="get" className="flex items-end gap-2">
        <div>
          <label htmlFor="q" className="block text-sm font-medium">
            Search staff
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={params.get("q") ?? ""}
            className="field-input mt-1"
          />
        </div>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </Form>
      <ul className="space-y-4">
        {users.map((u) => (
          <li key={u.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{u.profile?.fullName ?? u.email}</p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>
                  {u.status === "ACTIVE" ? "Active" : "Disabled"}
                </Badge>
                {canCreate && u.id !== selfId && (
                  <Form method="post">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="status" />
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
                    />
                    <ConfirmDialog
                      trigger={u.status === "ACTIVE" ? "Disable" : "Enable"}
                      triggerClassName="btn-secondary py-1"
                      tone={u.status === "ACTIVE" ? "danger" : "primary"}
                      title={`${u.status === "ACTIVE" ? "Disable" : "Enable"} this account?`}
                      confirmLabel="Confirm"
                    >
                      <p>
                        {u.status === "ACTIVE"
                          ? "The user is signed out immediately and cannot sign in."
                          : "The user will be able to sign in again."}
                      </p>
                    </ConfirmDialog>
                  </Form>
                )}
              </div>
            </div>
            <ul className="flex flex-wrap gap-2">
              {u.roles.map((r) => (
                <li key={r.id} className="flex items-center gap-1 rounded-full bg-soft px-3 py-1 text-sm">
                  {ROLE_LABELS[r.role as RoleName]}
                  {r.department ? ` — ${r.department.name}` : ""}
                  {r.role === "HR_OFFICER" ? ` — ${r.cycle?.title ?? "all cycles"}` : ""}
                  {roles.includes(r.role as RoleName) && (
                    <Form method="post" className="inline">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="roleId" value={r.id} />
                      <button
                        type="submit"
                        className="btn-link ml-1 py-0 text-xs text-danger"
                        aria-label={`Revoke ${ROLE_LABELS[r.role as RoleName]}`}
                      >
                        Revoke
                      </button>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
            <Form method="post" className="grid gap-2 sm:grid-cols-4 sm:items-end">
              <CsrfInput />
              <input type="hidden" name="intent" value="grant" />
              <input type="hidden" name="userId" value={u.id} />
              <div>
                <label htmlFor={`role-${u.id}`} className="block text-xs font-medium">
                  Role
                </label>
                <select id={`role-${u.id}`} name="role" className="field-input mt-1">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`dept-${u.id}`} className="block text-xs font-medium">
                  Department (reviewers)
                </label>
                <select id={`dept-${u.id}`} name="departmentId" className="field-input mt-1">
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`cycle-${u.id}`} className="block text-xs font-medium">
                  Cycle (HR; blank = all)
                </label>
                <select id={`cycle-${u.id}`} name="cycleId" className="field-input mt-1">
                  <option value="">All cycles</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-secondary">
                Grant role
              </button>
            </Form>
          </li>
        ))}
      </ul>
    </div>
  );
}
