/**
 * Headers for private file responses. `?view=1` shows the file inside this site's document viewer
 * (inline, frameable by this site only); otherwise it downloads. Either way the browser may not
 * guess another type, and other sites may not embed it.
 */
export function fileHeaders(
  request: Request,
  file: { mimeType: string; size: number; downloadName: string },
): Record<string, string> {
  const view = new URL(request.url).searchParams.get("view") === "1";
  const viewable = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/");
  const inline = view && viewable;
  return {
    "Content-Type": file.mimeType,
    "Content-Length": String(file.size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.downloadName.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...(inline
      ? {
          // PDFs need the browser's viewer (no sandbox); only this site may frame it.
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": "frame-ancestors 'self'",
        }
      : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
  };
}
