import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import {
  isRouteErrorResponse,
  ServerRouter,
  type EntryContext,
  type RouterContextProvider,
} from "react-router";
import { nonceContext } from "./context";
import { logger } from "./modules/core/logger.server";
import { PRIVATE_PATHS } from "./lib/seo";

export const streamTimeout = 5_000;

/** Security headers for every document response (API/file routes set their own). */
export function securityHeaders(headers: Headers, nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`,
      `style-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${dev ? " ws: wss:" : ""}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join("; "),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const nonce = loadContext.get(nonceContext);
  securityHeaders(responseHeaders, nonce);
  // Private pages (sign-in, accounts, staff, admin, ticket pages) never appear in search results.
  // Error pages are not indexed either.
  if (PRIVATE_PATHS.test(new URL(request.url).pathname) || responseStatusCode >= 400)
    responseHeaders.set("X-Robots-Tag", "noindex, nofollow");
  if (request.method.toUpperCase() === "HEAD")
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          responseHeaders.set("Content-Type", "text/html; charset=utf-8");
          pipe(body);
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) logger.error({ err: String(error) }, "render error");
        },
      },
    );
  });
}

/** Logs unexpected server errors without leaking them to the client. */
/**
 * Paths that only automated scanners ask for (secrets, infrastructure files, other frameworks).
 * They are 404s like any unknown address; they are logged once as a security notice, not as errors.
 */
const PROBE =
  /(^|\/)\.(env|git|svn|hg|aws|ssh|docker|kube|terraform|vscode|idea|npmrc|htpasswd|DS_Store)|\.(tf|tfvars|tfstate|bak|backup|old|swp|sql|ini|cfg|conf|pem|key|yml|yaml|toml)(\.json)?$|(^|\/)(wp-|wordpress|phpmyadmin|cgi-bin|vendor\/|config\/|k8s\/|kubernetes\/|helm\/|chart\/|ansible|group_vars|host_vars|terraform|Procfile|Dockerfile|docker-compose|vercel\.json|netlify\.toml|fly\.toml|wrangler\.toml|railway\.json|render\.yaml|app\.yaml|kubeconfig|inventory|vault\.yml|\.vercel)/i;

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (isRouteErrorResponse(error)) return { status: error.status, statusText: error.statusText };
  if (error instanceof Response) return { status: error.status };
  try {
    return { value: JSON.stringify(error)?.slice(0, 500) };
  } catch {
    return { value: String(error) };
  }
}

export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) return;
  const path = new URL(request.url).pathname;
  const status = isRouteErrorResponse(error) ? error.status : error instanceof Response ? error.status : 500;
  // Not-found, forbidden and similar responses are normal outcomes, not application errors.
  if (status < 500) {
    if (PROBE.test(path))
      logger.warn(
        {
          event: "security_probe",
          path: path.slice(0, 200),
          ip: request.headers.get("x-real-ip") ?? undefined,
        },
        "scanner probe for a sensitive file (answered 404)",
      );
    return;
  }
  logger.error({ event: "app_error", err: describe(error), path }, "unhandled error");
}
