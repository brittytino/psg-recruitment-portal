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
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { nonceContext, userContext } from "./context";
import { hasPermission, isStaff } from "./modules/auth/permissions";
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
      className="flex items-center gap-2.5 no-underline text-ink"
      aria-label="PSG Tech Careers — home"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pink-400 to-violet-400 text-lg shadow-[var(--shadow-float)]"
      >
        🌸
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-bold tracking-tight">PSG Tech Careers</span>
        <span className="text-[11px] font-medium text-muted">Staff Recruitment · Coimbatore</span>
      </span>
    </Link>
  );
}

function Header() {
  const root = useRouteLoaderData<typeof loader>("root");
  const user = root?.user;
  const grants = user?.grants ?? [];
  const nav =
    "rounded-full px-3 py-1.5 text-sm font-medium no-underline text-muted hover:bg-soft hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-white";
  const initials = (user?.displayName ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-full bg-white/85 px-4 py-2.5 shadow-[var(--shadow-soft)] backdrop-blur">
        <Logo />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
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
              Dashboard
            </NavLink>
          )}
          {user && hasPermission(grants, "recruitment:manage") && (
            <NavLink to="/admin" end className={nav}>
              Administration
            </NavLink>
          )}
          {user && hasPermission(grants, "user:manage") && (
            <NavLink to="/admin/users" className={nav}>
              Users
            </NavLink>
          )}
          {user && hasPermission(grants, "audit:read") && (
            <NavLink to="/staff/audit" className={nav}>
              Audit log
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <form method="post" action="/logout" className="flex items-center gap-2">
              <CsrfInput />
              <span className="hidden items-center gap-2 sm:flex">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink-200 to-violet-200 text-xs font-bold"
                >
                  {initials || "🙂"}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{user.displayName}</span>
                  <span className="text-[11px] text-muted">{isStaff(grants) ? "Staff" : "Candidate"}</span>
                </span>
              </span>
              <button type="submit" className="btn-secondary px-4 py-2">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link to="/login" className="btn px-4 py-2 text-ink hover:bg-soft">
                Login
              </Link>
              <Link to="/register" className="btn-primary px-4 py-2">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 px-4 pb-6">
      <div className="mx-auto grid max-w-6xl gap-8 rounded-[var(--radius-card)] bg-white p-8 shadow-[var(--shadow-soft)] sm:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted">
            Faculty recruitment for PSG College of Technology, Peelamedu, Coimbatore – 641 004. Autonomous,
            affiliated to Anna University, ISO 9001:2015 certified.
          </p>
        </div>
        <div>
          <h2 className="text-sm">Candidates</h2>
          <ul className="mt-3 space-y-2 text-sm">
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
          <h2 className="text-sm">Institution</h2>
          <ul className="mt-3 space-y-2 text-sm">
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
    <>
      <Header />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </>
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
