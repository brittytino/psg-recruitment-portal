import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/vacancy-new";
import { Alert, CsrfInput, ErrorSummary, TextInput } from "~/components/forms";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { prisma } from "~/modules/core/db.server";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "~/modules/documents/policy";
import { createVacancy } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Create vacancy — Administration" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  requireStaff(context, request, "recruitment:manage");
  const [cycles, departments] = await Promise.all([
    prisma.recruitmentCycle.findMany({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { opensAt: "desc" },
    }),
    prisma.department.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { disciplines: { orderBy: { name: "asc" } } },
    }),
  ]);
  return { cycles, departments };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    await createVacancy(user, {
      ...Object.fromEntries(form),
      requiredDocuments: form.getAll("requiredDocuments"),
    });
    throw redirect("/admin");
  });
}

export default function VacancyNew({ loaderData, actionData }: Route.ComponentProps) {
  const { cycles, departments } = loaderData;
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) =>
        (v ?? []).map((text) => ({ text: `${k}: ${text}`, href: `#f-${k}` })),
      )
    : [];
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm">
        <Link to="/admin">← Administration</Link>
      </p>
      <h1>Create vacancy</h1>
      {actionData && "formError" in actionData && actionData.formError && !summary.length && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <ErrorSummary messages={summary} />
      <Form method="post" className="card space-y-4">
        <CsrfInput />
        <TextInput
          label="Vacancy code"
          name="code"
          required
          hint="Public reference, e.g. 2026-CSE-AP"
          error={fe?.code?.[0]}
        />
        <TextInput label="Title" name="title" required error={fe?.title?.[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="f-position" className="block text-sm font-medium">
              Position
            </label>
            <select id="f-position" name="position" required className="field-input mt-1">
              {Object.entries(POSITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Professor and Associate Professor vacancies use the official “PROFESSOR / ASSOCIATE PROFESSOR”
              form.
            </p>
          </div>
          <div>
            <label htmlFor="f-cycleId" className="block text-sm font-medium">
              Recruitment cycle
            </label>
            <select id="f-cycleId" name="cycleId" required className="field-input mt-1">
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-departmentId" className="block text-sm font-medium">
              Department
            </label>
            <select id="f-departmentId" name="departmentId" required className="field-input mt-1">
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-disciplineId" className="block text-sm font-medium">
              Discipline (optional)
            </label>
            <select id="f-disciplineId" name="disciplineId" className="field-input mt-1">
              <option value="">—</option>
              {departments.map((d) => (
                <optgroup key={d.id} label={d.name}>
                  {d.disciplines.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <TextInput label="Opens" name="opensAt" type="datetime-local" required error={fe?.opensAt?.[0]} />
          <TextInput
            label="Closes"
            name="closesAt"
            type="datetime-local"
            required
            error={fe?.closesAt?.[0]}
          />
          <TextInput
            label="Number of posts"
            name="numberOfPosts"
            type="number"
            error={fe?.numberOfPosts?.[0]}
          />
        </div>
        <div>
          <label htmlFor="f-description" className="block text-sm font-medium">
            Description
          </label>
          <textarea id="f-description" name="description" rows={5} required className="field-input mt-1" />
        </div>
        <div>
          <label htmlFor="f-eligibility" className="block text-sm font-medium">
            Eligibility criteria (one per line)
          </label>
          <p className="text-xs text-muted">
            Enter only criteria approved by the college. Nothing is pre-filled.
          </p>
          <textarea id="f-eligibility" name="eligibility" rows={5} className="field-input mt-1" />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Required supporting documents</legend>
          <p className="text-xs text-muted">
            The passport photograph is always required (it is printed on the form).
          </p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {DOCUMENT_TYPES.filter((t) => t !== "PHOTOGRAPH").map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="requiredDocuments" value={t} className="h-4 w-4" />{" "}
                {DOCUMENT_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn-primary">
          Create vacancy (draft)
        </button>
      </Form>
    </div>
  );
}
