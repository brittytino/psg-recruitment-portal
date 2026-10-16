import { fileTypeFromBuffer } from "file-type";
import { PDFDocument } from "pdf-lib";
import { getOwnApplication } from "~/modules/applications/service.server";
import { EDITABLE, type AppStatus } from "~/modules/applications/workflow";
import { audit } from "~/modules/audit/audit.server";
import { hasPermission } from "~/modules/auth/permissions";
import { staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { enqueueOutbox } from "~/modules/notifications/outbox.server";
import { imageInfo } from "./docx/ooxml";
import { allowedMime, DOCUMENT_TYPES, MAX_FILES_PER_TYPE, PHOTO_MAX_BYTES, sanitizeFilename, type DocType } from "./policy";
import { newKey, putFile } from "./storage.server";

export interface DetectedFile {
  mime: "application/pdf" | "image/jpeg" | "image/png";
  ext: "pdf" | "jpg" | "png";
}

/** Determines the real file type from its signature and checks it is structurally valid. */
export async function inspectUpload(data: Uint8Array, type: DocType): Promise<DetectedFile> {
  const ft = await fileTypeFromBuffer(data);
  const mime = ft?.mime;
  if (mime !== "application/pdf" && mime !== "image/jpeg" && mime !== "image/png")
    throw new ValidationError("Only PDF, JPEG or PNG files are accepted. The file content does not match an allowed type.");
  if (!allowedMime(type).includes(mime))
    throw new ValidationError(type === "PHOTOGRAPH" ? "The photograph must be a JPEG or PNG image" : "This file type is not allowed for this document");
  if (mime === "application/pdf") {
    try {
      const pdf = await PDFDocument.load(data, { updateMetadata: false });
      if (pdf.getPageCount() < 1) throw new Error("no pages");
    } catch (e) {
      const msg = String((e as Error).message ?? "");
      throw new ValidationError(
        /encrypt/i.test(msg) ? "Password-protected PDFs cannot be accepted. Please upload an unprotected copy." : "The PDF appears to be damaged and could not be read.",
      );
    }
    return { mime, ext: "pdf" };
  }
  try {
    const info = imageInfo(data);
    if (info.widthPx < 50 || info.heightPx < 50 || info.widthPx > 10000 || info.heightPx > 10000) throw new Error("dimensions");
  } catch {
    throw new ValidationError("The image could not be read or has unusual dimensions.");
  }
  if (type === "PHOTOGRAPH" && data.byteLength > PHOTO_MAX_BYTES) throw new ValidationError("The photograph must be 2 MB or smaller");
  return { mime, ext: mime === "image/png" ? "png" : "jpg" };
}

export async function uploadDocument(user: SessionUser, applicationId: string, typeRaw: unknown, file: File | null) {
  const type = DOCUMENT_TYPES.find((t) => t === typeRaw);
  if (!type) throw new ValidationError("Choose a document type");
  if (!file || file.size === 0) throw new ValidationError("Choose a file to upload");
  const max = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > max) throw new ValidationError(`Files must be ${env().MAX_UPLOAD_MB} MB or smaller`);
  const app = await getOwnApplication(user, applicationId);
  if (!EDITABLE.includes(app.status as AppStatus)) throw new ConflictError("Documents can only be changed while the application is editable");
  const sameType = app.documents.filter((d) => d.documentType === type && !d.removedAt);
  if (type !== "PHOTOGRAPH" && sameType.length >= MAX_FILES_PER_TYPE) throw new ValidationError(`At most ${MAX_FILES_PER_TYPE} files per document type`);

  const data = new Uint8Array(await file.arrayBuffer());
  const detected = await inspectUpload(data, type);
  const key = newKey("uploads", detected.ext);
  const { sha256, size } = await putFile(key, data);
  return prisma.$transaction(async (tx) => {
    // A new photograph replaces the previous one.
    if (type === "PHOTOGRAPH")
      await tx.applicationDocument.updateMany({ where: { applicationId, documentType: "PHOTOGRAPH", removedAt: null }, data: { removedAt: new Date() } });
    const doc = await tx.applicationDocument.create({
      data: {
        applicationId,
        documentType: type,
        originalName: sanitizeFilename(file.name),
        storageKey: key,
        mimeType: detected.mime,
        sizeBytes: size,
        sha256,
        uploadedById: user.id,
      },
    });
    await enqueueOutbox(tx, { type: "documents.scan", payload: { documentId: doc.id } });
    await audit({ actorId: user.id, action: "document.uploaded", entityType: "application", entityId: applicationId, metadata: { documentId: doc.id, documentType: type, sizeBytes: size } }, tx);
    return doc;
  });
}

export async function removeDocument(user: SessionUser, applicationId: string, documentId: string) {
  const app = await getOwnApplication(user, applicationId);
  if (!EDITABLE.includes(app.status as AppStatus)) throw new ConflictError("Documents can only be changed while the application is editable");
  const doc = app.documents.find((d) => d.id === documentId);
  if (!doc) throw new NotFoundError("Document");
  await prisma.$transaction(async (tx) => {
    await tx.applicationDocument.update({ where: { id: documentId }, data: { removedAt: new Date() } });
    await audit({ actorId: user.id, action: "document.removed", entityType: "application", entityId: applicationId, metadata: { documentId } }, tx);
  });
}

/**
 * Authorises a download of an uploaded document. Candidates may download their own files; staff
 * need `document:download` and record-level scope. Staff downloads are audited.
 */
export async function authorizeDocumentDownload(user: SessionUser, documentId: string, ip?: string) {
  const doc = await prisma.applicationDocument.findUnique({ where: { id: documentId }, include: { application: { select: { id: true, candidateId: true } } } });
  if (!doc) throw new NotFoundError("Document");
  if (doc.application.candidateId === user.id) return doc;
  if (!hasPermission(user.grants, "document:download")) throw new NotFoundError("Document");
  const scope = staffApplicationScope(user);
  const visible = scope && (await prisma.application.count({ where: { AND: [{ id: doc.applicationId }, scope] } }));
  if (!visible) throw new NotFoundError("Document");
  await audit({ actorId: user.id, action: "document.downloaded", entityType: "application", entityId: doc.applicationId, ip, metadata: { documentId } });
  return doc;
}

export async function authorizeGeneratedDownload(user: SessionUser, generatedId: string, ip?: string) {
  const g = await prisma.generatedDocument.findUnique({ where: { id: generatedId }, include: { application: { select: { candidateId: true } } } });
  if (!g || g.status !== "READY" || !g.storageKey) throw new NotFoundError("Document");
  if (g.application.candidateId === user.id) return g;
  if (!hasPermission(user.grants, "document:download")) throw new NotFoundError("Document");
  const scope = staffApplicationScope(user);
  const visible = scope && (await prisma.application.count({ where: { AND: [{ id: g.applicationId }, scope] } }));
  if (!visible) throw new NotFoundError("Document");
  await audit({ actorId: user.id, action: "bundle.downloaded", entityType: "application", entityId: g.applicationId, ip, metadata: { generatedId, version: g.version } });
  return g;
}

/** Requests regeneration of the consolidated bundle as a new version (previous versions are kept). */
export async function requestRegeneration(user: SessionUser, applicationId: string, ip?: string) {
  if (!hasPermission(user.grants, "document:regenerate")) throw new ForbiddenError();
  const scope = staffApplicationScope(user);
  const app = scope && (await prisma.application.findFirst({ where: { AND: [{ id: applicationId }, scope] } }));
  if (!app || !app.currentRevisionId) throw new NotFoundError("Application");
  await prisma.$transaction(async (tx) => {
    const active = await tx.generatedDocument.count({
      where: { revisionId: app.currentRevisionId!, kind: "CONSOLIDATED_BUNDLE", status: { in: ["QUEUED", "PROCESSING"] } },
    });
    if (active) throw new ConflictError("A PDF generation job is already running for this application");
    const last = await tx.generatedDocument.findFirst({
      where: { revisionId: app.currentRevisionId!, kind: "CONSOLIDATED_BUNDLE" },
      orderBy: { version: "desc" },
    });
    const gen = await tx.generatedDocument.create({
      data: { applicationId, revisionId: app.currentRevisionId!, kind: "CONSOLIDATED_BUNDLE", version: (last?.version ?? 0) + 1, requestedById: user.id },
    });
    await tx.application.update({ where: { id: applicationId }, data: { processingStatus: "QUEUED" } });
    await enqueueOutbox(tx, { type: "documents.generate", payload: { generatedDocumentId: gen.id } });
    await audit({ actorId: user.id, action: "bundle.regeneration_requested", entityType: "application", entityId: applicationId, ip, metadata: { version: gen.version } }, tx);
  });
}
