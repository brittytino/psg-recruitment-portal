import { Form } from "react-router";
import type { Route } from "./+types/settings";
import { Alert, CsrfInput } from "~/components/forms";
import { PageHeader } from "~/components/staff";
import { handleAction, readForm, requireStaff } from "~/lib/http.server";
import { SETTINGS, type SettingKey } from "~/modules/settings/definitions";
import { allSettings, saveSetting } from "~/modules/settings/service.server";

export const meta: Route.MetaFunction = () => [{ title: "Settings — PSG Tech Recruitment" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  requireStaff(context, request, "settings:manage");
  return { values: await allSettings() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireStaff(context, request, "settings:manage");
  const form = await readForm(request, context);
  return handleAction(async () => {
    for (const key of Object.keys(SETTINGS)) await saveSetting(user, key, form.get(key) === "on");
    return { message: "Settings saved." };
  });
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const keys = Object.keys(SETTINGS) as SettingKey[];
  return (
    <div className="page-stack max-w-3xl">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Rules that still need the college's final confirmation are switches here, so they can change without a software release."
      />
      {actionData && "message" in actionData && actionData.message && (
        <Alert tone="success">{actionData.message}</Alert>
      )}
      {actionData && "formError" in actionData && actionData.formError && (
        <Alert tone="danger">{actionData.formError}</Alert>
      )}
      <Form method="post" className="card space-y-4">
        <CsrfInput />
        {keys.map((k) => (
          <label key={k} className="flex items-start gap-3 rounded-2xl border border-line p-4">
            <input type="checkbox" name={k} defaultChecked={loaderData.values[k]} className="mt-1 h-5 w-5" />
            <span>
              <span className="block font-semibold">{SETTINGS[k].label}</span>
              <span className="text-sm text-muted">{SETTINGS[k].help}</span>
            </span>
          </label>
        ))}
        <button type="submit" className="btn-primary">
          Save settings
        </button>
      </Form>
    </div>
  );
}
