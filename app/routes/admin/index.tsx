import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import {
  Alert,
  Badge,
  ConfirmDialog,
  CsrfInput,
  formatDate,
  statusTone,
  TextInput,
} from "~/components/forms";
import { EmptyState, PageHeader, Tabs } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { hasPermission } from "~/modules/auth/permissions";
import { ValidationError } from "~/modules/core/errors";
import {
  addDiscipline,
  adminOverview,
  createCycle,
  createDepartment,
  setCycleStatus,
  setVacancyStatus,
} from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Job profiles — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  return { ...(await adminOverview(user)), canManageDepartments: hasPermission(user.grants, "user:manage") };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const f = Object.fromEntries(form);
  return handleAction(async () => {
    switch (f.intent) {
      case "department":
        await createDepartment(user, f);
        return { message: "Department created. Add its HOD under Users & roles." };
      case "discipline":
        await addDiscipline(user, String(f.departmentId), f.name);
        return { message: "Discipline added." };
      case "cycle":
        await createCycle(user, f);
        return { message: "Recruitment cycle created as a draft. Publish it when the notification is out." };
      case "cycle-status":
        await setCycleStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED" | "ARCHIVED");
        return { message: "Recruitment cycle updated." };
      case "vacancy-status":
        await setVacancyStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED");
        return { message: "Job profile updated." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const TABS = [
  ["vacancies", "Job profiles"],
  ["cycles", "Recruitment cycles"],
  ["departments", "Departments"],
] as const;

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { departments, cycles, vacancies, canManageDepartments } = loaderData;
  const [params] = useSearchParams();
  const tab = TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "vacancies";
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruitment set-up"
        title="Job profiles"
        description="Create and publish job profiles (vacancies), manage recruitment cycles and departments."
        actions={
          <Link to="/admin/vacancies/new" className="btn-primary">
            + New job profile
          </Link>
        }
      />
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <Tabs
        items={TABS.map(([k, l]) => ({
          to: `?tab=${k}`,
          label: l,
          active: k === tab,
          count: k === "vacancies" ? vacancies.length : k === "cycles" ? cycles.length : departments.length,
        }))}
      />

      {tab === "vacancies" && (
        <section className="card p-0" aria-label="Job profiles">
          {vacancies.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No job profiles yet">
                Create a recruitment cycle and a department first, then{" "}
                <Link to="/admin/vacancies/new">add a job profile</Link>.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <caption className="sr-only">Job profiles</caption>
                <thead>
                  <tr>
                    <th scope="col">Job profile</th>
                    <th scope="col">Department</th>
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
                          {v.code} · {POSITION_LABELS[v.position]} · {FORM_LABELS[v.formTemplate.code]} (v
                          {v.formTemplate.version})
                        </span>
                      </td>
                      <td>
                        {v.department.name}
                        {v.discipline ? (
                          <span className="block text-sm text-muted">{v.discipline.name}</span>
                        ) : null}
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
                            triggerClassName="btn-secondary px-3 py-1.5 text-sm"
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "cycles" && (
        <section className="card space-y-5" aria-label="Recruitment cycles">
          {cycles.length === 0 ? (
            <EmptyState title="No recruitment cycles yet">Create the first cycle below.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {cycles.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4"
                >
                  <span>
                    <span className="font-semibold">{c.title}</span>{" "}
                    <span className="text-muted">
                      ({c.code} · academic year {c.academicYear ?? "—"})
                    </span>
                    <span className="block text-sm text-muted">
                      {formatDate(c.opensAt)} – {formatDate(c.closesAt)} · {c._count.vacancies} job profile
                      {c._count.vacancies === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={statusTone(c.status)}>
                      {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                    </Badge>
                    {c.status !== "ARCHIVED" && (
                      <Form method="post">
                        <CsrfInput />
                        <input type="hidden" name="intent" value="cycle-status" />
                        <input type="hidden" name="id" value={c.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={
                            c.status === "DRAFT"
                              ? "PUBLISHED"
                              : c.status === "PUBLISHED"
                                ? "CLOSED"
                                : "ARCHIVED"
                          }
                        />
                        <button type="submit" className="btn-secondary px-3 py-1.5 text-sm">
                          {c.status === "DRAFT" ? "Publish" : c.status === "PUBLISHED" ? "Close" : "Archive"}
                        </button>
                      </Form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Form method="post" className="grid gap-4 rounded-2xl bg-soft p-5 md:grid-cols-2">
            <CsrfInput />
            <input type="hidden" name="intent" value="cycle" />
            <h2 className="text-lg md:col-span-2">New recruitment cycle</h2>
            <TextInput
              label="Cycle code"
              name="code"
              required
              hint="For example FAC-2026-27"
              error={fe?.code?.[0]}
            />
            <TextInput
              label="Title"
              name="title"
              required
              hint="For example Faculty Recruitment 2026-27"
              error={fe?.title?.[0]}
            />
            <TextInput
              label="Academic year"
              name="academicYear"
              hint="Used in reference numbers, e.g. 2026-27. Leave blank to use the year of the opening date."
              error={fe?.academicYear?.[0]}
            />
            <div />
            <TextInput label="Opens" name="opensAt" type="datetime-local" required error={fe?.opensAt?.[0]} />
            <TextInput
              label="Closes"
              name="closesAt"
              type="datetime-local"
              required
              error={fe?.closesAt?.[0]}
            />
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Create cycle
              </button>
            </div>
          </Form>
        </section>
      )}

      {tab === "departments" && (
        <section className="card space-y-5" aria-label="Departments">
          {departments.length === 0 ? (
            <EmptyState title="No departments yet">
              {canManageDepartments
                ? "Create the first department below."
                : "Ask the Admin to add departments."}
            </EmptyState>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {departments.map((d) => (
                <li key={d.id} className="rounded-2xl border border-line p-4">
                  <p className="font-semibold">
                    {d.name}{" "}
                    <span className="rounded-md bg-soft px-1.5 py-0.5 font-mono text-sm">{d.code}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    HOD:{" "}
                    {d.roles.length
                      ? d.roles.map((r) => r.user.profile?.fullName ?? r.user.email).join(", ")
                      : "not set up"}{" "}
                    · {d._count.vacancies} job profile{d._count.vacancies === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Disciplines: {d.disciplines.length ? d.disciplines.map((x) => x.name).join(", ") : "none"}
                  </p>
                  {canManageDepartments && (
                    <Form method="post" className="mt-3 flex flex-wrap items-end gap-2">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="discipline" />
                      <input type="hidden" name="departmentId" value={d.id} />
                      <label htmlFor={`disc-${d.id}`} className="sr-only">
                        New discipline for {d.name}
                      </label>
                      <input
                        id={`disc-${d.id}`}
                        name="name"
                        placeholder="Add a discipline"
                        className="field-input w-56 py-2"
                        required
                      />
                      <button type="submit" className="btn-secondary py-2">
                        Add
                      </button>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManageDepartments && (
            <Form
              method="post"
              className="grid gap-4 rounded-2xl bg-soft p-5 md:grid-cols-[12rem_1fr_auto] md:items-end"
            >
              <CsrfInput />
              <input type="hidden" name="intent" value="department" />
              <h2 className="text-lg md:col-span-3">New department</h2>
              <TextInput
                label="Short code"
                name="code"
                required
                hint="Used in reference numbers, e.g. CSE"
                error={fe?.code?.[0]}
              />
              <TextInput
                label="Department name"
                name="name"
                required
                hint="e.g. Computer Science and Engineering"
                error={fe?.name?.[0]}
              />
              <button type="submit" className="btn-primary">
                Create department
              </button>
            </Form>
          )}
        </section>
      )}
    </div>
  );
}
