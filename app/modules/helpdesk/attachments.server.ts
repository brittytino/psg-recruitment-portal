import { fileTypeFromBuffer } from "file-type";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import { imageInfo } from "~/modules/documents/docx/ooxml";
import { normalizePdf, pdfHeaderOffset } from "~/modules/documents/pdf-normalize.server";
import { sanitizeFilename } from "~/modules/documents/policy";
import { scanBytes } from "~/modules/documents/scan.server";
import { newKey, putFile } from "~/modules/documents/storage.server";
import { ATTACHMENT_TYPES_LABEL, TICKET_LIMITS } from "./definitions";

/**
 * Help desk attachments: screenshots and PDFs. Checked by content (not by name or browser type),
 * virus-scanned, stored under a random key in the private storage volume and only downloadable
 * through the authorised attachment route.
 */
export interface StoredAttachment {
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export function attachmentFiles(form: FormData, field = "files"): File[] {
  return form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

async function inspect(file: File): Promise<{ data: Uint8Array; mime: string; ext: string }> {
  const max = TICKET_LIMITS.attachmentMb * 1024 * 1024;
  if (file.size > max)
    throw new ValidationError(
      `“${sanitizeFilename(file.name)}” is larger than ${TICKET_LIMITS.attachmentMb} MB.`,
      {
        files: [`Each file must be ${TICKET_LIMITS.attachmentMb} MB or smaller`],
      },
    );
  let data: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const ft = await fileTypeFromBuffer(data);
  const mime = ft?.mime ?? (pdfHeaderOffset(data) >= 0 ? "application/pdf" : undefined);
  const bad = () =>
    new ValidationError(`“${sanitizeFilename(file.name)}” is not a ${ATTACHMENT_TYPES_LABEL} file.`, {
      files: [`Only ${ATTACHMENT_TYPES_LABEL} files are accepted`],
    });
  if (mime === "application/pdf") {
    const pdf = await normalizePdf(data);
    if (!pdf.ok)
      throw new ValidationError(`“${sanitizeFilename(file.name)}” could not be read as a PDF.`, {
        files: ["Save the PDF again (Print → Save as PDF) and attach the new file"],
      });
    data = pdf.data;
    return { data, mime, ext: "pdf" };
  }
  if (mime === "image/png" || mime === "image/jpeg") {
    try {
      const info = imageInfo(data);
      if (info.widthPx < 10 || info.heightPx < 10 || info.widthPx > 12000 || info.heightPx > 12000)
        throw bad();
    } catch {
      throw bad();
    }
    return { data, mime, ext: mime === "image/png" ? "png" : "jpg" };
  }
  throw bad();
}

/**
 * Validates, scans and stores every file before anything is written to the database, so a ticket
 * or reply is never saved with a silently missing attachment.
 */
export async function storeAttachments(files: File[]): Promise<StoredAttachment[]> {
  if (files.length > TICKET_LIMITS.attachments)
    throw new ValidationError(`Attach at most ${TICKET_LIMITS.attachments} files.`, {
      files: [`At most ${TICKET_LIMITS.attachments} files`],
    });
  const checked = [];
  for (const f of files) checked.push({ file: f, ...(await inspect(f)) });
  const out: StoredAttachment[] = [];
  for (const c of checked) {
    if (env().MALWARE_SCAN !== "disabled") {
      const scan = await scanBytes(c.data);
      if (scan.status === "INFECTED")
        throw new ValidationError(`“${sanitizeFilename(c.file.name)}” failed the virus check.`, {
          files: ["Attach a clean copy"],
        });
      if (scan.status === "FAILED")
        throw new ValidationError(
          "The files could not be checked for viruses just now. Please try again in a minute.",
        );
    }
    const key = newKey("uploads", c.ext);
    const stored = await putFile(key, c.data);
    out.push({
      originalName: sanitizeFilename(c.file.name || `attachment.${c.ext}`),
      storageKey: key,
      mimeType: c.mime,
      sizeBytes: stored.size,
      sha256: stored.sha256,
    });
  }
  return out;
}
