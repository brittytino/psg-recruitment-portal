import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft, FlaskConical, GraduationCap } from "lucide-react";
import type { Route } from "./+types/vacancy-new";
import { Alert, CsrfInput, ErrorSummary, TextInput } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { prisma } from "~/modules/core/db.server";
import { createResearchVacancy, createVacancy } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "New job opening — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  requireStaff(context, request, "recruitment:manage");
  const [departments, specialisations] = await Promise.all([
    prisma.department.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { disciplines: { where: { active: true }, orderBy: { name: "asc" } } },
    }),
    prisma.researchSpecialisation.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { departments, specialisations };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  const input = Object.fromEntries(form);
  return handleAction(async () => {
    if (input.recruitmentCategory === "RESEARCH") await createResearchVacancy(user, input);
    else await createVacancy(user, input);
    throw redirect("/admin?status=DRAFT");
  });
}

const FIELD_LABELS: Record<string, string> = {
  code: "Vacancy code",
  position: "Position",
  positionTitle: "Position title",
  departmentId: "Department",
  disciplineId: "Specialisation",
  researchSpecialisationId: "Research specialisation",
  opensAt: "Opens",
  closesAt: "Closes",
  numberOfPosts: "Number of posts",
  description: "Description",
  eligibility: "Eligibility",
};

const RESEARCH_TITLES = [
  "Research Assistant",
  "Research Associate",
  "Junior Research Fellow",
  "Senior Research Fellow",
];

export default function VacancyNew({ loaderData, actionData }: Route.ComponentProps) {
  const { departments, specialisations } = loaderData;
  const [category, setCategory] = useState<"FACULTY" | "RESEARCH">("FACULTY");
  const [departmentId, setDepartmentId] = useState("");
  const busy = useNavigation().state === "submitting";
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) =>
        (v ?? []).map((text) => ({ text: `${FIELD_LABELS[k] ?? k}: ${text}`, href: `#f-${k}` })),
      )
    : [];
  const disciplines = departments.find((d) => d.id === departmentId)?.disciplines ?? [];
  const noSetup = category === "FACULTY" ? departments.length === 0 : specialisations.length === 0;

  return (
    <div className="mx-auto max-w-4xl page-stack">
      <Link to="/admin" className="back-link">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Job profiles
      </Link>
      <PageHeader
        eyebrow="Recruitment set-up"
        title="New job opening"
        description="The opening is saved as a draft. Publish it from Job profiles when it should be visible to candidates."
      />
      {actionData && "formError" in actionData && actionData.formError && !summary.length && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <ErrorSummary messages={summary} />

      <Form method="post" className="card space-y-8">
        <CsrfInput />
        <input type="hidden" name="recruitmentCategory" value={category} />

        <fieldset>
          <legend className="text-sm font-semibold">Type of opening</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(
              [
                [
                  "FACULTY",
                  GraduationCap,
                  "Faculty",
                  "Assistant / Associate Professor, Professor — reviewed by the HOD",
                ],
                [
                  "RESEARCH",
                  FlaskConical,
                  "Research",
                  "Research Assistant / Associate / Fellow — screened by HR",
                ],
              ] as const
            ).map(([k, Icon, title, text]) => (
              <button
                key={k}
                type="button"
                aria-pressed={category === k}
                onClick={() => setCategory(k)}
                className="choice-card"
              >
                <Icon className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{text}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {noSetup && (
          <Alert tone="warning" title="Set-up needed">
            {category === "FACULTY"
              ? "No active departments yet."
              : "No active research specialisations yet."}{" "}
            HR – N4 Section adds them under <Link to="/admin/departments">Departments &amp; HODs</Link>.
          </Alert>
        )}

        <section className="form-section">
          <h2 className="form-section-title">Position</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {category === "FACULTY" ? (
              <>
                <SelectField label="Position" name="position" required error={fe?.position?.[0]}>
                  {(["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR", "PROFESSOR"] as const).map((k) => (
                    <option key={k} value={k}>
                      {POSITION_LABELS[k]}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Department"
                  name="departmentId"
                  required
                  value={departmentId}
                  onChange={setDepartmentId}
                  error={fe?.departmentId?.[0]}
                >
                  <option value="">Choose a department…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Specialisation"
                  name="disciplineId"
                  error={fe?.disciplineId?.[0]}
                  hint={
                    departmentId && !disciplines.length
                      ? "This department has no specialisations yet."
                      : undefined
                  }
                >
                  <option value="">Any / not specific</option>
                  {disciplines.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </SelectField>
              </>
            ) : (
              <>
                <SelectField
                  label="Position title"
                  name="positionTitle"
                  required
                  error={fe?.positionTitle?.[0]}
                >
                  {RESEARCH_TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Research specialisation"
                  name="researchSpecialisationId"
                  required
                  error={fe?.researchSpecialisationId?.[0]}
                >
                  <option value="">Choose a specialisation…</option>
                  {specialisations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Department" name="departmentId" error={fe?.departmentId?.[0]}>
                  <option value="">Not department specific</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </SelectField>
              </>
            )}
            <TextInput
              label="Number of posts"
              name="numberOfPosts"
              type="number"
              inputMode="numeric"
              error={fe?.numberOfPosts?.[0]}
            />
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Application window</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput label="Opens" name="opensAt" type="datetime-local" required error={fe?.opensAt?.[0]} />
            <TextInput
              label="Closes"
              name="closesAt"
              type="datetime-local"
              required
              error={fe?.closesAt?.[0]}
            />
          </div>
          <p className="text-xs text-muted">Times are Indian Standard Time (IST).</p>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Details for candidates</h2>
          <TextAreaField
            label="Description"
            name="description"
            required
            rows={6}
            error={fe?.description?.[0]}
            placeholder={
              category === "RESEARCH"
                ? "Project, responsibilities, fellowship amount and duration…"
                : "Responsibilities, teaching and research expectations…"
            }
          />
          <TextAreaField
            label="Eligibility criteria"
            name="eligibility"
            rows={5}
            hint="One criterion per line. Each line is shown as a checklist item."
            error={fe?.eligibility?.[0]}
            placeholder={
              category === "RESEARCH"
                ? "First class B.E. / B.Tech. or M.E. / M.Tech. in a relevant discipline\nValid GATE / NET score preferred"
                : "Ph.D. in the relevant discipline\nFirst class in UG and PG degrees"
            }
          />
          <TextInput
            label="Vacancy code"
            name="code"
            hint="Leave empty to generate one automatically (e.g. 2026-CSE-AP)."
            error={fe?.code?.[0]}
          />
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
          <Link to="/admin" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy || noSetup}>
            {busy ? "Saving…" : "Save as draft"}
          </button>
        </div>
      </Form>
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  error,
  hint,
  value,
  onChange,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        aria-invalid={!!error}
        className="field-input"
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : {})}
      >
        {children}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function TextAreaField({
  label,
  name,
  required,
  error,
  hint,
  rows,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  hint?: string;
  rows: number;
  placeholder?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        placeholder={placeholder}
        className="field-input"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
