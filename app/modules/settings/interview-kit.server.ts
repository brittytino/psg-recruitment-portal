import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { ValidationError } from "~/modules/core/errors";
import { sanitizeFilename } from "~/modules/documents/policy";
import { scanBytes } from "~/modules/documents/scan.server";
import { pdfHeaderOffset } from "~/modules/documents/pdf-normalize.server";
import { newKey, pathFor, putFile } from "~/modules/documents/storage.server";
import { readFile } from "node:fs/promises";

/**
 * "Interview kit": the one PPT template and one datasheet PDF e-mailed, unchanged, with every
 * interview call (HR – N4 Section, Dean / Principal / Admin). Common to every candidate, so one
 * upload replaces it for every interview call from then on — never customised per application.
 * Also holds the default venue / instructions text the interview-call form starts from.
 */
export const INTERVIEW_KIT_KEY = "INTERVIEW_KIT";
// Kept modest: the e-mail carries this file plus the datasheet in the same message, over either
// delivery method configured in Control Centre, so both attachments together should stay well
// under what mail providers reliably accept.
export const INTERVIEW_FILE_MAX_MB = 8;

export interface InterviewKit {
  pptKey: string | null;
  pptName: string | null;
  pptSize: number | null;
  datasheetKey: string | null;
  datasheetName: string | null;
  datasheetSize: number | null;
  venueTemplate: string;
  instructionsTemplate: string;
}

const EMPTY_KIT: InterviewKit = {
  pptKey: null,
  pptName: null,
  pptSize: null,
  datasheetKey: null,
  datasheetName: null,
  datasheetSize: null,
  venueTemplate: "",
  instructionsTemplate: "",
};

/** The current kit. Never throws; a fresh install simply has nothing configured yet. */
export async function getInterviewKit(): Promise<InterviewKit> {
  const row = await prisma.systemSetting.findUnique({ where: { key: INTERVIEW_KIT_KEY } });
  if (!row) return EMPTY_KIT;
  return { ...EMPTY_KIT, ...(row.value as unknown as Partial<InterviewKit>) };
}

/** The two files as mail attachments (nodemailer shape), for whichever ones are configured. */
export async function interviewKitAttachments(): Promise<{ filename: string; content: Buffer }[]> {
  const kit = await getInterviewKit();
  const out: { filename: string; content: Buffer }[] = [];
  for (const [key, name] of [
    [kit.pptKey, kit.pptName],
    [kit.datasheetKey, kit.datasheetName],
  ] as const) {
    if (!key || !name) continue;
    try {
      out.push({ filename: name, content: await readFile(pathFor(key)) });
    } catch {
      // The file is missing on disk (e.g. storage was reset): skip it rather than fail the whole send.
    }
  }
  return out;
}

const PPTX_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // .pptx (zip/OOXML)
const PPT_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .ppt (OLE/CFB)

function looksLikePresentation(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 8));
  return (
    head.subarray(0, 4).equals(PPTX_SIGNATURE) || head.equals(PPT_SIGNATURE) || pdfHeaderOffset(bytes) >= 0
  );
}

async function validateAndStore(
  file: File,
  field: "ppt" | "datasheet",
  check: (bytes: Uint8Array) => boolean,
  message: string,
): Promise<{ key: string; name: string; size: number }> {
  if (file.size > INTERVIEW_FILE_MAX_MB * 1024 * 1024)
    throw new ValidationError(`The file must be ${INTERVIEW_FILE_MAX_MB} MB or smaller`, {
      [field]: [`Maximum ${INTERVIEW_FILE_MAX_MB} MB`],
    });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!check(bytes)) throw new ValidationError(message, { [field]: [message] });
  if (env().MALWARE_SCAN !== "disabled") {
    const scan = await scanBytes(bytes);
    if (scan.status === "INFECTED")
      throw new ValidationError("The file failed the malware scan", { [field]: ["Upload a clean copy"] });
    if (scan.status === "FAILED")
      throw new ValidationError("The file could not be checked for malware. Try again in a minute.");
  }
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = newKey("generated", ext, "interview-kit");
  const stored = await putFile(key, bytes);
  return { key, name: sanitizeFilename(file.name || `file.${ext}`), size: stored.size };
}

const templateSchema = z.object({
  venueTemplate: z.string().trim().max(300).default(""),
  instructionsTemplate: z.string().trim().max(2000).default(""),
});

export interface SaveInterviewKitInput {
  pptFile?: File | null;
  datasheetFile?: File | null;
  removePpt?: boolean;
  removeDatasheet?: boolean;
  venueTemplate?: unknown;
  instructionsTemplate?: unknown;
}

/** Replaces the PPT and/or datasheet and/or the default venue / instructions text. */
export async function saveInterviewKit(
  user: SessionUser | null,
  input: SaveInterviewKitInput,
): Promise<void> {
  const u = requirePermission(user, "interview_kit:manage");
  const p = templateSchema.safeParse({
    venueTemplate: input.venueTemplate,
    instructionsTemplate: input.instructionsTemplate,
  });
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);

  const current = await getInterviewKit();
  const next: InterviewKit = { ...current, ...p.data };

  if (input.pptFile instanceof File && input.pptFile.size > 0) {
    const stored = await validateAndStore(
      input.pptFile,
      "ppt",
      looksLikePresentation,
      "Upload a .ppt, .pptx or .pdf file",
    );
    next.pptKey = stored.key;
    next.pptName = stored.name;
    next.pptSize = stored.size;
  } else if (input.removePpt) {
    next.pptKey = null;
    next.pptName = null;
    next.pptSize = null;
  }

  if (input.datasheetFile instanceof File && input.datasheetFile.size > 0) {
    const stored = await validateAndStore(
      input.datasheetFile,
      "datasheet",
      (bytes) => pdfHeaderOffset(bytes) >= 0,
      "Upload a PDF file",
    );
    next.datasheetKey = stored.key;
    next.datasheetName = stored.name;
    next.datasheetSize = stored.size;
  } else if (input.removeDatasheet) {
    next.datasheetKey = null;
    next.datasheetName = null;
    next.datasheetSize = null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: INTERVIEW_KIT_KEY },
      create: { key: INTERVIEW_KIT_KEY, value: next as unknown as Prisma.InputJsonValue, updatedById: u.id },
      update: { value: next as unknown as Prisma.InputJsonValue, updatedById: u.id },
    });
    await audit(
      {
        actorId: u.id,
        action: "settings.interview_kit_updated",
        entityType: "system_setting",
        entityId: INTERVIEW_KIT_KEY,
        metadata: {
          pptReplaced: input.pptFile instanceof File && input.pptFile.size > 0,
          datasheetReplaced: input.datasheetFile instanceof File && input.datasheetFile.size > 0,
        },
      },
      tx,
    );
  });
}
