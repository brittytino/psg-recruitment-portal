import type { Route } from "./+types/notifications";
import { readForm, requireUser } from "~/lib/http.server";
import { isStaff } from "~/modules/auth/permissions";
import { inbox, markRead, unreadCount } from "~/modules/notifications/inbox.server";

/** The signed-in person's notifications (bell icon): GET lists, POST marks as read. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const [items, unread] = await Promise.all([inbox(user, isStaff(user.grants)), unreadCount(user)]);
  return Response.json({ items, unread }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request);
  const form = await readForm(request, context);
  const id = String(form.get("id") ?? "");
  await markRead(user, /^[0-9a-f-]{36}$/.test(id) ? id : null);
  return Response.json({ ok: true });
}
