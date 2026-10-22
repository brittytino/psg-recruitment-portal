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
  useRouteLoaderData,
} from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserPlus,
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

/** Staff navigation, by role. Every page re-checks permissions on the server. */
function staffNav(grants: RoleGrant[]): { to: string; label: string; icon: LucideIcon; end?: boolean }[] {
  const items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [];
  const office = isAdmin(grants) || isHrOfficer(grants);
  if (office) items.push({ to: "/staff", label: "Applications", icon: LayoutDashboard, end: true });
  if (isHodReviewer(grants)) items.push({ to: "/staff/review", label: "My reviews", icon: ClipboardCheck });
  items.push({
    to: "/staff/summary",
    label: office ? "Summary & export" : "Summary sheet",
    icon: FileSpreadsheet,
  });
  if (hasPermission(grants, "recruitment:manage"))
    items.push({ to: "/admin", label: "Job profiles", icon: Briefcase, end: true });
  if (hasPermission(grants, "user:manage"))
    items.push({ to: "/admin/users", label: "Users & roles", icon: Users });
  if (hasPermission(grants, "settings:manage"))
    items.push({ to: "/admin/settings", label: "Settings", icon: Settings });
  if (hasPermission(grants, "audit:read"))
    items.push({ to: "/staff/audit", label: "Audit", icon: ShieldCheck });
  return items;
}
import { csrfToken, getSessionUser } from "./modules/auth/session.server";
import { env } from "./modules/core/env.server";
import { CsrfInput } from "./components/forms";

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
      const allowed = new URL(env().APP_ORIGIN).origin;
      const sameSite = request.headers.get("sec-fetch-site");
      if (origin ? origin !== allowed : sameSite !== "same-origin")
        throw new Response("Cross-origin request blocked", { status: 403 });
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

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen">
        {children}
        <ScrollRestoration nonce={root?.nonce} />
        <Scripts nonce={root?.nonce} />
      </body>
    </html>
  );
}

function Logo({ isStaffUser }: { isStaffUser?: boolean }) {
  return (
    <Link
      to={isStaffUser ? "/staff" : "/"}
      className="flex items-center gap-2.5 sm:gap-3.5 no-underline group shrink-0"
      aria-label="PSG College of Technology — Home"
    >
      <img
        src="/images/psg_logo.png"
        alt="PSG College of Technology Crest"
        className="h-9 sm:h-10 md:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
      />
      <div className="flex flex-col leading-tight border-l border-slate-200/90 pl-2.5 sm:pl-3 min-w-0">
        <span className="text-xs sm:text-sm md:text-base font-black tracking-tight text-slate-900 group-hover:text-brand-700 transition-colors uppercase whitespace-nowrap">
          <span className="hidden sm:inline">PSG College of Technology</span>
          <span className="sm:hidden font-extrabold">PSG Tech</span>
        </span>
        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 tracking-wide whitespace-nowrap">
          {isStaffUser ? "Staff Recruitment Portal" : "Faculty Recruitment"}
        </span>
      </div>
      <div className="hidden 2xl:flex items-center gap-2 border-l border-slate-200/80 pl-2.5">
        <img
          src="/images/75yearsLogo.png"
          alt="75 Years Celebration"
          className="h-7 w-auto object-contain opacity-80 transition-opacity hover:opacity-100"
        />
        <img
          src="/images/100yearsLogo.png"
          alt="100 Years Legacy"
          className="h-7 w-auto object-contain opacity-80 transition-opacity hover:opacity-100"
        />
      </div>
    </Link>
  );
}

function Header() {
  const root = useRouteLoaderData<typeof loader>("root");
  const user = root?.user;
  const grants = user?.grants ?? [];
  const staff = isStaff(grants);
  const nav = staffNav(grants);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Clean full name removing parenthetical role repetitions
  const rawName = user?.displayName ?? "";
  const cleanDisplayName = rawName.replace(/\s*\([^)]*\)\s*/g, "").trim() || rawName || "Staff Member";

  const roleLabel = primaryRoleLabel(grants);

  const initials = (cleanDisplayName || "")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const staffNavActive =
    "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold text-brand-950 bg-white border border-slate-200/90 shadow-xs no-underline transition-all duration-150";
  const staffNavInactive =
    "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-all duration-150 no-underline";

  const publicNavActive =
    "rounded-full px-4 py-1.5 text-sm font-bold text-white bg-slate-900 shadow-xs no-underline transition-colors";
  const publicNavInactive =
    "rounded-full px-4 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors no-underline";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex w-full max-w-[1550px] items-center justify-between gap-4 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <Logo isStaffUser={staff} />

        {/* Center Navigation */}
        {staff ? (
          <nav
            aria-label="Staff Workspace Navigation"
            className="hidden lg:flex items-center gap-1 p-1 rounded-2xl bg-slate-100/80 border border-slate-200/80 shadow-2xs"
          >
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => (isActive ? staffNavActive : staffNavInactive)}
              >
                <n.icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : (
          <nav aria-label="Main Navigation" className="hidden lg:flex items-center gap-2">
            <NavLink
              to="/vacancies"
              className={({ isActive }) => (isActive ? publicNavActive : publicNavInactive)}
            >
              Find a job
            </NavLink>
            <NavLink
              to="/help"
              className={({ isActive }) => (isActive ? publicNavActive : publicNavInactive)}
            >
              How it works
            </NavLink>
            {user && (
              <NavLink
                to="/account"
                className={({ isActive }) => (isActive ? publicNavActive : publicNavInactive)}
              >
                My applications
              </NavLink>
            )}
          </nav>
        )}

        {/* Desktop User actions */}
        <div className="hidden lg:flex items-center gap-2.5">
          {staff && (
            <Link
              to="/vacancies"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
              title="Preview public candidate vacancies page"
            >
              <span>Public Portal</span>
              <span className="text-[10px]">↗</span>
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              {/* Executive User Pill */}
              <div className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full bg-slate-50/90 border border-slate-200 shadow-2xs hover:border-brand-300 transition-colors">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-700 via-indigo-700 to-indigo-900 text-white text-xs font-black shadow-xs tracking-wider"
                >
                  {initials || "U"}
                </span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
                    {cleanDisplayName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-brand-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Sign out */}
              <form method="post" action="/logout" className="flex items-center">
                <CsrfInput />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-all shadow-2xs"
                  title="Sign out of account"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn px-4 py-2 text-ink hover:bg-soft text-sm font-semibold">
                Login
              </Link>
              <Link to="/register" className="btn-primary px-5 py-2 text-sm font-bold shadow-xs">
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 rounded-xl text-ink hover:bg-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Animated Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="lg:hidden border-t border-line/70 bg-white/98 backdrop-blur-xl px-4 py-5 shadow-xl overflow-hidden"
          >
            <nav aria-label="Mobile Navigation" className="flex flex-col space-y-1">
              {staff ? (
                <>
                  {nav.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <n.icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                        {n.label}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </NavLink>
                  ))}

                  <NavLink
                    to="/vacancies"
                    className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-slate-500 hover:bg-soft transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <Briefcase className="h-4 w-4" />
                      Public Candidate Site ↗
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink
                    to="/vacancies"
                    className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <Briefcase className="h-4 w-4 text-brand-600" />
                      Find a job
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </NavLink>

                  <NavLink
                    to="/help"
                    className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <HelpCircle className="h-4 w-4 text-brand-600" />
                      How it works
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </NavLink>

                  {user && (
                    <NavLink
                      to="/account"
                      className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-brand-600" />
                        My applications
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </NavLink>
                  )}
                </>
              )}
            </nav>

            {/* Mobile Auth Bar */}
            <div className="mt-5 border-t border-line/70 pt-4">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 border border-slate-200">
                    <span
                      aria-hidden="true"
                      className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-700 to-indigo-900 text-sm font-bold text-white shadow-xs"
                    >
                      {initials || "U"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{cleanDisplayName}</p>
                      <p className="text-xs font-semibold text-brand-700">{roleLabel}</p>
                    </div>
                  </div>
                  <form method="post" action="/logout">
                    <CsrfInput />
                    <button
                      type="submit"
                      className="btn-secondary w-full py-2.5 text-danger hover:text-danger font-semibold flex items-center justify-center gap-2"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/login" className="btn-secondary w-full py-2.5 text-center font-semibold">
                    <LogIn className="h-4 w-4 mr-1.5 inline" /> Sign in
                  </Link>
                  <Link to="/register" className="btn-primary w-full py-2.5 text-center font-semibold">
                    <UserPlus className="h-4 w-4 mr-1.5 inline" /> Sign up
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line/60 bg-white py-12 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-[1500px] gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-md text-sm text-muted leading-relaxed">
            Faculty recruitment for PSG College of Technology, Peelamedu, Coimbatore – 641 004. Autonomous,
            affiliated to Anna University, accredited with an ISO 9001:2015 certified legacy.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted pt-2">
            <span>© {new Date().getFullYear()} PSG College of Technology</span>
            <span>·</span>
            <span>All rights reserved</span>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Candidates</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Institution</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
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
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Header />
      <main
        id="main"
        className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let emoji = "😕";
  let detail =
    "An unexpected error occurred. Please try again. If the problem continues, contact the recruitment office.";
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Page not found";
      emoji = "🧭";
      detail = "The page you requested does not exist or you do not have access to it.";
    } else if (error.status === 403) {
      title = "Access denied";
      emoji = "🔒";
      detail = typeof error.data === "string" ? error.data : "You do not have permission to view this page.";
    } else if (typeof error.data === "string") detail = error.data;
  }
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-2xl px-4 py-16">
        <div className="card hero-gradient text-center">
          <p aria-hidden="true" className="text-5xl">
            {emoji}
          </p>
          <h1 className="mt-4">{title}</h1>
          <p className="mt-3 text-muted">{detail}</p>
          <p className="mt-6">
            <Link to="/" className="btn-primary">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
