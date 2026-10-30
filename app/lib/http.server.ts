import { data, redirect, type RouterContextProvider } from "react-router";
import { userContext } from "~/context";
import { requireAuth, requirePermission } from "~/modules/auth/policy.server";
import type { Permission } from "~/modules/auth/permissions";
import type { SessionUser } from "~/modules/auth/session.server";
import { verifyCsrf } from "~/modules/auth/session.server";
import { clientIp } from "~/modules/auth/rate-limit.server";
import { isDomainError, RateLimitedError, UnauthenticatedError } from "~/modules/core/errors";
import { logger } from "~/modules/core/logger.server";

type Ctx = Readonly<RouterContextProvider>;

export const currentUser = (context: Ctx) => context.get(userContext);

/** Redirects anonymous users to sign in (preserving a safe same-site return path). */
export function requireUser(context: Ctx, request: Request): SessionUser {
  const user = context.get(userContext);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return user;
}

export function requireStaff(context: Ctx, request: Request, p: Permission): SessionUser {
  const u = requireUser(context, request);
  try {
    return requirePermission(u, p);
  } catch {
    throw data("You do not have access to this page.", { status: 403 });
  }
}

/** Only allow relative, same-site redirect targets (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Reads form data and verifies the CSRF token for the current session. */
export async function readForm(request: Request, context: Ctx): Promise<FormData> {
  const form = await request.formData();
  const user = context.get(userContext);
  if (!verifyCsrf(user?.sessionId ?? null, form.get("_csrf")))
    throw data({ formError: "Your session has expired. Reload the page and try again." }, { status: 403 });
  return form;
}

export type ActionResult = {
  ok?: boolean;
  formError?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  details?: unknown;
};

/**
 * Runs an action body and converts domain errors into typed `data()` responses with a safe
 * message. Unexpected errors are logged and reported generically (no stack traces to clients).
 */
export async function handleAction<T>(
  fn: () => Promise<T>,
): Promise<T | ReturnType<typeof data<ActionResult>>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e && typeof e === "object" && "type" in e && (e as { type: string }).type === "DataWithResponseInit")
      throw e;
    if (e instanceof UnauthenticatedError) throw redirect("/login");
    if (isDomainError(e)) {
      const fieldErrors =
        e.details && typeof e.details === "object" && !Array.isArray(e.details)
          ? (e.details as ActionResult["fieldErrors"])
          : undefined;
      const headers: HeadersInit =
        e instanceof RateLimitedError ? { "Retry-After": String(e.retryAfterSeconds) } : {};
      return data<ActionResult>(
        { formError: e.message, fieldErrors, details: e.details },
        { status: e.status, headers },
      );
    }
    logger.error({ event: "app_error", err: e instanceof Error ? e.message : String(e) }, "action failed");
    return data<ActionResult>({ formError: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export { clientIp };
export const _assertAuth = requireAuth;
