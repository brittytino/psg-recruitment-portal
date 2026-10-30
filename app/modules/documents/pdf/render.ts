/**
 * Draws a v2 application directly as an A4 PDF (no Word template, no converter).
 *
 * Layout: PSG College of Technology header with photograph, one titled block per form step,
 * label/value rows in two columns, repeatable entries as numbered records, declaration with the
 * printed signature, the original present-employer endorsement block, and a footer with the
 * reference number and "Page X of Y" on every page. Previews carry a diagonal watermark.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Answers, FieldDef, FormDefinition, ScalarField, TableRow } from "~/modules/forms/types";
import { conditionMet, rowDuration } from "~/modules/forms/validation";
import { DOCUMENT_TYPE_LABELS, type DocType } from "../policy";

export interface RenderPdfInput {
  def: FormDefinition;
  /** Answers including derived values. */
  answers: Answers;
  department: string;
  position: string;
  referenceNo: string | null;
  revisionNo: number | null;
  submittedAt: Date | null;
  photo?: { bytes: Uint8Array; mime: string } | null;
  signature?: { bytes: Uint8Array; mime: string } | null;
  attachments: { documentType: DocType; originalName: string }[];
  preview: boolean;
  printEndorsement: boolean;
}

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 42, top: 48, bottom: 56 };
const INK = rgb(0.07, 0.075, 0.086);
const MUTED = rgb(0.36, 0.37, 0.42);
const LINE = rgb(0.85, 0.85, 0.88);
const BAND = rgb(0.95, 0.94, 0.96);
const BRAND = rgb(0.45, 0.07, 0.29);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Keeps text within the WinAnsi character set of the standard PDF fonts. */
export function pdfSafe(s: string): string {
  return s
    .replace(/₹/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\r\t]/g, " ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}

function fmt(f: ScalarField, v: unknown): string {
  if (v == null || v === "") return "";
  if (f.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
    return `${v.slice(8, 10)}-${v.slice(5, 7)}-${v.slice(0, 4)}`;
  if (f.kind === "monthYear" && typeof v === "string" && /^\d{4}-\d{2}$/.test(v))
    return `${MONTHS[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;
  if (f.kind === "select") return f.options.find((o) => o.value === v)?.label ?? String(v);
  if (f.kind === "number" && typeof v === "number" && /salary|pay|amount|emolument/i.test(f.key))
    return `Rs. ${v.toLocaleString("en-IN")}`;
  return String(v);
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M.top;
  }
  ensure(h: number) {
    if (this.y - h < M.bottom) this.newPage();
  }
  wrap(text: string, size: number, width: number, f = this.font): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= width) {
          line = next;
          continue;
        }
        if (line) out.push(line);
        // Break very long words (URLs) by characters.
        let w = word;
        while (f.widthOfTextAtSize(w, size) > width) {
          let i = w.length;
          while (i > 1 && f.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          out.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  }
  text(
    s: string,
    x: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb>; width?: number } = {},
  ) {
    const f = opts.bold ? this.bold : this.font;
    const lines = this.wrap(s, size, opts.width ?? A4.w - M.x - x);
    for (const l of lines) {
      this.ensure(size + 3);
      this.page.drawText(l, { x, y: this.y - size, size, font: f, color: opts.color ?? INK });
      this.y -= size + 3;
    }
  }
  heading(title: string) {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: M.x, y: this.y - 20, width: A4.w - 2 * M.x, height: 20, color: BAND });
    this.page.drawRectangle({ x: M.x, y: this.y - 20, width: 3, height: 20, color: BRAND });
    this.page.drawText(pdfSafe(title.toUpperCase()), {
      x: M.x + 10,
      y: this.y - 14,
      size: 9.5,
      font: this.bold,
      color: INK,
    });
    this.y -= 28;
  }
  /** Label/value pairs in two columns. */
  pairs(items: [string, string][], cols = 2) {
    const gap = 14;
    const colW = (A4.w - 2 * M.x - gap * (cols - 1)) / cols;
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols);
      const blocks = row.map(([l, v]) => ({
        l: this.wrap(l, 7.5, colW, this.bold),
        v: this.wrap(v || "-", 9.5, colW),
      }));
      const h = Math.max(...blocks.map((b) => b.l.length * 10 + b.v.length * 12.5)) + 6;
      if (h > A4.h - M.top - M.bottom) {
        // A single very long value: write it as flowing text.
        for (const [l, v] of row) {
          this.text(l, M.x, 7.5, { bold: true, color: MUTED });
          this.text(v || "-", M.x, 9.5);
          this.y -= 4;
        }
        continue;
      }
      this.ensure(h);
      blocks.forEach((b, j) => {
        const x = M.x + j * (colW + gap);
        let y = this.y;
        for (const l of b.l) {
          this.page.drawText(l, { x, y: y - 7.5, size: 7.5, font: this.bold, color: MUTED });
          y -= 10;
        }
        for (const v of b.v) {
          this.page.drawText(v, { x, y: y - 9.5, size: 9.5, font: this.font, color: INK });
          y -= 12.5;
        }
      });
      this.y -= h;
    }
  }
  rule() {
    this.ensure(8);
    this.page.drawLine({
      start: { x: M.x, y: this.y - 3 },
      end: { x: A4.w - M.x, y: this.y - 3 },
      thickness: 0.5,
      color: LINE,
    });
    this.y -= 8;
  }
}

function logoBytes(): Uint8Array | null {
  for (const p of [
    "app/public/images/psg_logo.png",
    "build/client/images/psg_logo.png",
    "public/images/psg_logo.png",
  ]) {
    const f = resolve(p);
    if (existsSync(f)) return new Uint8Array(readFileSync(f));
  }
  return null;
}

async function embed(doc: PDFDocument, img: { bytes: Uint8Array; mime: string } | null | undefined) {
  if (!img) return null;
  try {
    return img.mime === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null;
  }
}

function fit(img: PDFImage, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  return { width: img.width * s, height: img.height * s };
}

function istDateTime(d: Date): string {
  const t = new Date(d.getTime() + 5.5 * 3600_000).toISOString();
  return `${t.slice(8, 10)}-${t.slice(5, 7)}-${t.slice(0, 4)} ${t.slice(11, 16)} IST`;
}

function fieldVisible(f: FieldDef, a: Answers): boolean {
  return conditionMet(f.when, a);
}

export async function renderApplicationPdf(input: RenderPdfInput): Promise<Uint8Array> {
  const { def, answers: a } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${def.title}${input.referenceNo ? ` — ${input.referenceNo}` : ""}`));
  doc.setProducer("PSG Tech Recruitment");
  doc.setCreationDate(input.submittedAt ?? new Date());
  const w = new Writer(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );

  // Header
  const logo = logoBytes();
  const logoImg = logo ? await doc.embedPng(logo).catch(() => null) : null;
  const photo = await embed(doc, input.photo);
  const top = w.y;
  if (logoImg) {
    const s = fit(logoImg, 52, 52);
    w.page.drawImage(logoImg, { x: M.x, y: top - s.height, ...s });
  }
  const tx = M.x + (logoImg ? 62 : 0);
  const textW = A4.w - tx - M.x - 92;
  w.page.drawText("PSG COLLEGE OF TECHNOLOGY", { x: tx, y: top - 14, size: 15, font: w.bold, color: BRAND });
  w.page.drawText("Peelamedu, Coimbatore - 641 004  |  Autonomous, affiliated to Anna University", {
    x: tx,
    y: top - 27,
    size: 7.5,
    font: w.font,
    color: MUTED,
  });
  let hy = top - 44;
  for (const l of w.wrap(def.title.replace(/\s+/g, " "), 10.5, textW, w.bold)) {
    w.page.drawText(l, { x: tx, y: hy, size: 10.5, font: w.bold, color: INK });
    hy -= 13;
  }
  w.page.drawText(pdfSafe(`Department of ${input.department}`), {
    x: tx,
    y: hy,
    size: 9.5,
    font: w.font,
    color: INK,
  });
  hy -= 13;
  // Photograph box
  const pbx = A4.w - M.x - 80;
  w.page.drawRectangle({ x: pbx, y: top - 100, width: 80, height: 100, borderColor: LINE, borderWidth: 1 });
  if (photo) {
    const s = fit(photo, 76, 96);
    w.page.drawImage(photo, { x: pbx + (80 - s.width) / 2, y: top - 100 + (100 - s.height) / 2, ...s });
  } else w.page.drawText("PHOTOGRAPH", { x: pbx + 14, y: top - 54, size: 8, font: w.font, color: MUTED });
  w.y = Math.min(hy, top - 108) - 6;
  const meta: [string, string][] = [
    ["Application reference no.", input.referenceNo ?? (input.preview ? "Assigned on submission" : "-")],
    ["Post applied for", input.position],
    ["Submitted", input.submittedAt ? istDateTime(input.submittedAt) : "Not yet submitted"],
    ["Revision", input.revisionNo ? String(input.revisionNo) : "-"],
  ];
  w.pairs(meta, 4);
  w.rule();

  // Sections
  for (const s of def.sections) {
    if (s.kind === "uploads") {
      w.heading(s.title);
      const docs = input.attachments.filter(
        (d) => d.documentType !== "PHOTOGRAPH" && d.documentType !== "SIGNATURE",
      );
      if (!docs.length) w.text("No supporting documents attached.", M.x, 9.5, { color: MUTED });
      docs.forEach((d, i) =>
        w.text(`${i + 1}. ${DOCUMENT_TYPE_LABELS[d.documentType]}: ${d.originalName}`, M.x, 9.5),
      );
      continue;
    }
    if (s.id === "declaration") continue;
    const visible = s.fields.filter((f) => fieldVisible(f, a));
    if (!visible.length) continue;
    w.heading(s.title);
    let pending: [string, string][] = [];
    const flush = () => {
      if (pending.length) w.pairs(pending);
      pending = [];
    };
    for (const f of visible) {
      if (f.kind === "table") {
        flush();
        const rows = Array.isArray(a[f.key]) ? (a[f.key] as TableRow[]) : [];
        w.ensure(30);
        w.y -= 2;
        w.text(
          `${f.label}${f.countLabel ? ` (${f.countLabel.toLowerCase()}: ${rows.length})` : ""}`,
          M.x,
          9.5,
          { bold: true },
        );
        if (!rows.length) {
          w.text("None", M.x, 9.5, { color: MUTED });
          w.y -= 4;
          continue;
        }
        rows.forEach((r, i) => {
          w.ensure(26);
          w.text(`${f.itemLabel ?? "Entry"} ${i + 1}`, M.x, 8, { bold: true, color: BRAND });
          const items: [string, string][] = f.columns
            .filter((c) => conditionMet(c.when, r))
            .map((c) => [
              c.label,
              c.kind === "derived"
                ? rowDuration(r, String(a.declarationDate ?? new Date().toISOString().slice(0, 10)))
                : fmt(c, r[c.key]),
            ]);
          if (f.attachment && r.documentName) items.push(["Attached document", String(r.documentName)]);
          w.pairs(items, 3);
          if (i < rows.length - 1) w.rule();
        });
        w.y -= 6;
        continue;
      }
      if (f.kind === "list") {
        flush();
        const items = Array.isArray(a[f.key]) ? (a[f.key] as string[]) : [];
        w.text(f.label, M.x, 9.5, { bold: true });
        if (!items.length) w.text("None", M.x, 9.5, { color: MUTED });
        items.forEach((it, i) => w.text(`${i + 1}. ${it}`, M.x + 8, 9.5));
        w.y -= 6;
        continue;
      }
      pending.push([f.label, fmt(f, a[f.key])]);
    }
    flush();
  }

  // Declaration and signatures
  w.heading("Declaration");
  const decl =
    def.preservedText.find((p) => p.id === "declaration")?.text ??
    "I hereby declare that the information furnished herein above is correct and true to the best of my knowledge.";
  w.text(decl, M.x, 9.5);
  w.y -= 8;
  const signature = await embed(doc, input.signature);
  w.ensure(80);
  const sy = w.y;
  w.pairs([
    ["Place", String(a.place ?? a.station ?? "")],
    ["Date", fmt({ kind: "date" } as ScalarField, a.declarationDate)],
  ]);
  if (signature) {
    const s = fit(signature, 140, 46);
    w.page.drawImage(signature, { x: A4.w - M.x - s.width, y: sy - 50, ...s });
  }
  w.page.drawText("Signature of the Applicant", {
    x: A4.w - M.x - 120,
    y: sy - 64,
    size: 8.5,
    font: w.bold,
    color: INK,
  });
  w.y = Math.min(w.y, sy - 74);
  if (input.printEndorsement) {
    w.y -= 10;
    w.ensure(110);
    w.text("(Endorsement of the present employer)", M.x, 9, { bold: true });
    w.text("FORWARDED", M.x, 9);
    w.y -= 30;
    w.page.drawText("Place :", { x: M.x, y: w.y, size: 9, font: w.font });
    w.page.drawText("Signature of the present employer", {
      x: A4.w - M.x - 160,
      y: w.y,
      size: 9,
      font: w.font,
    });
    w.y -= 14;
    w.page.drawText("Date :", { x: M.x, y: w.y, size: 9, font: w.font });
    w.page.drawText("(Seal)", { x: A4.w - M.x - 160, y: w.y, size: 9, font: w.font });
    w.y -= 14;
  }
  const note = def.preservedText.find((p) => p.id === "note")?.text;
  if (note) {
    w.y -= 8;
    w.text(`Note: ${note}`, M.x, 7.5, { color: MUTED });
  }

  // Footer and watermark on every page
  const total = w.pages.length;
  w.pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.x, y: 38 }, end: { x: A4.w - M.x, y: 38 }, thickness: 0.5, color: LINE });
    p.drawText(
      pdfSafe(
        `PSG College of Technology - Faculty application${input.referenceNo ? ` - ${input.referenceNo}` : ""}`,
      ),
      {
        x: M.x,
        y: 26,
        size: 7.5,
        font: w.font,
        color: MUTED,
      },
    );
    const label = `Page ${i + 1} of ${total}`;
    p.drawText(label, {
      x: A4.w - M.x - w.font.widthOfTextAtSize(label, 7.5),
      y: 26,
      size: 7.5,
      font: w.font,
      color: MUTED,
    });
    if (input.preview)
      p.drawText("PREVIEW - NOT SUBMITTED", {
        x: 120,
        y: 260,
        size: 46,
        font: w.bold,
        color: rgb(0.85, 0.2, 0.3),
        opacity: 0.12,
        rotate: degrees(40),
      });
  });
  return doc.save();
}
