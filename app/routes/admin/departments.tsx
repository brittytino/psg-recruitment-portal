import { Form, useNavigation, useSearchParams } from "react-router";
import { Building2, FlaskConical, Mail, Plus, Send, UserMinus, UserPlus } from "lucide-react";
import { Modal, ModalActions, ModalClose } from "~/components/modal";
import type { Route } from "./+types/departments";
import {
  Alert,
  Badge,
  ConfirmDialog,
  CsrfInput,
  ErrorSummary,
  formatDate,
  TextInput,
} from "~/components/forms";
import { EmptyState, PageHeader, Tabs } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { ValidationError } from "~/modules/core/errors";
import {
  addDiscipline,
  adminOverview,
  createDepartment,
  createResearchSpecialisation,
  updateResearchSpecialisation,
} from "~/modules/recruitment/service.server";
import { inviteHod, removeHod, resendHodInvite } from "~/modules/users/service.server";

export const meta: Route.MetaFunction = () => [
  { title: "Departments & HODs — PSG Tech Recruitment" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireStaff(context, request, "department:manage");
  const { departments, researchSpecialisations } = await adminOverview(user);
  return { departments, researchSpecialisations };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "department:manage");
  const form = await readForm(request, context);
  const f = Object.fromEntries(form);
  return handleAction(async () => {
    switch (f.intent) {
      case "department":
        await createDepartment(user, f);
        return {
          message: "Department created and the invitation has been e-mailed to the HOD.",
        };
      case "hod":
        await inviteHod(user, f);
        return { message: "HOD added and the invitation has been e-mailed." };
      case "hod-resend":
        await resendHodInvite(user, String(f.roleId));
        return { message: "Invitation e-mailed again." };
      case "hod-remove":
        await removeHod(user, String(f.roleId));
        return { message: "HOD removed from the department." };
      case "discipline":
        await addDiscipline(user, String(f.departmentId), f.name);
        return { message: "Specialisation added to the department." };
      case "specialisation":
        await createResearchSpecialisation(user, f);
        return { message: "Research specialisation added." };
      case "specialisation-toggle":
        await updateResearchSpecialisation(user, String(f.id), { active: f.active === "true" });
        return { message: `Research specialisation ${f.active === "true" ? "activated" : "deactivated"}.` };
      default:
        throw new ValidationError("Unknown action");
    }
  });
}

const TABS = [
  ["departments", "Departments & HODs"],
  ["specialisations", "Research specialisations"],
] as const;

export default function Departments({ loaderData, actionData }: Route.ComponentProps) {
  const { departments, researchSpecialisations } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const tab = TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "departments";
  const a = actionData as
    { message?: string; formError?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const fe = a?.fieldErrors;
  const summary = fe
    ? Object.entries(fe).flatMap(([k, v]) => (v ?? []).map((text) => ({ text, href: `#f-${k}` })))
    : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="HR – N4 Section"
        title="Departments & HODs"
        description="Add departments with their Head of Department. The HOD receives an e-mail invitation and signs in with a one-time code."
        actions={
          tab === "departments" ? (
            <Modal
              size="lg"
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New department
                </>
              }
              icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
              title="New department"
              description="The HOD named here is invited by e-mail straight away."
            >
              <Form method="post" className="space-y-4">
                <CsrfInput />
                <input type="hidden" name="intent" value="department" />
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <TextInput label="Short code" name="code" required hint="e.g. CSE" error={fe?.code?.[0]} />
                  <TextInput
                    label="Department name"
                    name="name"
                    required
                    placeholder="Computer Science and Engineering"
                    error={fe?.name?.[0]}
                  />
                </div>
                <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                  <legend className="px-1 text-sm font-semibold">Head of Department</legend>
                  <TextInput
                    label="HOD name"
                    name="hodName"
                    required
                    placeholder="Dr. R. Kumar"
                    error={fe?.hodName?.[0]}
                  />
                  <TextInput
                    label="HOD e-mail"
                    name="hodEmail"
                    type="email"
                    required
                    placeholder="hod.department@your-college.edu"
                    error={fe?.hodEmail?.[0]}
                  />
                </fieldset>
                <ModalActions>
                  <ModalClose className="btn-secondary">Cancel</ModalClose>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    Create department
                  </button>
                </ModalActions>
              </Form>
            </Modal>
          ) : (
            <Modal
              size="md"
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New specialisation
                </>
              }
              icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
              title="New research specialisation"
            >
              <Form method="post" className="space-y-4">
                <CsrfInput />
                <input type="hidden" name="intent" value="specialisation" />
                <TextInput
                  label="Name"
                  name="name"
                  required
                  placeholder="Artificial Intelligence & Machine Learning"
                  error={fe?.name?.[0]}
                />
                <TextInput
                  label="Description"
                  name="description"
                  placeholder="Deep learning, computer vision, NLP"
                  error={fe?.description?.[0]}
                />
                <TextInput
                  label="Display order"
                  name="sortOrder"
                  type="number"
                  defaultValue="0"
                  hint="Lower numbers appear first."
                  error={fe?.sortOrder?.[0]}
                />
                <ModalActions>
                  <ModalClose className="btn-secondary">Cancel</ModalClose>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    Add specialisation
                  </button>
                </ModalActions>
              </Form>
            </Modal>
          )
        }
      />
      {a?.message && <Alert tone="success">{a.message}</Alert>}
      {a?.formError && !summary.length && <Alert tone="danger">{a.formError}</Alert>}
      <ErrorSummary messages={summary} />

      <Tabs
        items={TABS.map(([k, l]) => ({
          to: `?tab=${k}`,
          label: l,
          active: k === tab,
          count: k === "departments" ? departments.length : researchSpecialisations.length,
        }))}
      />

      {tab === "departments" && (
        <div>
          <section aria-label="Departments" className="space-y-4">
            {departments.length === 0 ? (
              <EmptyState title="No departments yet">Use “New department” to add the first one.</EmptyState>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {departments.map((d) => (
                  <li key={d.id} className="card flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg leading-snug text-ink">{d.name}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          <span className="code-chip">{d.code}</span> · {d._count.vacancies} job profile
                          {d._count.vacancies === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge tone={d.active ? "success" : "neutral"}>
                        {d.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="label-caps">Head of Department</p>
                        <Modal
                          size="md"
                          triggerClassName="btn-ghost btn-sm"
                          trigger={
                            <>
                              <Plus className="h-4 w-4" aria-hidden="true" /> Add HOD
                            </>
                          }
                          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
                          title={`Add a HOD — ${d.code}`}
                          description={`${d.name}. They receive an e-mail invitation and sign in with a one-time code.`}
                        >
                          <Form method="post" className="space-y-4">
                            <CsrfInput />
                            <input type="hidden" name="intent" value="hod" />
                            <input type="hidden" name="departmentId" value={d.id} />
                            <TextInput
                              label="Full name"
                              name="fullName"
                              required
                              placeholder="Dr. R. Kumar"
                              error={fe?.fullName?.[0]}
                            />
                            <TextInput
                              label="Official e-mail"
                              name="email"
                              type="email"
                              required
                              placeholder={`hod.${d.code.toLowerCase()}@your-college.edu`}
                              error={fe?.email?.[0]}
                            />
                            <ModalActions>
                              <ModalClose className="btn-secondary">Cancel</ModalClose>
                              <button type="submit" className="btn-primary" disabled={busy}>
                                <Mail className="h-4 w-4" aria-hidden="true" /> Add & send invitation
                              </button>
                            </ModalActions>
                          </Form>
                        </Modal>
                      </div>
                      {d.roles.length === 0 ? (
                        <p className="mt-1 text-sm text-muted">Not added yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {d.roles.map((r) => (
                            <li
                              key={r.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-soft px-3 py-2"
                            >
                              <span className="min-w-0 text-sm">
                                <span className="block font-semibold text-ink">
                                  {r.user.profile?.fullName ?? r.user.email}
                                </span>
                                <span className="block truncate text-muted">{r.user.email}</span>
                                <span className="block text-xs text-muted">
                                  {r.user.status === "DISABLED"
                                    ? "Account disabled"
                                    : r.user.lastLoginAt
                                      ? `Last signed in ${formatDate(r.user.lastLoginAt)}`
                                      : "Invitation sent — not signed in yet"}
                                </span>
                              </span>
                              <span className="flex gap-1">
                                <Form method="post">
                                  <CsrfInput />
                                  <input type="hidden" name="intent" value="hod-resend" />
                                  <input type="hidden" name="roleId" value={r.id} />
                                  <button
                                    type="submit"
                                    className="btn-ghost btn-sm"
                                    title="Resend invitation"
                                    disabled={busy}
                                  >
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only sm:not-sr-only">Resend</span>
                                  </button>
                                </Form>
                                <Form method="post">
                                  <CsrfInput />
                                  <input type="hidden" name="intent" value="hod-remove" />
                                  <input type="hidden" name="roleId" value={r.id} />
                                  <ConfirmDialog
                                    trigger={
                                      <>
                                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                                        <span className="sr-only sm:not-sr-only">Remove</span>
                                      </>
                                    }
                                    triggerClassName="btn-ghost btn-sm text-danger"
                                    title={`Remove ${r.user.profile?.fullName ?? r.user.email} as HOD?`}
                                    confirmLabel="Remove HOD"
                                    tone="danger"
                                  >
                                    <p>They will no longer see this department's applications.</p>
                                  </ConfirmDialog>
                                </Form>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-auto border-t border-line pt-4">
                      <p className="label-caps">Specialisations / disciplines</p>
                      <p className="mt-1 text-sm text-ink">
                        {d.disciplines.length ? d.disciplines.map((x) => x.name).join(" · ") : "None yet."}
                      </p>
                      <Form method="post" className="mt-2 flex gap-2">
                        <CsrfInput />
                        <input type="hidden" name="intent" value="discipline" />
                        <input type="hidden" name="departmentId" value={d.id} />
                        <label htmlFor={`disc-${d.id}`} className="sr-only">
                          New specialisation for {d.name}
                        </label>
                        <input
                          id={`disc-${d.id}`}
                          name="name"
                          placeholder="e.g. Data Science"
                          className="field-input min-w-0 flex-1 py-2"
                          required
                        />
                        <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={busy}>
                          Add
                        </button>
                      </Form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "specialisations" && (
        <div>
          <section className="card p-0" aria-label="Research specialisations">
            {researchSpecialisations.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No research specialisations yet">
                  Use “New specialisation” to start posting research positions.
                </EmptyState>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Research specialisations</caption>
                  <thead>
                    <tr>
                      <th scope="col">Specialisation</th>
                      <th scope="col" className="text-right">
                        Job profiles
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {researchSpecialisations.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="font-semibold text-ink">{s.name}</span>
                          {s.description && <span className="block text-sm text-muted">{s.description}</span>}
                        </td>
                        <td className="text-right tabular-nums">{s._count.vacancies}</td>
                        <td>
                          <Badge tone={s.active ? "success" : "neutral"}>
                            {s.active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="text-right">
                          <Form method="post">
                            <CsrfInput />
                            <input type="hidden" name="intent" value="specialisation-toggle" />
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                            <ConfirmDialog
                              trigger={s.active ? "Deactivate" : "Activate"}
                              triggerClassName="btn-secondary btn-sm"
                              tone={s.active ? "danger" : "primary"}
                              title={s.active ? `Deactivate ${s.name}?` : `Activate ${s.name}?`}
                              confirmLabel={s.active ? "Deactivate" : "Activate"}
                              disabled={busy}
                            >
                              <p>
                                {s.active
                                  ? "It can no longer be chosen for new research job profiles. Existing applications are not affected."
                                  : "It can be chosen again for new research job profiles."}
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
        </div>
      )}
    </div>
  );
}
