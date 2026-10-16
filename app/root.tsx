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

function Header() {
  const root = useRouteLoaderData<typeof loader>("root");
  const user = root?.user;
  const grants = user?.grants ?? [];
  const nav =
    "rounded px-2 py-1 text-sm no-underline text-ink hover:bg-brand-50 aria-[current=page]:font-semibold aria-[current=page]:text-brand-700";
  return (
    <header className="border-b border-line bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex flex-col no-underline text-ink">
          <span className="text-base font-semibold">PSG College of Technology</span>
          <span className="text-xs text-muted">Staff Recruitment Portal · Coimbatore</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          <NavLink to="/vacancies" className={nav}>
            Vacancies
          </NavLink>
          <NavLink to="/help" className={nav}>
            Help &amp; FAQ
          </NavLink>
          {user && grants.some((g) => g.role === "CANDIDATE") && (
            <NavLink to="/account" className={nav}>
              My applications
            </NavLink>
          )}
          {user && hasPermission(grants, "application:list") && (
            <NavLink to="/staff" className={nav}>
              Applications
            </NavLink>
          )}
          {user && hasPermission(grants, "recruitment:manage") && (
            <NavLink to="/admin" className={nav}>
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
          {user ? (
            <form method="post" action="/logout" className="ml-2 flex items-center gap-2">
              <CsrfInput />
              <span className="hidden text-sm text-muted sm:inline">
                {user.displayName}
                {isStaff(grants) ? " (staff)" : ""}
              </span>
              <button type="submit" className="btn-secondary py-1">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <NavLink to="/login" className={nav}>
                Sign in
              </NavLink>
              <Link to="/register" className="btn-primary ml-1 py-1">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted">
        <p>PSG College of Technology, Peelamedu, Coimbatore – 641 004</p>
        <p className="flex gap-4">
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/help#contact">Contact</Link>
        </p>
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
  let detail =
    "An unexpected error occurred. Please try again. If the problem continues, contact the recruitment office.";
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Page not found";
      detail = "The page you requested does not exist or you do not have access to it.";
    } else if (error.status === 403) {
      title = "Access denied";
      detail = typeof error.data === "string" ? error.data : "You do not have permission to view this page.";
    } else if (typeof error.data === "string") detail = error.data;
  }
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-3xl px-4 py-16">
        <h1>{title}</h1>
        <p className="mt-3 text-muted">{detail}</p>
        <p className="mt-6">
          <Link to="/">Return to the home page</Link>
        </p>
      </main>
    </>
  );
}
