import { Form, Link } from "react-router";
import type { Route } from "./+types/index";
import { Alert, Badge, ConfirmDialog, CsrfInput, formatDateTime, statusTone, TextInput } from "~/components/forms";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { FORM_LABELS, POSITION_LABELS } from "~/lib/labels";
import { ValidationError } from "~/modules/core/errors";
import { addDiscipline, adminOverview, createCycle, createDepartment, setCycleStatus, setVacancyStatus } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Recruitment administration" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  return adminOverview(user);
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const f = Object.fromEntries(form);
  return handleAction(async () => {
    switch (f.intent) {
      case "department":
        await createDepartment(user, f);
        return { message: "Department created." };
      case "discipline":
        await addDiscipline(user, String(f.departmentId), f.name);
        return { message: "Discipline added." };
      case "cycle":
        await createCycle(user, f);
        return { message: "Recruitment cycle created (draft)." };
      case "cycle-status":
        await setCycleStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED" | "ARCHIVED");
        return { message: "Recruitment cycle updated." };
      case "vacancy-status":
        await setVacancyStatus(user, String(f.id), f.status as "PUBLISHED" | "CLOSED");
        return { message: "Vacancy updated." };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { departments, cycles, vacancies, templates } = loaderData;
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Recruitment administration</h1>
        <Link to="/admin/vacancies/new" className="btn-primary">
          Create vacancy
        </Link>
      </div>
      {actionData && "message" in actionData && actionData.message && <Alert tone="success">{actionData.message}</Alert>}
      {actionData && "formError" in actionData && actionData.formError && <Alert tone="danger">{actionData.formError}</Alert>}

      <section className="card overflow-x-auto" aria-labelledby="vac">
        <h2 id="vac">Vacancies</h2>
        <table className="table mt-3">
          <caption className="sr-only">Vacancies</caption>
          <thead>
            <tr>
              <th scope="col">Code / title</th>
              <th scope="col">Department</th>
              <th scope="col">Form</th>
              <th scope="col">Window</th>
              <th scope="col">Status</th>
              <th scope="col">Applications</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {vacancies.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="font-medium">{v.code}</span>
                  <span className="block text-xs text-muted">
                    {v.title} · {POSITION_LABELS[v.position]}
                  </span>
                </td>
                <td>
                  {v.department.name}
                  {v.discipline ? ` · ${v.discipline.name}` : ""}
                </td>
                <td className="text-xs">
                  {FORM_LABELS[v.formTemplate.code]} v{v.formTemplate.version}
                </td>
                <td className="text-xs">
                  {formatDateTime(v.opensAt)} – {formatDateTime(v.closesAt)}
                </td>
                <td>
                  <Badge tone={statusTone(v.status)}>{v.status}</Badge>
                </td>
                <td>{v._count.applications}</td>
                <td>
                  {(v.status === "DRAFT" || v.status === "CLOSED" || v.status === "PUBLISHED") && (
                    <Form method="post">
                      <CsrfInput />
                      <input type="hidden" name="intent" value="vacancy-status" />
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="status" value={v.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED"} />
                      <ConfirmDialog trigger={v.status === "PUBLISHED" ? "Close" : "Publish"} triggerClassName="btn-secondary py-1" title={`${v.status === "PUBLISHED" ? "Close" : "Publish"} ${v.code}?`} confirmLabel="Confirm" tone={v.status === "PUBLISHED" ? "danger" : "primary"}>
                        <p>{v.status === "PUBLISHED" ? "Candidates will no longer be able to start or submit applications." : "The vacancy becomes publicly visible and open for applications within its window."}</p>
                      </ConfirmDialog>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-4" aria-labelledby="cyc">
        <h2 id="cyc">Recruitment cycles</h2>
        <ul className="space-y-2 text-sm">
          {cycles.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2">
              <span>
                <span className="font-medium">{c.title}</span> ({c.code}) · {formatDateTime(c.opensAt)} – {formatDateTime(c.closesAt)} · {c._count.vacancies} vacancies
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                {c.status !== "ARCHIVED" && (
                  <Form method="post">
                    <CsrfInput />
                    <input type="hidden" name="intent" value="cycle-status" />
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={c.status === "DRAFT" ? "PUBLISHED" : c.status === "PUBLISHED" ? "CLOSED" : "ARCHIVED"} />
                    <button type="submit" className="btn-secondary py-1">
                      {c.status === "DRAFT" ? "Publish" : c.status === "PUBLISHED" ? "Close" : "Archive"}
                    </button>
                  </Form>
                )}
              </span>
            </li>
          ))}
        </ul>
        <Form method="post" className="grid gap-3 rounded border border-line p-3 md:grid-cols-2">
          <CsrfInput />
          <input type="hidden" name="intent" value="cycle" />
          <TextInput label="Cycle code" name="code" required hint="e.g. FAC-2026-27" error={fe?.code?.[0]} />
          <TextInput label="Title" name="title" required error={fe?.title?.[0]} />
          <TextInput label="Opens" name="opensAt" type="datetime-local" required error={fe?.opensAt?.[0]} />
          <TextInput label="Closes" name="closesAt" type="datetime-local" required error={fe?.closesAt?.[0]} />
          <div className="md:col-span-2">
            <button type="submit" className="btn-secondary">
              Create cycle
            </button>
          </div>
        </Form>
      </section>

      <section className="card space-y-4" aria-labelledby="dep">
        <h2 id="dep">Departments and disciplines</h2>
        <ul className="space-y-2 text-sm">
          {departments.map((d) => (
            <li key={d.id} className="rounded border border-line p-2">
              <p>
                <span className="font-medium">{d.name}</span> ({d.code}) · {d._count.vacancies} vacancies
              </p>
              <p className="text-muted">Disciplines: {d.disciplines.length ? d.disciplines.map((x) => x.name).join(", ") : "none"}</p>
              <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
                <CsrfInput />
                <input type="hidden" name="intent" value="discipline" />
                <input type="hidden" name="departmentId" value={d.id} />
                <label htmlFor={`disc-${d.id}`} className="sr-only">
                  New discipline for {d.name}
                </label>
                <input id={`disc-${d.id}`} name="name" placeholder="New discipline" className="field-input w-64 py-1" required />
                <button type="submit" className="btn-secondary py-1">
                  Add discipline
                </button>
              </Form>
            </li>
          ))}
        </ul>
        <Form method="post" className="grid gap-3 rounded border border-line p-3 md:grid-cols-3 md:items-end">
          <CsrfInput />
          <input type="hidden" name="intent" value="department" />
          <TextInput label="Code" name="code" required hint="e.g. CSE" />
          <TextInput label="Name" name="name" required />
          <button type="submit" className="btn-secondary">
            Create department
          </button>
        </Form>
      </section>

      <section className="card" aria-labelledby="tpl">
        <h2 id="tpl">Official form templates</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {templates.map((t) => (
            <li key={t.id}>
              {FORM_LABELS[t.code]} — version {t.version} {t.active ? "(active)" : "(inactive)"} · SHA-256 <code className="text-xs">{t.sha256.slice(0, 16)}…</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
