import { useEffect, useState } from "react";
import { newNonce } from "./lib/nonce.server";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
  useRouteLoaderData,
} from "react-router";
import {
  Briefcase,
  Building2,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  UserRound,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "./+types/root";
import "./app.css";
import { nonceContext, userContext } from "./context";
import {
  hasPermission,
  isAdmin,
  isHodReviewer,
  isHrOfficer,
  isStaff,
  primaryRoleLabel,
  type RoleGrant,
} from "./modules/auth/permissions";
import { csrfToken, getSessionUser } from "./modules/auth/session.server";
import { isOriginAllowed } from "./lib/origin.server";
import { CsrfInput } from "./components/forms";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** Staff navigation, by role. Every page re-checks permissions on the server. */
function staffNav(grants: RoleGrant[]): { title: string; items: NavItem[] }[] {
  const office = isAdmin(grants) || isHrOfficer(grants);
  const work: NavItem[] = [];
  if (office) work.push({ to: "/staff", label: "Applications", icon: LayoutDashboard, end: true });
  if (isHodReviewer(grants)) work.push({ to: "/staff/review", label: "My reviews", icon: ClipboardCheck });
  work.push({
    to: "/staff/summary",
    label: office ? "Summary & export" : "Summary sheet",
    icon: FileSpreadsheet,
  });

  const setup: NavItem[] = [];
  if (hasPermission(grants, "recruitment:manage"))
    setup.push({ to: "/admin", label: "Job profiles", icon: Briefcase, end: true });
  if (hasPermission(grants, "department:manage"))
    setup.push({ to: "/admin/departments", label: "Departments & HODs", icon: Building2 });
  if (hasPermission(grants, "notice:manage"))
    setup.push({ to: "/admin/notices", label: "Open positions PDFs", icon: FileText });

  const system: NavItem[] = [];
  if (hasPermission(grants, "user:manage"))
    system.push({ to: "/admin/users", label: "Users & roles", icon: Users });
  if (hasPermission(grants, "settings:manage"))
    system.push({ to: "/admin/settings", label: "Settings", icon: Settings });
  if (hasPermission(grants, "audit:read"))
    system.push({ to: "/staff/audit", label: "Audit log", icon: ShieldCheck });

  return [
    { title: "Recruitment", items: work },
    { title: "Set-up", items: setup },
    { title: "System", items: system },
  ].filter((g) => g.items.length);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Root middleware: per-request CSP nonce, Origin verification for every mutation (CSRF defence in
 * depth together with SameSite cookies and the synchroniser token), and session resolution.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    context.set(nonceContext, newNonce());
    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const origin = request.headers.get("origin");
      if (!isOriginAllowed(origin, request)) {
        throw new Response("Cross-origin request blocked", { status: 403 });
      }
    }
    context.set(userContext, await getSessionUser(request));
    return next();
  },
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    nonce: context.get(nonceContext),
    csrf: csrfToken(user?.sessionId ?? null),
    user: user
      ? {
          displayName: user.displayName,
          email: user.email,
          emailVerified: user.emailVerified,
          grants: user.grants,
        }
      : null,
  };
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/images/psg_logo.png", type: "image/png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#10223b" />
        <meta name="robots" content="noindex" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh">
        {children}
        <ScrollRestoration nonce={root?.nonce} />
        <Scripts nonce={root?.nonce} />
      </body>
    </html>
  );
}

function useUser() {
  const root = useRouteLoaderData<typeof loader>("root");
  const user = root?.user ?? null;
  const grants = user?.grants ?? [];
  const name = (user?.displayName ?? "").replace(/\s*\([^)]*\)\s*/g, " ").trim() || user?.email || "";
  const initials = name
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return { user, grants, staff: isStaff(grants), name, initials, roleLabel: primaryRoleLabel(grants) };
}

function Brand({ to, subtitle, inverted }: { to: string; subtitle: string; inverted?: boolean }) {
  return (
    <Link
      to={to}
      className="flex min-w-0 items-center gap-3 no-underline"
      aria-label="PSG College of Technology — home"
    >
      <img src="/images/psg_logo.png" alt="" className="h-9 w-auto shrink-0 sm:h-10" />
      <span className="min-w-0 leading-tight">
        <span
          className={`block truncate font-display text-[15px] font-semibold sm:text-base ${inverted ? "text-white" : "text-ink"}`}
        >
          PSG College of Technology
        </span>
        <span className={`block truncate text-xs ${inverted ? "text-white/60" : "text-muted"}`}>
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/** Thin progress bar while a navigation or form submission is in flight. */
function RouteProgress() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-brand-100">
      <div className="route-progress h-full w-1/3 bg-brand-600" />
    </div>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form method="post" action="/logout">
      <CsrfInput />
      <button type="submit" className={className}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
      </button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------
// Public layout
// ------------------------------------------------------------------------------------------------
function PublicHeader() {
  const { user, staff } = useUser();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const links: [string, string][] = [
    ["/vacancies", "Vacancies"],
    ["/help", "How to apply"],
  ];
  if (user && !staff) links.push(["/account", "My applications"]);
  if (staff) links.push(["/staff", "Staff workspace"]);
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `relative px-3 py-2 text-[15px] no-underline transition-colors after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full ${
      isActive
        ? "font-semibold text-ink after:bg-brand-600"
        : "text-muted hover:text-ink after:bg-transparent"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="page-container flex h-16 items-center justify-between gap-4">
        <Brand to="/" subtitle="Recruitment Portal" />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={linkCls}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <SignOut className="btn-secondary btn-sm" />
          ) : (
            <>
              <Link to="/register" className="btn-ghost btn-sm text-muted">
                Create account
              </Link>
              <Link
                to="/login"
                className="btn border border-brand-600 px-5 text-brand-700 hover:bg-brand-50 hover:text-brand-800"
              >
                <UserRound className="h-4 w-4" aria-hidden="true" /> Sign in
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-ghost -mr-2 px-2 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-t border-line bg-paper md:hidden">
          <nav aria-label="Main" className="page-container flex flex-col gap-1 py-3">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} className={linkCls}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="page-container grid grid-cols-2 gap-2 border-t border-line py-3">
            {user ? (
              <div className="col-span-2">
                <SignOut className="btn-secondary w-full" />
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-paper">
      <div className="page-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-4">
          <Brand to="/" subtitle="Recruitment Portal" />
          <p className="max-w-md text-sm text-muted">
            Avinashi Road, Peelamedu, Coimbatore – 641 004, Tamil Nadu. An autonomous institution affiliated
            to Anna University.
          </p>
          <div className="flex items-center gap-3 opacity-80">
            <img src="/images/75yearsLogo.png" alt="75 years of PSG Tech" className="h-8 w-auto" />
            <img src="/images/100yearsLogo.png" alt="100 years of PSG" className="h-8 w-auto" />
          </div>
        </div>
        <div>
          <h2 className="label-caps font-sans">Candidates</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link to="/vacancies">Open vacancies</Link>
            </li>
            <li>
              <Link to="/register">Create an account</Link>
            </li>
            <li>
              <Link to="/help">Help &amp; FAQ</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="label-caps font-sans">Institution</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link to="/privacy">Privacy notice</Link>
            </li>
            <li>
              <Link to="/help#contact">Contact</Link>
            </li>
            <li>
              <Link to="/login">Staff sign in</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="page-container py-4 text-xs text-muted">
          © {new Date().getFullYear()} PSG College of Technology. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="page-container flex-1 py-8 sm:py-10 lg:py-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Staff layout: sidebar on large screens, top bar + drawer on small screens.
// ------------------------------------------------------------------------------------------------
function StaffSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { grants, name, initials, roleLabel, user } = useUser();
  const groups = staffNav(grants);
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Brand to="/staff" subtitle="Staff workspace" inverted />
      </div>
      <nav aria-label="Staff" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">
              {g.title}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition-colors ${
                        isActive
                          ? "bg-brand-600 font-semibold text-white shadow-sm"
                          : "text-white/80 hover:bg-white/8 hover:text-white"
                      }`
                    }
                  >
                    <n.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/60 no-underline hover:bg-white/6 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Public site
          </a>
        </div>
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-400 text-xs font-bold text-navy-900"
          >
            {initials || "U"}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{name}</span>
            <span className="block truncate text-xs text-white/60">{roleLabel}</span>
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-white/45" title={user?.email}>
          {user?.email}
        </p>
        <SignOut className="btn btn-sm mt-3 w-full border border-white/15 text-white hover:bg-white/10 hover:text-white" />
      </div>
    </div>
  );
}

/** Desktop header: institution name, application search and the signed-in user. */
function StaffTopBar() {
  const { grants, name, initials, roleLabel } = useUser();
  const canSearch = isAdmin(grants) || isHrOfficer(grants);
  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center gap-6 border-b border-line bg-paper/95 px-8 backdrop-blur lg:flex">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/images/psg_logo.png" alt="" className="h-9 w-auto" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-base font-semibold text-navy-800 uppercase">
            PSG College of Technology
          </span>
          <span className="block truncate text-xs text-muted">Staff Recruitment Portal</span>
        </span>
      </div>
      {canSearch ? (
        <form method="get" action="/staff" role="search" className="relative mx-auto w-full max-w-xl">
          <label htmlFor="top-q" className="sr-only">
            Search applications
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="top-q"
            name="q"
            type="search"
            placeholder="Search applications, candidates, reference no…"
            className="field-input border-transparent bg-soft pl-9 hover:border-line"
          />
        </form>
      ) : (
        <div className="mx-auto" />
      )}
      <div className="flex shrink-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-full bg-navy-800 text-xs font-bold text-white"
        >
          {initials || "U"}
        </span>
        <span className="leading-tight">
          <span className="block max-w-48 truncate text-sm font-semibold text-ink">{name}</span>
          <span className="block text-xs font-medium text-brand-700">{roleLabel}</span>
        </span>
      </div>
    </header>
  );
}

function StaffLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <aside className="hero-gradient sticky top-0 hidden h-dvh lg:block">
        <StaffSidebarContent />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-navy-800 px-4 lg:hidden">
        <Brand to="/staff" subtitle="Staff workspace" inverted />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn -mr-2 px-2 text-white hover:bg-white/10"
          aria-expanded={open}
          aria-controls="staff-drawer"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Staff menu">
          <button
            type="button"
            className="absolute inset-0 bg-navy-900/60"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            id="staff-drawer"
            className="hero-gradient absolute inset-y-0 left-0 w-[min(18rem,85vw)] shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn absolute top-4 right-3 px-2 text-white hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <StaffSidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <StaffTopBar />
        <main id="main" className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { staff } = useUser();
  const { pathname } = useLocation();
  const staffArea = staff && /^\/(staff|admin)(\/|$)/.test(pathname);
  return (
    <>
      <RouteProgress />
      {staffArea ? <StaffLayout>{children}</StaffLayout> : <PublicLayout>{children}</PublicLayout>}
    </>
  );
}

export default function App() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let status = 500;
  let title = "Something went wrong";
  let detail =
    "An unexpected error occurred. Please try again. If the problem continues, contact the recruitment office.";
  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = "Page not found";
      detail = "The page you requested does not exist or you do not have access to it.";
    } else if (error.status === 403) {
      title = "Access denied";
      detail = typeof error.data === "string" ? error.data : "You do not have permission to view this page.";
    } else if (typeof error.data === "string") detail = error.data;
  }
  return (
    <Shell>
      <div className="mx-auto max-w-xl py-10 text-center">
        <p className="font-display text-6xl font-semibold text-brand-600">{status}</p>
        <h1 className="mt-4">{title}</h1>
        <p className="mt-3 text-muted">{detail}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="btn-primary">
            Back to home
          </Link>
          <Link to="/help#contact" className="btn-secondary">
            Contact the recruitment office
          </Link>
        </div>
      </div>
    </Shell>
  );
}
