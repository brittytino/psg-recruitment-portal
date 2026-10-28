import type { Route } from "./+types/preview-pdf";
import { requireUser } from "~/lib/http.server";
import { POSITION_LABELS } from "~/lib/labels";
import { derivedContext, getOwnApplication } from "~/modules/applications/service.server";
import { renderFormPdf } from "~/modules/documents/pipeline.server";
import type { DocType } from "~/modules/documents/policy";
import { getFile } from "~/modules/documents/storage.server";
import { getFormDefinition, isDocxForm } from "~/modules/forms/registry";
import type { Answers, FormCode } from "~/modules/forms/types";
import { withDerived } from "~/modules/forms/validation";

/**
 * Watermarked preview of the candidate's own draft, drawn exactly like the submitted application
 * (v2 forms). Shown on the review step before final submission; nothing is stored.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const app = await getOwnApplication(user, params.id);
  const def = getFormDefinition(app.formTemplate.code as FormCode, app.formTemplate.version);
  if (isDocxForm(def)) throw new Response("Preview is not available for this form version", { status: 404 });
  const docs = app.documents.filter((d) => !d.removedAt);
  const printed = async (t: DocType) => {
    const d = docs.find((x) => x.documentType === t && x.scanStatus !== "INFECTED");
    return d ? { bytes: await getFile(d.storageKey), mime: d.mimeType } : null;
  };
  const position = app.appliedPosition
    ? (POSITION_LABELS[app.appliedPosition] ?? app.appliedPosition)
    : (app.vacancy.researchPositionTitle ??
      (app.vacancy.position
        ? (POSITION_LABELS[app.vacancy.position] ?? app.vacancy.position)
        : "Research Assistant"));
  const department = app.vacancy.department?.name ?? app.vacancy.researchSpecialisation?.name ?? "Research";
  const pdf = await renderFormPdf({
    formCode: def.code,
    formVersion: def.version,
    answers: withDerived(def, app.draftAnswers as Answers, derivedContext(app)),
    department,
    position,

    referenceNo: app.referenceNo,
    revisionNo: null,
    submittedAt: null,
    photo: await printed("PHOTOGRAPH"),
    signature: await printed("SIGNATURE"),
    attachments: docs.map((d) => ({ documentType: d.documentType as DocType, originalName: d.originalName })),
    preview: true,
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="application-preview.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Embedded in the review page of this site only.
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
