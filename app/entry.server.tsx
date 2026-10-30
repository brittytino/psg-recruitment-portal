import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext, type RouterContextProvider } from "react-router";
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
export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) return;
  logger.error(
    {
      event: "app_error",
      err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      path: new URL(request.url).pathname,
    },
    "unhandled error",
  );
}
