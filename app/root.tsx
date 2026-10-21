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
} from "lucide-react";
import type { Route } from "./+types/root";
import "./app.css";
import { nonceContext, userContext } from "./context";
import {
  getPrimaryRoleBadge,
  hasPermission,
  isAdmin,
  isHodReviewer,
  isHrOfficer,
  isStaff,
} from "./modules/auth/permissions";
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

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 sm:gap-3.5 no-underline group shrink-0"
      aria-label="PSG College of Technology — Home"
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <img
          src="/images/psg_logo.png"
          alt="PSG College of Technology Crest"
          className="h-8 sm:h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
        />
        <div className="flex flex-col leading-tight border-l border-line/80 pl-2 sm:pl-3 min-w-0">
          <span className="text-xs sm:text-sm md:text-base font-black tracking-tight text-ink group-hover:text-brand-700 transition-colors uppercase whitespace-nowrap">
            <span className="hidden sm:inline">PSG College Of Technology</span>
            <span className="sm:hidden font-extrabold">PSG Tech</span>
          </span>
          <span className="text-[10px] sm:text-xs font-semibold text-muted tracking-wide whitespace-nowrap hidden sm:block">
            Faculty Recruitment Portal
          </span>
        </div>
        <div className="h-5 sm:h-7 md:h-8 w-px bg-line/80 shrink-0" />
        <img
          src="/images/75yearsLogo.png"
          alt="75 Years Celebration"
          className="h-7 sm:h-9 md:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
        />
        <div className="h-5 sm:h-7 md:h-8 w-px bg-line/80 shrink-0" />
        <img
          src="/images/100yearsLogo.png"
          alt="100 Years Legacy"
          className="h-7 sm:h-9 md:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    </Link>
  );
}

function Header() {
  const root = useRouteLoaderData<typeof loader>("root");
  const user = root?.user;
  const grants = user?.grants ?? [];
  const isAdm = isAdmin(grants);
  const isHr = isHrOfficer(grants);
  const isHod = isHodReviewer(grants);
  const roleBadge = getPrimaryRoleBadge(grants);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const nav =
    "rounded-full px-3.5 py-1.5 text-sm font-semibold no-underline text-muted hover:bg-soft hover:text-ink transition-colors aria-[current=page]:bg-ink aria-[current=page]:text-white";
  const initials = (user?.displayName ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line/70 bg-white/95 backdrop-blur-md shadow-xs">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 px-3 sm:px-6 lg:px-10 py-2.5 sm:py-3">
        <Logo />

        {/* Desktop Navigation */}
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1.5">
          <NavLink to="/vacancies" className={nav}>
            Find a job
          </NavLink>
          <NavLink to="/help" className={nav}>
            How it works
          </NavLink>
          {user && grants.some((g) => g.role === "CANDIDATE") && (
            <NavLink to="/account" className={nav}>
              My applications
            </NavLink>
          )}
          {user && hasPermission(grants, "application:list") && (
            <NavLink to="/staff" end className={nav}>
              {isHod ? "Department Review" : isHr ? "Applications Queue" : "Applications"}
            </NavLink>
          )}
          {user && hasPermission(grants, "recruitment:manage") && (
            <NavLink to="/admin" end className={nav}>
              {isHr ? "Job Profiles (Entry)" : "Job Profiles & Cycles"}
            </NavLink>
          )}
          {user && hasPermission(grants, "user:manage") && (
            <NavLink to="/admin/users" className={nav}>
              Users & Roles
            </NavLink>
          )}
          {user && hasPermission(grants, "audit:read") && (
            <NavLink to="/staff/audit" className={nav}>
              Audit log
            </NavLink>
          )}
        </nav>

        {/* Desktop User actions */}
        <div className="hidden lg:flex items-center gap-3">
          {user ? (
            <form method="post" action="/logout" className="flex items-center gap-2.5">
              <CsrfInput />
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-100 to-indigo-100 text-brand-900 border border-brand-200 text-xs font-bold"
                >
                  {initials || "🙂"}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold truncate max-w-[170px]">{user.displayName}</span>
                  <span className="text-[11px] font-bold text-brand-700 tracking-tight">
                    {roleBadge.label}
                  </span>
                </span>
              </div>
              <button type="submit" className="btn-secondary px-4 py-2">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link to="/login" className="btn px-4 py-2 text-ink hover:bg-soft">
                Login
              </Link>
              <Link to="/register" className="btn-primary px-5 py-2">
                Sign up
              </Link>
            </>
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

              {user && grants.some((g) => g.role === "CANDIDATE") && (
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

              {user && hasPermission(grants, "application:list") && (
                <NavLink
                  to="/staff"
                  end
                  className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <LayoutDashboard className="h-4 w-4 text-brand-600" />
                    {isHod ? "Department Review" : isHr ? "Applications Queue" : "Applications"}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </NavLink>
              )}

              {user && hasPermission(grants, "recruitment:manage") && (
                <NavLink
                  to="/admin"
                  end
                  className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-brand-600" />
                    {isHr ? "Job Profiles (Entry)" : "Job Profiles & Cycles"}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </NavLink>
              )}

              {user && hasPermission(grants, "user:manage") && (
                <NavLink
                  to="/admin/users"
                  className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-brand-600" />
                    User Management
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </NavLink>
              )}

              {user && hasPermission(grants, "audit:read") && (
                <NavLink
                  to="/staff/audit"
                  className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink hover:bg-soft aria-[current=page]:bg-ink aria-[current=page]:text-white transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-brand-600" />
                    Audit Log
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </NavLink>
              )}
            </nav>

            {/* Mobile Auth Bar */}
            <div className="mt-5 border-t border-line/70 pt-4">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-soft p-3">
                    <span
                      aria-hidden="true"
                      className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-pink-200 to-violet-200 text-sm font-bold text-ink"
                    >
                      {initials || "🙂"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
                      <p className="text-xs text-muted">
                        {isStaff(grants) ? "Staff Member" : "Candidate Account"}
                      </p>
                    </div>
                  </div>
                  <form method="post" action="/logout">
                    <CsrfInput />
                    <button
                      type="submit"
                      className="btn-secondary w-full py-2.5 text-danger hover:text-danger font-semibold"
                    >
                      <LogOut className="h-4 w-4 mr-1.5 inline" /> Sign out
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
