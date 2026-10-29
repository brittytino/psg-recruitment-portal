import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { NotFoundError, ValidationError } from "~/modules/core/errors";
import { sanitizeFilename } from "~/modules/documents/policy";
import { scanBytes } from "~/modules/documents/scan.server";
import { newKey, putFile } from "~/modules/documents/storage.server";

/**
 * "Open positions" notice: a PDF uploaded by HR – N4 Section and linked from the landing page.
 * Only the newest active notice is public; older uploads are kept for the record.
 */
export const NOTICE_MAX_MB = 10;

/** The notice currently shown on the landing page, or null. */
export function currentNotice() {
  return prisma.publicNotice.findFirst({
    where: { active: true },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, title: true, sizeBytes: true, uploadedAt: true, storageKey: true, sha256: true },
  });
}

export function listNotices(user: SessionUser | null) {
  requirePermission(user, "notice:manage");
  return prisma.publicNotice.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 20,
    select: { id: true, title: true, originalName: true, sizeBytes: true, active: true, uploadedAt: true },
  });
}

const titleSchema = z.string().trim().min(3, "Enter a title for the notice").max(150);

export async function uploadNotice(user: SessionUser | null, titleRaw: unknown, file: unknown) {
  const u = requirePermission(user, "notice:manage");
  const title = titleSchema.safeParse(titleRaw);
  if (!title.success)
    throw new ValidationError("Please correct the highlighted fields", {
      title: [title.error.issues[0]!.message],
    });
  if (!(file instanceof File) || file.size === 0)
    throw new ValidationError("Choose a PDF file", { file: ["Choose a PDF file"] });
  if (file.size > NOTICE_MAX_MB * 1024 * 1024)
    throw new ValidationError(`The PDF must be ${NOTICE_MAX_MB} MB or smaller`, {
      file: [`Maximum ${NOTICE_MAX_MB} MB`],
    });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the real content, not the browser-supplied type: a PDF starts with "%PDF-".
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new ValidationError("The file is not a PDF", { file: ["Only PDF files are accepted"] });
  if (env().MALWARE_SCAN !== "disabled") {
    const scan = await scanBytes(bytes);
    if (scan.status === "INFECTED")
      throw new ValidationError("The file failed the malware scan", { file: ["Upload a clean copy"] });
    if (scan.status === "FAILED")
      throw new ValidationError("The file could not be checked for malware. Try again in a minute.");
  }
  const key = newKey("generated", "pdf", "notices");
  const stored = await putFile(key, bytes);
  await prisma.$transaction(async (tx) => {
    await tx.publicNotice.updateMany({ where: { active: true }, data: { active: false } });
    const n = await tx.publicNotice.create({
      data: {
        title: title.data,
        originalName: sanitizeFilename(file.name || "notice.pdf"),
        storageKey: key,
        sizeBytes: stored.size,
        sha256: stored.sha256,
        uploadedById: u.id,
      },
    });
    await audit(
      {
        actorId: u.id,
        action: "notice.uploaded",
        entityType: "notice",
        entityId: n.id,
        metadata: { size: stored.size },
      },
      tx,
    );
  });
}

/** Shows (active) or hides a notice. Showing one hides the others. */
export async function setNoticeActive(user: SessionUser | null, id: string, active: boolean) {
  const u = requirePermission(user, "notice:manage");
  const n = await prisma.publicNotice.findUnique({ where: { id } });
  if (!n) throw new NotFoundError("Notice");
  await prisma.$transaction(async (tx) => {
    if (active) await tx.publicNotice.updateMany({ where: { active: true }, data: { active: false } });
    await tx.publicNotice.update({ where: { id }, data: { active } });
    await audit(
      {
        actorId: u.id,
        action: active ? "notice.shown" : "notice.hidden",
        entityType: "notice",
        entityId: id,
      },
      tx,
    );
  });
}
