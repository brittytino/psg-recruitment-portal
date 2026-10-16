import { redirect } from "react-router";
import type { Route } from "./+types/apply";
import { readForm, requireUser } from "~/lib/http.server";
import { createDraft } from "~/modules/applications/service.server";
import { isDomainError } from "~/modules/core/errors";
import { getPublishedVacancy } from "~/modules/recruitment/service.server";

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/vacancies/${encodeURIComponent(params.code)}`);
}

/** Creates (or resumes) the candidate's draft for a vacancy, then opens the editor. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  await readForm(request, context);
  const vacancy = await getPublishedVacancy(params.code);
  try {
    const app = await createDraft(user, vacancy.id);
    throw redirect(`/applications/${app.id}`);
  } catch (e) {
    if (isDomainError(e)) throw new Response(e.message, { status: e.status });
    throw e;
  }
}
