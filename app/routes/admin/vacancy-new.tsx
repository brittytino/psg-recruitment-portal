import { useState } from "react";
import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/vacancy-new";
import { Alert, CsrfInput, ErrorSummary, TextInput } from "~/components/forms";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { prisma } from "~/modules/core/db.server";
import { DOCUMENT_TYPE_LABELS, STANDALONE_DOCUMENT_TYPES } from "~/modules/documents/policy";
import { createResearchVacancy, createVacancy } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Create vacancy — Administration" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  requireStaff(context, request, "recruitment:manage");
  const [cycles, departments, specialisations] = await Promise.all([
    prisma.recruitmentCycle.findMany({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { opensAt: "desc" },
    }),
    prisma.department.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { disciplines: { orderBy: { name: "asc" } } },
    }),
    prisma.researchSpecialisation.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { cycles, departments, specialisations };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const category = form.get("recruitmentCategory");
  return handleAction(async () => {
    if (category === "RESEARCH") {
      await createResearchVacancy(user, {
        ...Object.fromEntries(form),
        requiredDocuments: form.getAll("requiredDocuments"),
      });
    } else {
      await createVacancy(user, {
        ...Object.fromEntries(form),
        requiredDocuments: form.getAll("requiredDocuments"),
      });
    }
    throw redirect("/admin");
  });
}

export default function VacancyNew({ loaderData, actionData }: Route.ComponentProps) {
  const { cycles, departments, specialisations } = loaderData;
  const [category, setCategory] = useState<"FACULTY" | "RESEARCH">("FACULTY");
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
      <Form method="post" className="card space-y-5">
        <CsrfInput />

        {/* Recruitment Category Selector */}
        <div>
          <label className="block text-sm font-semibold mb-2">Recruitment Category</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCategory("FACULTY")}
              className={`p-3 rounded-2xl border text-left transition-all ${
                category === "FACULTY"
                  ? "border-brand-600 bg-brand-50/70 text-ink ring-2 ring-brand-600/30 font-semibold"
                  : "border-line bg-soft text-muted hover:text-ink"
              }`}
            >
              <span className="text-xl block mb-1">🎓</span>
              <span className="block text-sm">Faculty Recruitment</span>
              <span className="block text-xs font-normal text-muted mt-0.5">Professor cadre with HOD review</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory("RESEARCH")}
              className={`p-3 rounded-2xl border text-left transition-all ${
                category === "RESEARCH"
                  ? "border-emerald-600 bg-emerald-50/70 text-ink ring-2 ring-emerald-600/30 font-semibold"
                  : "border-line bg-soft text-muted hover:text-ink"
              }`}
            >
              <span className="text-xl block mb-1">🔬</span>
              <span className="block text-sm">Research Appointment</span>
              <span className="block text-xs font-normal text-muted mt-0.5">Research Assistant / Associate (HR review)</span>
            </button>
          </div>
          <input type="hidden" name="recruitmentCategory" value={category} />
        </div>

        <TextInput
          label="Vacancy code"
          name="code"
          required
          hint={category === "FACULTY" ? "Public reference, e.g. 2026-CSE-AP" : "Public reference, e.g. 2026-RA-AIML"}
          error={fe?.code?.[0]}
        />
        <TextInput label="Title" name="title" required error={fe?.title?.[0]} />

        <div className="grid gap-4 sm:grid-cols-2">
          {category === "FACULTY" ? (
            <div>
              <label htmlFor="f-position" className="block text-sm font-medium">
                Position
              </label>
              <select id="f-position" name="position" required className="field-input mt-1">
                {Object.entries(POSITION_LABELS)
                  .filter(([k]) => ["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"].includes(k))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Professor and Associate Professor vacancies use the official “PROFESSOR / ASSOCIATE PROFESSOR” form.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="f-positionTitle" className="block text-sm font-medium">
                  Position Title
                </label>
                <select id="f-positionTitle" name="positionTitle" required className="field-input mt-1">
                  <option value="Research Assistant">Research Assistant</option>
                  <option value="Research Associate">Research Associate</option>
                  <option value="Senior Research Fellow">Senior Research Fellow</option>
                  <option value="Junior Research Fellow">Junior Research Fellow</option>
                </select>
              </div>
              <div>
                <label htmlFor="f-researchSpecialisationId" className="block text-sm font-medium">
                  Research Specialisation / Area
                </label>
                <select
                  id="f-researchSpecialisationId"
                  name="researchSpecialisationId"
                  required
                  className="field-input mt-1"
                >
                  <option value="">Choose specialisation…</option>
                  {specialisations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

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
              Department {category === "RESEARCH" ? "(optional)" : ""}
            </label>
            <select
              id="f-departmentId"
              name="departmentId"
              required={category === "FACULTY"}
              className="field-input mt-1"
            >
              {category === "RESEARCH" && <option value="">— Not department specific —</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {category === "FACULTY" && (
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
          )}

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
          <textarea
            id="f-description"
            name="description"
            rows={5}
            required
            placeholder={
              category === "RESEARCH"
                ? "Describe the research project, required technical skillset, fellowship emoluments, and duration..."
                : "Enter department position details and responsibilities..."
            }
            className="field-input mt-1"
          />
        </div>

        <div>
          <label htmlFor="f-eligibility" className="block text-sm font-medium">
            Eligibility criteria (one per line)
          </label>
          <p className="text-xs text-muted">
            Enter criteria approved by the college/project sponsor. Each line becomes a checklist item.
          </p>
          <textarea
            id="f-eligibility"
            name="eligibility"
            rows={5}
            placeholder={
              category === "RESEARCH"
                ? "First Class B.E. / B.Tech. or M.E. / M.Tech. in relevant discipline\nValid GATE / NET score preferred\nHands-on experience with Python / PyTorch / MATLAB"
                : "Ph.D. in appropriate discipline\nFirst class in UG and PG degrees"
            }
            className="field-input mt-1"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Required supporting documents</legend>
          <p className="text-xs text-muted">
            The passport photograph, signature, and resume/CV are always required.
          </p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {STANDALONE_DOCUMENT_TYPES.filter((t) => t !== "PHOTOGRAPH").map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="requiredDocuments" value={t} className="h-4 w-4" />{" "}
                {DOCUMENT_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn-primary">
          Create {category === "RESEARCH" ? "research vacancy" : "vacancy"} (draft)
        </button>
      </Form>
    </div>
  );
}
