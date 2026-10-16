# Document pipeline

Code: `app/modules/documents/pipeline.server.ts`, `docx/render.ts`, `docx/ooxml.ts`, `converter/server.mjs`.

1. **Submission** (web, one transaction): revision with answers + attachment manifest (document id, type, SHA-256, size) is stored; a `generated_documents` row (version 1, QUEUED) and an outbox event are created.
2. **Scan jobs** (worker): each upload is streamed to clamd (INSTREAM). `CLEAN` / `INFECTED` / `FAILED` recorded; failures retry with backoff.
3. **Generate job** (worker, retried up to 6×, exponential backoff):
   1. Load the immutable revision and the exact template version; verify the template file's SHA-256 against `form_templates.sha256`.
   2. Check every manifest attachment: exists, checksum matches, scan CLEAN. Pending scan → retry; infected → permanent failure with an actionable message.
   3. Populate the original DOCX in place (`render.ts`): text after label colons, table cells, block-letter boxes (merged when a value is longer), blank writing lines, cloned rows/blocks for overflow, photograph inside the photograph text box. A tab-stop layout simulation keeps later labels on the same line at their original positions. Every field key is recorded as bound; deviations (continuation rows/lines, merged boxes) are reported.
   4. Convert with LibreOffice headless in the separate `converter` container (per-request profile, timeout, concurrency limit, bearer token, internal network).
   5. Validate the form PDF (loads; page count ≥ template's rendered pages: 2 and 11).
   6. Append attachments in `BUNDLE_ORDER` (degree, marks, Ph.D., experience, salary, community, NOC, publications, other); images are placed on A4 pages, never upscaled. No cover pages or watermarks are added.
   7. Re-load the merged PDF and verify the total page count equals form pages + attachment pages.
   8. Store under a new random key, record checksum, size, pages and the report; mark READY (row becomes write-once).
4. **Regeneration** creates version n+1 for the same revision; earlier artefacts are kept.

## Layout fidelity (verified by rendering and visual comparison)

- Minimal applications render with the same page count as the templates (2 and 11 pages in LibreOffice) and identical headings, tables, letterhead, logo and endorsement areas.
- Long applications grow by continuation (extra rows/lines/pages); nothing is truncated. Known effects: a value after "State :" wraps because the label sits near the right margin; when page 1 of the Associate form overflows, its typed "..2" marker moves to the next page.
- Word's own pagination may differ slightly from LibreOffice; LibreOffice is the reference renderer.

## Regression tests

- `tests/unit/docx-render.test.ts`: every field bound; every value present; every original character preserved in order; photo placed; deviations reported (minimal, long names, many rows, 40 publications, 45 journal papers, special and Tamil characters).
- `tests/integration/workflow.test.ts`: full pipeline through ClamAV and LibreOffice for both forms, exact page counts.
- `scripts/render-samples.ts` + `scripts/inspect-pdfs.sh`: renders fixtures and rasterises pages for visual comparison against the original templates.
