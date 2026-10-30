import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { readForm } from "~/lib/http.server";
import { audit } from "~/modules/audit/audit.server";
import { destroySession } from "~/modules/auth/session.server";
import { userContext } from "~/context";

export async function action({ request, context }: Route.ActionArgs) {
  const form = await readForm(request, context);
  const user = context.get(userContext);
  const cookie = await destroySession(request);
  if (user) await audit({ actorId: user.id, action: "auth.logout", entityType: "user", entityId: user.id });
  // "Switch account" goes straight to the sign-in page; otherwise back to the home page.
  throw redirect(form.get("next") === "/login" ? "/login" : "/", { headers: { "Set-Cookie": cookie } });
}

export function loader() {
  throw redirect("/");
}
