/**
 * Browser-side upload helper shared by the application form and the documents page.
 *
 * Handles the failures candidates actually hit, especially on phones:
 *  - files picked from Google Drive / WhatsApp / "recent files" that the browser cannot read
 *    (the request then fails before it leaves the phone and looks like a network error),
 *  - files over the size limit (checked before uploading),
 *  - proxies answering with an HTML page instead of the app's JSON (413, 502, 504 …),
 *  - a dropped mobile connection (retried once automatically).
 */
export type UploadReply = {
  ok: boolean;
  formError?: string;
  document?: { id: string; type: string; name: string; size: number };
};

export const ACCEPTED_TYPES_LABEL = "PDF, JPG or PNG";

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Message for a file over the limit, or null when it is fine. */
export function tooLargeMessage(file: File, maxUploadMb: number): string | null {
  if (file.size <= maxUploadMb * 1024 * 1024) return null;
  return `This file is ${sizeLabel(file.size)}. The maximum is ${maxUploadMb} MB per file. Reduce the size (for example with a "compress PDF" app, or scan at a lower quality) and upload again.`;
}

const UNREADABLE =
  "Your device could not read this file. If it is in Google Drive, WhatsApp or another app, download / save it to your phone first, then choose it again.";

/** Reads every picked file into memory so an unreadable cloud file is reported clearly. */
async function materialise(fd: FormData): Promise<FormData | string> {
  const out = new FormData();
  for (const [key, value] of fd.entries()) {
    if (typeof value === "string") {
      out.append(key, value);
      continue;
    }
    if (value.size === 0) return "The chosen file is empty. Choose the file again.";
    try {
      const bytes = await value.arrayBuffer();
      out.append(
        key,
        new File([bytes], value.name || "document", { type: value.type || "application/octet-stream" }),
      );
    } catch {
      return UNREADABLE;
    }
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function postUpload(url: string, fd: FormData, maxUploadMb: number): Promise<UploadReply> {
  for (const v of fd.values()) {
    if (typeof v !== "string") {
      const big = tooLargeMessage(v, maxUploadMb);
      if (big) return { ok: false, formError: big };
    }
  }
  const body = await materialise(fd);
  if (typeof body === "string") return { ok: false, formError: body };

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    try {
      res = await fetch(url, { method: "POST", body, credentials: "same-origin" });
    } catch {
      if (attempt === 0) await wait(1500);
    }
  }
  if (!res)
    return {
      ok: false,
      formError: `The upload did not reach the server. Check that your internet is working and try again. Accepted: ${ACCEPTED_TYPES_LABEL}, up to ${maxUploadMb} MB per file.`,
    };

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      return (await res.json()) as UploadReply;
    } catch {
      /* fall through to the status-based message */
    }
  }
  const byStatus: Record<number, string> = {
    401: "You have been signed out. Sign in again and retry the upload.",
    403: "Your session has expired. Reload the page and try again.",
    408: "The upload took too long. Try again on a faster connection.",
    413: `The file is too large. Upload a file of ${maxUploadMb} MB or smaller (compress the PDF if needed).`,
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
