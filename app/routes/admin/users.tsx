import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/users";
import {
  Alert,
  Badge,
  ConfirmDialog,
  CsrfInput,
  ErrorSummary,
  formatDateTime,
  TextInput,
} from "~/components/forms";
import { EmptyState, PageHeader, Tabs } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  type RoleName,
  type StaffRole,
} from "~/modules/auth/permissions";
import { prisma } from "~/modules/core/db.server";
import { ValidationError } from "~/modules/core/errors";
import {
  createStaffUser,
  grantRole,
  listStaff,
  renameUser,
  resendInvite,
  revokeRole,
  setUserStatus,
  signOutEverywhere,
} from "~/modules/users/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Users and roles — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "user:manage");
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const rawRole = url.searchParams.get("role");
  const role = rawRole === "CANDIDATE" ? "CANDIDATE" : STAFF_ROLES.find((r) => r === rawRole);
  const [users, departments, counts] = await Promise.all([
    listStaff(user, q, role),
    prisma.department.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.userRole.groupBy({
      by: ["role"],
      where: { role: { in: [...STAFF_ROLES, "CANDIDATE"] } },
      _count: { _all: true },
    }),
  ]);
  return {
    users,
    departments,
    selfId: user.id,
    role: role ?? null,
    counts: Object.fromEntries(counts.map((c) => [c.role, c._count._all])),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "user:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    switch (form.get("intent")) {
      case "create":
        await createStaffUser(user, {
          ...Object.fromEntries(form),
          departmentIds: form.getAll("departmentIds"),
        });
        return {
          message: "Account created and the sign-in instructions have been e-mailed.",
        };
      case "grant":
        await grantRole(user, Object.fromEntries(form));
        return { message: "Role added." };
      case "revoke":
        await revokeRole(user, String(form.get("roleId")));
        return { message: "Role removed." };
      case "status":
        await setUserStatus(
          user,
          String(form.get("userId")),
          form.get("status") === "DISABLED" ? "DISABLED" : "ACTIVE",
        );
        return { message: "Account status updated." };
      case "signout":
        await signOutEverywhere(user, String(form.get("userId")));
        return { message: "All sessions of this account were ended." };
      case "rename":
        await renameUser(user, String(form.get("userId")), form.get("fullName"));
        return { message: "Name updated." };
      case "invite":
        await resendInvite(user, String(form.get("userId")));
        return { message: "Sign-in instructions e-mailed again." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const { users, departments, selfId, role, counts } = loaderData;
  const [params] = useSearchParams();
  const [newRole, setNewRole] = useState<StaffRole>("HOD");
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[]> } | undefined;
  const fe = a?.fieldErrors;
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin"
        title="Users and roles"
        description="Add staff accounts and manage their roles. New users receive an e-mail with the sign-in link; every sign-in uses a one-time code sent to their e-mail."
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !fe && <Alert tone="danger">{a.formError}</Alert>}

      <section className="card space-y-5" aria-labelledby="new-staff">
        <h2 id="new-staff" className="text-xl">
          Add a staff member
        </h2>
        <ErrorSummary
          messages={
            fe
              ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
              : []
          }
        />
        <Form method="post" className="space-y-5">
          <CsrfInput />
          <input type="hidden" name="intent" value="create" />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput
              label="Full name"
              name="fullName"
              required
              hint="As it should appear, e.g. Dr. R. Kumar"
              error={fe?.fullName?.[0]}
            />
            <TextInput
              label="Official e-mail address"
              name="email"
              type="email"
              required
              hint="e.g. hod.cse@psgtech.ac.in"
              error={fe?.email?.[0]}
            />
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Role</legend>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {STAFF_ROLES.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-soft"
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={newRole === r}
                    onChange={() => setNewRole(r)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block font-semibold">{ROLE_LABELS[r]}</span>
                    <span className="text-sm text-muted">{ROLE_DESCRIPTIONS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {newRole === "HOD" && (
            <fieldset id="f-departmentIds">
              <legend className="text-sm font-semibold">
                Department(s) this HOD reviews <span className="text-danger">*</span>
              </legend>
              {departments.length === 0 ? (
                <p className="mt-2 text-sm text-warning">
                  Create the department first under <a href="/admin/departments">Departments &amp; HODs</a>.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {departments.map((d) => (
                    <label key={d.id} className="flex items-center gap-2.5 text-[15px]">
                      <input type="checkbox" name="departmentIds" value={d.id} className="h-4 w-4" />
                      {d.name} ({d.code})
                    </label>
                  ))}
                </div>
              )}
              {fe?.departmentIds && <p className="mt-1 text-sm text-danger">{fe.departmentIds[0]}</p>}
            </fieldset>
          )}
          <button type="submit" className="btn-primary">
            Create account and send invitation
          </button>
        </Form>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          items={[
            { to: "?", label: "All staff", active: !role },
            ...STAFF_ROLES.map((r) => ({
              to: `?role=${r}`,
              label: ROLE_LABELS[r],
              active: role === r,
              count: counts[r] ?? 0,
            })),
            {
              to: "?role=CANDIDATE",
              label: "Candidates",
              active: role === "CANDIDATE",
              count: counts.CANDIDATE ?? 0,
            },
          ]}
        />
        <Form method="get" className="flex items-end gap-2">
          {role && <input type="hidden" name="role" value={role} />}
          <div>
            <label htmlFor="q" className="sr-only">
              Search staff
            </label>
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Search name or e-mail"
              defaultValue={params.get("q") ?? ""}
              className="field-input w-64"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </Form>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title={role === "CANDIDATE" ? "No candidate accounts found" : "No staff accounts found"}
        />
      ) : (
        <ul className="space-y-3">
          {users.map((u) => {
            const staffRoles = u.roles.filter((r) => r.role !== "CANDIDATE");
            const isCandidate = staffRoles.length === 0;
            return (
              <li key={u.id} className="card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{u.profile?.fullName ?? u.email}</p>
                    <p className="text-sm text-muted">
                      {u.email} · last sign-in {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>
                      {u.status === "ACTIVE" ? "Active" : "Disabled"}
                    </Badge>
                    {isCandidate && <Badge tone="info">Candidate</Badge>}
                    {u.id !== selfId && (
                      <Form method="post">
                        <CsrfInput />
                        <input type="hidden" name="intent" value="signout" />
                        <input type="hidden" name="userId" value={u.id} />
                        <ConfirmDialog
                          trigger="Sign out everywhere"
                          triggerClassName="btn-secondary btn-sm"
                          title={`End every session of ${u.profile?.fullName ?? u.email}?`}
                          confirmLabel="Sign out"
                        >
                          <p>They are signed out on every device and need a new e-mail code to sign in.</p>
                        </ConfirmDialog>
                      </Form>
                    )}
                    {!u.lastLoginAt && !isCandidate && (
                      <Form method="post">
                        <CsrfInput />
                        <input type="hidden" name="intent" value="invite" />
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="btn-secondary px-3 py-1.5 text-sm">
                          Resend invitation
                        </button>
                      </Form>
                    )}
                    {u.id !== selfId && (
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
                          triggerClassName="btn-secondary px-3 py-1.5 text-sm"
                          tone={u.status === "ACTIVE" ? "danger" : "primary"}
                          title={`${u.status === "ACTIVE" ? "Disable" : "Enable"} ${u.profile?.fullName ?? u.email}?`}
                          confirmLabel="Confirm"
                        >
                          <p>
                            {u.status === "ACTIVE"
                              ? "They are signed out immediately and cannot sign in."
                              : "They will be able to sign in again."}
                          </p>
                        </ConfirmDialog>
                      </Form>
                    )}
                  </div>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit name</summary>
                  <Form method="post" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="rename" />
                    <input type="hidden" name="userId" value={u.id} />
                    <label htmlFor={`name-${u.id}`} className="sr-only">
                      Full name
                    </label>
                    <input
                      id={`name-${u.id}`}
                      name="fullName"
                      required
                      minLength={2}
                      defaultValue={u.profile?.fullName ?? ""}
                      className="field-input sm:max-w-sm"
                    />
                    <button type="submit" className="btn-secondary btn-sm">
                      Save name
                    </button>
                  </Form>
                </details>
                {!isCandidate && (
                  <ul className="flex flex-wrap gap-2" aria-label="Roles">
                    {staffRoles.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 rounded-full border border-line bg-soft py-1 pl-3 pr-1 text-sm"
                      >
                        <span className="font-medium">
                          {ROLE_LABELS[r.role as RoleName]}
                          {r.department ? ` — ${r.department.code}` : ""}
                        </span>
                        <Form method="post">
                          <CsrfInput />
                          <input type="hidden" name="intent" value="revoke" />
                          <input type="hidden" name="roleId" value={r.id} />
                          <ConfirmDialog
                            trigger="Remove"
                            triggerClassName="rounded-full px-2 py-0.5 text-xs font-semibold text-danger hover:bg-danger-50"
                            tone="danger"
                            title="Remove this role?"
                            confirmLabel="Remove role"
                          >
                            <p>
                              {ROLE_LABELS[r.role as RoleName]}
                              {r.department ? ` (${r.department.name})` : ""} will be removed from {u.email}.
                            </p>
                          </ConfirmDialog>
                        </Form>
                      </li>
                    ))}
                  </ul>
                )}
                {!isCandidate && (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                      Add a role
                    </summary>
                    <Form method="post" className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="grant" />
                      <input type="hidden" name="userId" value={u.id} />
                      <div>
                        <label htmlFor={`role-${u.id}`} className="block text-sm font-semibold">
                          Role
                        </label>
                        <select id={`role-${u.id}`} name="role" className="field-input mt-1">
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`dept-${u.id}`} className="block text-sm font-semibold">
                          Department (for HOD)
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
                      <button type="submit" className="btn-secondary">
                        Add role
                      </button>
                    </Form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
