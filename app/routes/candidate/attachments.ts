import type { Route } from "./+types/attachments";
import { readForm, requireUser } from "~/lib/http.server";
import { isDomainError } from "~/modules/core/errors";
import { removeDocument, uploadDocument } from "~/modules/documents/service.server";

/** Dedicated resource route for uploading and detaching entry attachments in application forms. */
export async function action({ request, params, context }: Route.ActionArgs) {
  try {
    const user = requireUser(context, request);
    const form = await readForm(request, context);
    const intent = form.get("intent");

    if (intent === "remove") {
      const documentId = String(form.get("documentId") ?? "");
      if (documentId) {
        await removeDocument(user, params.id, documentId);
      }
      return Response.json({ ok: true, action: "remove", documentId });
    }

    const file = form.get("file");
    const docType = form.get("documentType");
    const doc = await uploadDocument(user, params.id, docType, file instanceof File ? file : null);

    return Response.json({
      ok: true,
      action: "upload",
      document: {
        id: doc.id,
        type: doc.documentType,
        name: doc.originalName,
        size: doc.sizeBytes,
      },
    });
  } catch (e) {
    if (isDomainError(e)) {
      return Response.json({ ok: false, formError: e.message }, { status: e.status });
    }
    return Response.json(
      { ok: false, formError: "Upload failed. Please check that the file is not damaged." },
      { status: 500 },
    );
  }
}
