import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

/**
 * Makes real-world PDFs usable:
 *  - finds the PDF header even when a few junk bytes precede it (some scanner apps do this),
 *  - removes "no password" encryption (DigiLocker certificates, bank statements, university mark
 *    sheets are often encrypted only to restrict printing/copying; they open without a password),
 *  - repairs minor structural damage that viewers tolerate.
 * Uses qpdf (installed in the app image). Returns the bytes to store, or a reason it cannot be used.
 */
export type PdfCheck =
  { ok: true; data: Uint8Array; pages: number } | { ok: false; reason: "password" | "damaged" };

const HEADER = Buffer.from("%PDF-");

/** Index of the "%PDF-" header within the first 1 KB (readers accept leading junk), or -1. */
export function pdfHeaderOffset(data: Uint8Array): number {
  return Buffer.from(data.buffer, data.byteOffset, Math.min(data.byteLength, 1024)).indexOf(HEADER);
}

async function pageCount(data: Uint8Array): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(data, { updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

async function isEncrypted(data: Uint8Array): Promise<boolean> {
  try {
    return (await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })).isEncrypted;
  } catch {
    return false;
  }
}

function qpdf(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile("qpdf", args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
      // qpdf exits 3 when it succeeded with warnings (e.g. after repairing the file).
      const code = err ? (typeof err.code === "number" ? err.code : 2) : 0;
      resolve({ code, stderr: String(stderr ?? "") });
    });
  });
}

/** Rewrites the PDF with qpdf: decrypts (empty user password only) and repairs. */
async function rewrite(data: Uint8Array): Promise<{ data: Uint8Array } | { error: "password" | "failed" }> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-"));
  const input = join(dir, `${randomUUID()}.pdf`);
  const output = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(input, data, { mode: 0o600 });
    const r = await qpdf(["--decrypt", "--object-streams=preserve", input, output]);
    if (r.code !== 0 && r.code !== 3) return { error: /password/i.test(r.stderr) ? "password" : "failed" };
    return { data: new Uint8Array(await readFile(output)) };
  } catch {
    return { error: "failed" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function normalizePdf(raw: Uint8Array): Promise<PdfCheck> {
  const offset = pdfHeaderOffset(raw);
  if (offset < 0) return { ok: false, reason: "damaged" };
  const data = offset > 0 ? raw.subarray(offset) : raw;

  if (!(await isEncrypted(data))) {
    const pages = await pageCount(data);
    if (pages && pages > 0) return { ok: true, data, pages };
  }
  // Encrypted (without a user password) or not readable as-is: let qpdf decrypt / repair it.
  const fixed = await rewrite(data);
  if ("error" in fixed) return { ok: false, reason: fixed.error === "password" ? "password" : "damaged" };
  const pages = await pageCount(fixed.data);
  if (!pages) return { ok: false, reason: "damaged" };
  return { ok: true, data: fixed.data, pages };
}
