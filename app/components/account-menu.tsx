import { ArrowLeftRight, ExternalLink, FileText, LayoutDashboard, LogOut } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CsrfInput } from "~/components/forms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
} from "~/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

export interface MenuUser {
  name: string;
  initials: string;
  roleLabel: string;
  email: string;
  staff: boolean;
}

type Intent = "signout" | "switch" | null;

/**
 * Confirmation before signing out (or switching to another account). Nothing happens until the
 * person confirms; the form then posts to /logout.
 */
export function SignOutDialog({ intent, onClose }: { intent: Intent; onClose: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const sw = intent === "switch";
  return (
    <AlertDialog open={!!intent} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader
          icon={
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-700">
              {sw ? <ArrowLeftRight className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
            </span>
          }
          title={sw ? "Switch to another account?" : "Sign out?"}
        >
          {sw
            ? "You will be signed out of this account and taken to the sign-in page to use a different e-mail address."
            : "You will need a new e-mail code to sign in again. Any changes you have not saved on this page will be lost."}
        </AlertDialogHeader>
        <form ref={form} method="post" action="/logout">
          <CsrfInput />
          {sw && <input type="hidden" name="next" value="/login" />}
          <AlertDialogFooter>
            <AlertDialogCancel className="btn-secondary">Stay signed in</AlertDialogCancel>
            <AlertDialogAction className="btn-primary" onClick={() => form.current?.requestSubmit()}>
              {sw ? "Sign out and switch" : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Round avatar in the top-right corner: who is signed in, switch account, sign out. */
export function AccountMenu({ user, tone = "light" }: { user: MenuUser; tone?: "light" | "dark" }) {
  const [intent, setIntent] = useState<Intent>(null);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${user.name}`}
          className={cn(
            "group grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold ring-2 ring-offset-2 transition focus-visible:outline-none",
            tone === "dark"
              ? "bg-gold-400 text-navy-900 ring-white/20 ring-offset-navy-800 hover:ring-white/40"
              : "bg-navy-800 text-white ring-transparent ring-offset-paper hover:ring-brand-200 data-[state=open]:ring-brand-600",
          )}
        >
          {user.initials || "U"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-800 text-[13px] font-bold text-white">
              {user.initials || "U"}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
              <span className="block truncate text-xs font-medium text-brand-700">{user.roleLabel}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{user.email}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.staff ? (
            <>
              <MenuLink to="/staff" icon={<LayoutDashboard />}>
                Staff workspace
              </MenuLink>
              <DropdownMenuItem asChild>
                <a href="/" target="_blank" rel="noreferrer" className="no-underline">
                  <ExternalLink /> Public website
                </a>
              </DropdownMenuItem>
            </>
          ) : (
            <MenuLink to="/account" icon={<FileText />}>
              My applications
            </MenuLink>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIntent("switch")}>
            <ArrowLeftRight /> Switch account
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setIntent("signout")}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog intent={intent} onClose={() => setIntent(null)} />
    </>
  );
}

function MenuLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenuItem asChild>
      <Link to={to} className="text-ink no-underline">
        {icon} {children}
      </Link>
    </DropdownMenuItem>
  );
}
