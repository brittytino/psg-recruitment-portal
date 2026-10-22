import { PDFDocument, PDFHexString, PDFName, rgb, StandardFonts, type PDFRef } from "pdf-lib";
import { pdfSafe } from "./render";

export interface BundleSection {
  title: string;
  /** 0-based index of the first page of this section in the final document. */
  startPage: number;
  pages: number;
}

/**
 * Draws the index ("contents") page listing every section of a consolidated bundle with its page
 * range, and inserts it at `at`. Returns the number of pages inserted (always 1 page per 40 rows).
 */
export async function insertIndexPages(
  doc: PDFDocument,
  at: number,
  heading: string,
  sections: BundleSection[],
): Promise<number> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const perPage = 40;
  const count = Math.max(1, Math.ceil(sections.length / perPage));
  for (let p = 0; p < count; p++) {
    const page = doc.insertPage(at + p, [595.28, 841.89]);
    let y = 790;
    page.drawText("PSG COLLEGE OF TECHNOLOGY", {
      x: 42,
      y,
      size: 13,
      font: bold,
      color: rgb(0.45, 0.07, 0.29),
    });
    y -= 20;
    page.drawText(pdfSafe(heading), { x: 42, y, size: 11, font: bold });
    y -= 16;
    page.drawText("Contents of this consolidated application", {
      x: 42,
      y,
      size: 9,
      font,
      color: rgb(0.36, 0.37, 0.42),
    });
    y -= 24;
    for (const s of sections.slice(p * perPage, (p + 1) * perPage)) {
      const range =
        s.pages > 1 ? `pages ${s.startPage + 1}-${s.startPage + s.pages}` : `page ${s.startPage + 1}`;
      const title = pdfSafe(s.title).slice(0, 95);
      page.drawText(title, { x: 42, y, size: 9.5, font });
      page.drawText(range, { x: 553 - font.widthOfTextAtSize(range, 9.5), y, size: 9.5, font });
      y -= 17;
    }
  }
  return count;
}

/** Adds a flat bookmark (outline) entry for each section. */
export function addOutline(doc: PDFDocument, sections: BundleSection[]) {
  if (!sections.length) return;
  const ctx = doc.context;
  const pages = doc.getPages();
  const outlineRef = ctx.nextRef();
  const refs: PDFRef[] = sections.map(() => ctx.nextRef());
  sections.forEach((s, i) => {
    const page = pages[Math.min(s.startPage, pages.length - 1)]!;
    const dict = ctx.obj({
      Title: PDFHexString.fromText(s.title),
      Parent: outlineRef,
      Dest: [page.ref, "XYZ", null, null, null],
    });
    if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]!);
    if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]!);
    ctx.assign(refs[i]!, dict);
  });
  ctx.assign(
    outlineRef,
    ctx.obj({ Type: "Outlines", First: refs[0]!, Last: refs[refs.length - 1]!, Count: refs.length }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlineRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
