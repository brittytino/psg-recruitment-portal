import { RichTextEditor } from "~/components/rich-text-editor";
import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { Route } from "./+types/vacancy-edit";
import { Alert, CsrfInput, ErrorSummary, TextInput } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { getVacancyForEdit, updateVacancy } from "~/modules/recruitment/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Edit job opening — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

/** datetime-local value in IST. */
const local = (d: Date | string) =>
  new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const v = await getVacancyForEdit(user, params.id);
  return {
    v: {
      id: v.id,
      code: v.code,
      status: v.status,
      category: v.recruitmentCategory,
      position: v.position,
      positionTitle: v.researchPositionTitle,
      department: v.department?.name ?? null,
      specialisation: v.researchSpecialisation?.name ?? null,
      disciplineId: v.disciplineId,
      disciplines: v.department?.disciplines.map((d) => ({ id: d.id, name: d.name })) ?? [],
      description: v.description,
      numberOfPosts: v.numberOfPosts,
      opensAt: local(v.opensAt),
      closesAt: local(v.closesAt),
      eligibility: v.eligibility.map((e) => e.description).join("\n"),
      applications: v._count.applications,
    },
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = requireStaff(context, request, "recruitment:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    await updateVacancy(user, params.id, Object.fromEntries(form));
    throw redirect("/admin?updated=1");
  });
}

const LABELS: Record<string, string> = {
  description: "Description",
  numberOfPosts: "Number of posts",
  opensAt: "Opens",
  closesAt: "Closes",
  eligibility: "Eligibility",
  disciplineId: "Specialisation",
  positionTitle: "Position title",
};

export default function VacancyEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { v } = loaderData;
  const busy = useNavigation().state === "submitting";
  const fe = actionData && "fieldErrors" in actionData ? actionData.fieldErrors : undefined;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, m]) =>
        (m ?? []).map((text) => ({ text: `${LABELS[k] ?? k}: ${text}`, href: `#f-${k}` })),
      )
    : [];
  const position = v.positionTitle ?? (v.position ? POSITION_LABELS[v.position] : "");

  return (
    <div className="page-stack mx-auto max-w-4xl">
      <Link to="/admin" className="back-link">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Job profiles
      </Link>
      <PageHeader
        crumbs={[["Job profiles", "/admin"], [v.code]]}
        title="Edit job opening"
        description={`${position} · ${v.department ?? v.specialisation ?? ""}`}
      />
      {actionData && "formError" in actionData && actionData.formError && !summary.length && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <ErrorSummary messages={summary} />
      {v.applications > 0 && (
        <Alert tone="info" title={`${v.applications} application${v.applications === 1 ? "" : "s"} received`}>
          Changes apply to the public vacancy page straight away. Position and department cannot be changed;
          create a new opening for a different post.
        </Alert>
      )}

      <Form method="post" className="card space-y-8">
        <CsrfInput />
        <section className="form-section">
          <h2 className="form-section-title">Position</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {v.category === "RESEARCH" ? (
              <div className="space-y-1">
                <label htmlFor="f-positionTitle" className="block text-sm font-medium">
                  Position title
                </label>
                <select
                  id="f-positionTitle"
                  name="positionTitle"
                  defaultValue={v.positionTitle ?? ""}
                  className="field-input"
                >
                  {[
                    "Research Assistant",
                    "Research Associate",
                    "Junior Research Fellow",
                    "Senior Research Fellow",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label htmlFor="f-disciplineId" className="block text-sm font-medium">
                  Specialisation <span className="font-normal text-muted">(optional)</span>
                </label>
                <select
                  id="f-disciplineId"
                  name="disciplineId"
                  defaultValue={v.disciplineId ?? ""}
                  className="field-input"
                >
                  <option value="">Any / not specific</option>
                  {v.disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <TextInput
              label="Number of posts"
              name="numberOfPosts"
              type="number"
              defaultValue={v.numberOfPosts ?? ""}
              error={fe?.numberOfPosts?.[0]}
            />
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Application window (IST)</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              label="Opens"
              name="opensAt"
              type="datetime-local"
              required
              defaultValue={v.opensAt}
              error={fe?.opensAt?.[0]}
            />
            <TextInput
              label="Closes"
              name="closesAt"
              type="datetime-local"
              required
              defaultValue={v.closesAt}
              error={fe?.closesAt?.[0]}
            />
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Details for candidates</h2>
          <div className="space-y-1">
            <label htmlFor="f-description" className="block text-sm font-medium">
              Description <span className="text-danger">*</span>
            </label>
            <RichTextEditor
              id="f-description"
              name="description"
              rows={6}
              required
              defaultValue={v.description ?? ""}
              invalid={!!fe?.description}
            />
            {fe?.description?.[0] && <p className="text-sm text-danger">{fe.description[0]}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="f-eligibility" className="block text-sm font-medium">
              Eligibility criteria <span className="font-normal text-muted">(one per line)</span>
            </label>
            <textarea
              id="f-eligibility"
              name="eligibility"
              rows={5}
              defaultValue={v.eligibility}
              className="field-input"
            />
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
          <Link to="/admin" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Form>
    </div>
  );
}
