import { Popover } from "radix-ui";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { cn } from "~/lib/utils";

interface Item {
  id: string;
  subject: string;
  preview: string;
  createdAt: string;
  unread: boolean;
  href: string | null;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
};

/** Bell icon: the signed-in person's notifications, including updates that were not e-mailed. */
export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const root = useRouteLoaderData("root") as { unread?: number; csrf?: string } | undefined;
  const [unread, setUnread] = useState(root?.unread ?? 0);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setUnread(root?.unread ?? 0), [root?.unread]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/notifications", { credentials: "same-origin" })
      .then((r) => r.json() as Promise<{ items: Item[]; unread: number }>)
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const mark = async (id?: string) => {
    const fd = new FormData();
    fd.append("_csrf", root?.csrf ?? "");
    if (id) fd.append("id", id);
    await fetch("/notifications", { method: "POST", body: fd, credentials: "same-origin" }).catch(
      () => undefined,
    );
    setItems((xs) => xs?.map((x) => (!id || x.id === id ? { ...x, unread: false } : x)) ?? xs);
    setUnread((n) => (id ? Math.max(0, n - 1) : 0));
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none",
          tone === "dark"
            ? "border-white/15 text-white hover:bg-white/10"
            : "border-line bg-paper text-ink hover:border-line-strong hover:bg-soft",
        )}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-paper">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="ui-pop z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-paper text-ink shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void mark()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all as read
              </button>
            )}
          </div>
          {items === null ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          n.unread ? "bg-brand-600" : "bg-transparent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn("block text-sm", n.unread ? "font-semibold text-ink" : "text-ink")}
                        >
                          {n.subject}
                        </span>
                        {n.preview && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.preview}</span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted">{ago(n.createdAt)}</span>
                      </span>
                    </span>
                    {n.unread && <span className="sr-only">(unread)</span>}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        to={n.href}
                        onClick={() => {
                          if (n.unread) void mark(n.id);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 no-underline hover:bg-soft"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => n.unread && void mark(n.id)}
                        className="block w-full px-4 py-3 text-left hover:bg-soft"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
