/**
 * Browser-side upload helper shared by the application form and the documents page.
 * Reverse proxies answer some failures with an HTML page instead of the app's JSON (for example
 * 413 when a proxy's body-size limit is lower than ours, or 502/504 during a restart). Those cases
 * are turned into a clear message instead of a generic "could not connect".
 */
export type UploadReply = {
  ok: boolean;
  formError?: string;
  document?: { id: string; type: string; name: string; size: number };
};

export async function postUpload(url: string, fd: FormData, maxUploadMb: number): Promise<UploadReply> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
  } catch {
    return {
      ok: false,
      formError: "Could not reach the server. Check your internet connection and try again.",
    };
  }
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      return (await res.json()) as UploadReply;
    } catch {
      /* fall through to the status-based message */
    }
  }
  const byStatus: Record<number, string> = {
    403: "Your session has expired. Reload the page and try again.",
    408: "The upload took too long. Try again on a faster connection.",
    413: `The file is too large for the server. Upload a file smaller than ${maxUploadMb} MB (compress the PDF if needed).`,
    429: "Too many uploads in a short time. Wait a minute and try again.",
    502: "The server is restarting. Wait a minute and try again.",
    503: "The server is busy. Wait a minute and try again.",
    504: "The upload took too long. Try again on a faster connection.",
  };
  return {
    ok: false,
    formError: byStatus[res.status] ?? `Upload failed (error ${res.status}). Please try again.`,
  };
}
