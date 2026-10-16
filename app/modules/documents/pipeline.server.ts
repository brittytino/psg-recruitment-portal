import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { getFormDefinition } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { renderApplicationDocx } from "./docx/render";
import { BUNDLE_ORDER, DOCUMENT_TYPE_LABELS, type DocType } from "./policy";
import { newKey, putFile, sha256Hex, getVerifiedFile } from "./storage.server";

/** Errors that should be retried (transient), as opposed to permanent data problems. */
export class RetryableError extends Error {}
/** Permanent failure with an actionable message for the HR operator. */
export class PipelineError extends Error {}

export interface ManifestEntry {
  documentId: string;
  documentType: DocType;
  sha256: string;
  sizeBytes: number;
  originalName: string;
}

export async function convertDocxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  const e = env();
  let res: Response;
  try {
    res = await fetch(`${e.CONVERTER_URL}/convert?from=docx`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(e.CONVERTER_TOKEN ? { authorization: `Bearer ${e.CONVERTER_TOKEN}` } : {}) },
      body: Buffer.from(docx),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    throw new RetryableError(`Converter unreachable: ${(err as Error).message}`);
  }
  if (res.status === 503) throw new RetryableError("Converter busy");
  if (!res.ok) throw new PipelineError(`DOCX to PDF conversion failed (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A4 portrait in PDF points. Images are scaled to fit within 1 cm margins, never upscaled beyond 100%. */
const A4 = { w: 595.28, h: 841.89, margin: 28.35 };

async function imageToPdf(data: Uint8Array, mime: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const img = mime === "image/png" ? await pdf.embedPng(data) : await pdf.embedJpg(data);
  const landscape = img.width > img.height;
  const pw = landscape ? A4.h : A4.w;
  const ph = landscape ? A4.w : A4.h;
  const scale = Math.min((pw - 2 * A4.margin) / img.width, (ph - 2 * A4.margin) / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = pdf.addPage([pw, ph]);
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return pdf;
}

/** Orders attachments: by document type (BUNDLE_ORDER), then upload order within a type. */
export function orderManifest(entries: ManifestEntry[]): ManifestEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.documentType !== "PHOTOGRAPH")
    .sort((a, b) => BUNDLE_ORDER.indexOf(a.e.documentType) - BUNDLE_ORDER.indexOf(b.e.documentType) || a.i - b.i)
    .map(({ e }) => e);
}

export interface BundleReport {
  formCode: FormCode;
  formVersion: number;
  revisionNo: number;
  applicationPages: number;
  sourcePageCount: number;
  deviations: string[];
  photoPlaced: boolean;
  attachments: { documentId: string; documentType: DocType; label: string; originalName: string; pages: number; sha256: string }[];
  totalPages: number;
}

/**
 * Generates the consolidated bundle for one GeneratedDocument row. Idempotent: a READY row is
 * left untouched; output is stored under a new random key and recorded with its checksum.
 */
export async function generateBundle(generatedDocumentId: string, attempt: number): Promise<"done" | "skipped"> {
  const gen = await prisma.generatedDocument.findUnique({
    where: { id: generatedDocumentId },
    include: { revision: true, application: { include: { vacancy: { include: { department: true } } } } },
  });
  if (!gen) throw new PipelineError("Generated document record not found");
  if (gen.status === "READY") return "skipped";

  await prisma.generatedDocument.update({ where: { id: gen.id }, data: { status: "PROCESSING", attempts: attempt, error: null } });
  await prisma.application.updateMany({ where: { id: gen.applicationId, currentRevisionId: gen.revisionId }, data: { processingStatus: "PROCESSING" } });

  const rev = gen.revision;
  const code = rev.formCode as FormCode;
  const def = getFormDefinition(code, rev.formVersion);
  const tplRow = await prisma.formTemplate.findUniqueOrThrow({ where: { code_version: { code, version: rev.formVersion } } });
  const template = new Uint8Array(await readFile(resolve(def.templatePath)));
  if (sha256Hex(template) !== tplRow.sha256) throw new PipelineError(`Template file ${def.templatePath} does not match its registered checksum`);

  const manifest = rev.attachmentManifest as unknown as ManifestEntry[];
  const docs = await prisma.applicationDocument.findMany({ where: { id: { in: manifest.map((m) => m.documentId) } } });
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const m of manifest) {
    const d = byId.get(m.documentId);
    if (!d) throw new PipelineError(`Attachment "${m.originalName}" is missing from storage records`);
    if (d.sha256 !== m.sha256) throw new PipelineError(`Attachment "${m.originalName}" does not match the submitted checksum`);
    if (d.scanStatus === "PENDING") throw new RetryableError(`Attachment "${m.originalName}" is awaiting malware scan`);
    if (d.scanStatus === "INFECTED") throw new PipelineError(`Attachment "${m.originalName}" (${DOCUMENT_TYPE_LABELS[m.documentType]}) was flagged by the malware scanner and cannot be included. Return the application to the candidate for a clean copy.`);
    if (d.scanStatus === "FAILED") throw new RetryableError(`Malware scan failed for "${m.originalName}": ${d.scanDetail ?? "unknown error"}`);
  }

  const photoEntry = manifest.find((m) => m.documentType === "PHOTOGRAPH");
  const photo = photoEntry ? await getVerifiedFile(byId.get(photoEntry.documentId)!.storageKey, photoEntry.sha256) : null;
  const { docx, report } = await renderApplicationDocx({ formCode: code, template, answers: rev.answers as Answers, photo });
  const formPdfBytes = await convertDocxToPdf(docx);
  let formPdf: PDFDocument;
  try {
    formPdf = await PDFDocument.load(formPdfBytes);
  } catch {
    throw new PipelineError("The converted application PDF could not be read");
  }
  if (formPdf.getPageCount() < def.sourcePageCount)
    throw new PipelineError(`Converted application has ${formPdf.getPageCount()} pages; the template has ${def.sourcePageCount}`);

  const out = await PDFDocument.create();
  out.setTitle(`Application ${gen.application.referenceNo ?? ""} (revision ${rev.revisionNo})`);
  out.setProducer("PSG Tech Staff Recruitment Portal");
  out.setCreationDate(new Date());
  (await out.copyPages(formPdf, formPdf.getPageIndices())).forEach((p) => out.addPage(p));

  const attachments: BundleReport["attachments"] = [];
  for (const m of orderManifest(manifest)) {
    const d = byId.get(m.documentId)!;
    const bytes = await getVerifiedFile(d.storageKey, m.sha256);
    let src: PDFDocument;
    try {
      src = d.mimeType === "application/pdf" ? await PDFDocument.load(bytes) : await imageToPdf(bytes, d.mimeType);
    } catch (err) {
      throw new PipelineError(`Attachment "${m.originalName}" could not be read as ${d.mimeType}: ${(err as Error).message}`);
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    attachments.push({ documentId: m.documentId, documentType: m.documentType, label: DOCUMENT_TYPE_LABELS[m.documentType], originalName: m.originalName, pages: pages.length, sha256: m.sha256 });
  }

  const finalBytes = await out.save();
  // Validate the merged output by re-reading it and checking every page was included.
  const expectedPages = formPdf.getPageCount() + attachments.reduce((n, a) => n + a.pages, 0);
  const check = await PDFDocument.load(finalBytes);
  if (check.getPageCount() !== expectedPages) throw new PipelineError(`Merged PDF has ${check.getPageCount()} pages; expected ${expectedPages}`);

  const key = newKey("generated", "pdf", gen.applicationId);
  const { sha256, size } = await putFile(key, finalBytes);
  const bundleReport: BundleReport = {
    formCode: code,
    formVersion: rev.formVersion,
    revisionNo: rev.revisionNo,
    applicationPages: formPdf.getPageCount(),
    sourcePageCount: def.sourcePageCount,
    deviations: report.deviations,
    photoPlaced: report.photoPlaced,
    attachments,
    totalPages: expectedPages,
  };
  await prisma.$transaction(async (tx) => {
    await tx.generatedDocument.update({
      where: { id: gen.id },
      data: { status: "READY", storageKey: key, sha256, sizeBytes: size, pageCount: expectedPages, completedAt: new Date(), report: bundleReport as object, error: null },
    });
    await tx.application.updateMany({ where: { id: gen.applicationId, currentRevisionId: gen.revisionId }, data: { processingStatus: "READY" } });
  });
  logger.info({ generatedDocumentId: gen.id, pages: expectedPages, attachments: attachments.length }, "bundle generated");
  return "done";
}

/** Records a permanent failure, visible to HR with an actionable message. */
export async function markBundleFailed(generatedDocumentId: string, message: string): Promise<void> {
  const gen = await prisma.generatedDocument.findUnique({ where: { id: generatedDocumentId } });
  if (!gen || gen.status === "READY") return;
  await prisma.$transaction(async (tx) => {
    await tx.generatedDocument.update({ where: { id: gen.id }, data: { status: "FAILED", error: message.slice(0, 1000) } });
    await tx.application.updateMany({ where: { id: gen.applicationId, currentRevisionId: gen.revisionId }, data: { processingStatus: "FAILED" } });
  });
}
