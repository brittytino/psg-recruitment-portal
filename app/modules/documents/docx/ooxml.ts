/**
 * Minimal, dependency-light OOXML manipulation helpers used to populate the official
 * DOCX templates in place. The templates are never restructured beyond:
 *  - appending runs after existing labels,
 *  - filling empty table cells,
 *  - cloning existing rows/paragraphs for continuation entries,
 *  - placing the photograph inside the existing photograph text box.
 */
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture";

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml");
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

export function children(el: Node, localName: string): Element[] {
  const out: Element[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling)
    if ((c as Element).localName === localName) out.push(c as Element);
  return out;
}

export function descendants(el: Element | Document, localName: string): Element[] {
  const list = el.getElementsByTagNameNS(W_NS, localName);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i]!);
  return out;
}

function isInsideTextBox(n: Node): boolean {
  for (let p = n.parentNode; p; p = p.parentNode) {
    const ln = (p as Element).localName;
    if (ln === "txbxContent" || ln === "Fallback") return true;
  }
  return false;
}

/** Visible text of a paragraph, excluding text-box contents anchored in it. */
export function paragraphText(p: Element): string {
  let s = "";
  for (const t of descendants(p, "t")) if (!isInsideTextBox(t)) s += t.textContent ?? "";
  return s;
}

export const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function body(doc: Document): Element {
  const b = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!b) throw new Error("document.xml has no body");
  return b;
}

export function topParagraphs(doc: Document): Element[] {
  return children(body(doc), "p");
}

export function topTables(doc: Document): Element[] {
  return children(body(doc), "tbl");
}

/** Finds the first top-level paragraph whose normalised text starts with `prefix`. */
export function findParagraph(doc: Document, prefix: string, from?: Element): Element {
  const ps = topParagraphs(doc);
  const start = from ? ps.indexOf(from) + 1 : 0;
  const want = norm(prefix);
  for (let i = start; i < ps.length; i++) if (norm(paragraphText(ps[i]!)).startsWith(want)) return ps[i]!;
  throw new Error(`Template paragraph not found: "${prefix}"`);
}

export function nextParagraphs(p: Element, count: number): Element[] {
  const out: Element[] = [];
  for (let n = p.nextSibling; n && out.length < count; n = n.nextSibling) {
    const el = n as Element;
    if (el.localName === "p") out.push(el);
    else if (el.localName === "tbl") break;
  }
  return out;
}

function firstRunProps(scope: Element): Element | null {
  for (const r of descendants(scope, "r")) {
    if (isInsideTextBox(r)) continue;
    const rPr = children(r, "rPr")[0];
    if (rPr) return rPr;
  }
  const pPr = descendants(scope, "pPr")[0];
  const rPr = pPr ? children(pPr, "rPr")[0] : undefined;
  return rPr ?? null;
}

/** Builds a run carrying `text`; newlines become line breaks. Run props cloned from `styleFrom`. */
export function makeRun(doc: Document, text: string, styleFrom: Element | null): Element {
  const r = doc.createElementNS(W_NS, "w:r");
  if (styleFrom) {
    const rPr = styleFrom.cloneNode(true) as Element;
    // Labels in the template are sometimes bold/underlined; filled values are plain.
    for (const tag of ["b", "bCs", "u", "caps"]) for (const e of children(rPr, tag)) rPr.removeChild(e);
    r.appendChild(rPr);
  }
  text.split(/\r?\n/).forEach((line, i) => {
    if (i > 0) r.appendChild(doc.createElementNS(W_NS, "w:br"));
    const parts = line.split("\t");
    parts.forEach((part, j) => {
      if (j > 0) r.appendChild(doc.createElementNS(W_NS, "w:tab"));
      if (part === "") return;
      const t = doc.createElementNS(W_NS, "w:t");
      t.setAttribute("xml:space", "preserve");
      t.appendChild(doc.createTextNode(part));
      r.appendChild(t);
    });
  });
  return r;
}

/**
 * Inserts `value` immediately after the Nth occurrence (1-based) of `marker` in the paragraph's
 * visible text, splitting the containing run if needed. Without a marker match, appends at the end.
 */
export function insertAfterMarker(p: Element, marker: string, occurrence: number, value: string): void {
  if (!value) return;
  const before = segmentStarts(tokens(p), customTabStops(p));
  insertAfterMarkerRaw(p, marker, occurrence, value);
  realignTabs(p, before);
}

function insertAfterMarkerRaw(p: Element, marker: string, occurrence: number, value: string): void {
  const doc = p.ownerDocument!;
  let seen = 0;
  for (const r of children(p, "r")) {
    for (const t of children(r, "t")) {
      const s = t.textContent ?? "";
      let idx = -1;
      while ((idx = s.indexOf(marker, idx + 1)) !== -1) {
        seen++;
        if (seen !== occurrence) continue;
        const cut = idx + marker.length;
        const rPr = children(r, "rPr")[0] ?? null;
        const before = s.slice(0, cut);
        const after = s.slice(cut);
        t.textContent = before;
        t.setAttribute("xml:space", "preserve");
        const valueRun = makeRun(doc, " " + value, rPr);
        // Move every node after `t` inside this run into a tail run to keep order.
        const tail = r.cloneNode(false) as Element;
        if (rPr) tail.appendChild(rPr.cloneNode(true));
        if (after) {
          const t2 = t.cloneNode(false) as Element;
          t2.appendChild(doc.createTextNode(after));
          tail.appendChild(t2);
        }
        let n = t.nextSibling;
        while (n) {
          const nx = n.nextSibling;
          tail.appendChild(n);
          n = nx;
        }
        const ref = r.nextSibling;
        p.insertBefore(valueRun, ref);
        if (tail.childNodes.length > (rPr ? 1 : 0)) p.insertBefore(tail, ref);
        return;
      }
    }
  }
  appendToParagraph(p, (marker && seen < occurrence ? "" : " ") + value);
}

// ---------------------------------------------------------------------------------------------
// Tab-stop layout simulation
// ---------------------------------------------------------------------------------------------

/** Layout defaults of the template being populated (set per document before binding). */
export const layout = { defaultSzHalfPts: 22, defaultTabTwips: 720 };

/** Arial / Liberation Sans advance widths (1/1000 em) for ASCII; other glyphs use 556. */
const ARIAL: Record<string, number> = Object.fromEntries(
  [
    [" !\"#$%&'()*+,-./", [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]],
    [
      "0123456789:;<=>?@",
      [556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015],
    ],
    [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      [
        667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
        722, 667, 944, 667, 667, 611,
      ],
    ],
    [
      "abcdefghijklmnopqrstuvwxyz",
      [
        556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
        556, 500, 722, 500, 500, 500,
      ],
    ],
    ["[\\]^_`{|}~", [278, 278, 278, 469, 556, 333, 334, 260, 334, 584]],
  ].flatMap(([chars, widths]) => [...(chars as string)].map((c, i) => [c, (widths as number[])[i]!])),
);

function runSzHalfPts(r: Element): number {
  const rPr = children(r, "rPr")[0];
  const sz = rPr ? children(rPr, "sz")[0] : undefined;
  return sz ? Number(sz.getAttribute("w:val")) : layout.defaultSzHalfPts;
}

/** Width of a string in twips at the given size (half-points); bold adds ~5%. */
function textWidthTwips(s: string, szHalfPts: number, bold = false): number {
  let units = 0;
  for (const ch of s) units += ARIAL[ch] ?? 556;
  return (units / 1000) * szHalfPts * 10 * (bold ? 1.05 : 1);
}

function customTabStops(p: Element): number[] {
  const pPr = children(p, "pPr")[0];
  const tabs = pPr ? children(pPr, "tabs")[0] : undefined;
  if (!tabs) return [];
  return children(tabs, "tab")
    .filter((t) => t.getAttribute("w:val") !== "clear")
    .map((t) => Number(t.getAttribute("w:pos")))
    .sort((a, b) => a - b);
}

function nextStop(x: number, custom: number[]): number {
  const c = custom.find((s) => s > x + 1);
  if (c !== undefined) return c;
  return (Math.floor(x / layout.defaultTabTwips) + 1) * layout.defaultTabTwips;
}

type Token = { kind: "text"; width: number } | { kind: "tab"; el: Element };

/** Tokenises the paragraph's runs into text widths and tab elements, in order. */
function tokens(p: Element): Token[] {
  const out: Token[] = [];
  for (const r of children(p, "r")) {
    const sz = runSzHalfPts(r);
    const rPr = children(r, "rPr")[0];
    const bold = !!rPr && children(rPr, "b").length > 0;
    for (let c = r.firstChild; c; c = c.nextSibling) {
      const el = c as Element;
      if (el.localName === "t")
        out.push({ kind: "text", width: textWidthTwips(el.textContent ?? "", sz, bold) });
      else if (el.localName === "tab") out.push({ kind: "tab", el });
    }
  }
  return out;
}

/** Simulated x positions (twips) at which each tab-aligned text segment starts. */
function segmentStarts(toks: Token[], custom: number[]): number[] {
  let x = 0;
  const starts: number[] = [];
  let afterTab = false;
  for (const t of toks) {
    if (t.kind === "tab") {
      x = nextStop(x, custom);
      afterTab = true;
    } else {
      if (afterTab && t.width > 0) starts.push(x);
      afterTab = false;
      x += t.width;
    }
  }
  return starts;
}

/**
 * After a value is inserted into a paragraph, removes tabs so that the labels that followed it
 * (e.g. "Age :", "Gender :", "State :") start at their original simulated positions instead of
 * being pushed one or more tab stops to the right (which makes the line wrap). Labels are never
 * moved left of the value: when the value is wider than the original gap, one tab is kept.
 */
function realignTabs(p: Element, before: number[]) {
  const custom = customTabStops(p);
  for (let guard = 0; guard < 20; guard++) {
    const toks = tokens(p);
    const after = segmentStarts(toks, custom);
    // Find the first segment that moved right compared with the original layout.
    const i = after.findIndex((x, k) => before[k] !== undefined && x > before[k]! + 1);
    if (i < 0) return;
    // Locate the run of tabs immediately before that segment.
    let seg = -1;
    let tabsBefore: Element[] = [];
    let pending: Element[] = [];
    for (const t of toks) {
      if (t.kind === "tab") pending.push(t.el);
      else if (t.width > 0) {
        if (pending.length) {
          seg++;
          if (seg === i) {
            tabsBefore = pending;
            break;
          }
        }
        pending = [];
      }
    }
    if (tabsBefore.length <= 1) return;
    tabsBefore[0]!.parentNode!.removeChild(tabsBefore[0]!);
    const check = segmentStarts(tokens(p), custom)[i];
    if (check !== undefined && check < before[i]! - 1) {
      // Removing went too far (value overlaps the original gap) — restore by re-adding a tab.
      const doc = p.ownerDocument!;
      const tab = doc.createElementNS(W_NS, "w:tab");
      tabsBefore[1]!.parentNode!.insertBefore(tab, tabsBefore[1]!);
      return;
    }
  }
}

export function appendToParagraph(p: Element, value: string): void {
  if (!value) return;
  p.appendChild(makeRun(p.ownerDocument!, value, firstRunProps(p)));
}

/** Clones `template` (a paragraph) with all its runs removed and inserts it after `after`. */
export function insertEmptyParagraphAfter(after: Element, template: Element): Element {
  const p = template.cloneNode(true) as Element;
  for (const c of [
    ...children(p, "r"),
    ...children(p, "proofErr"),
    ...children(p, "bookmarkStart"),
    ...children(p, "bookmarkEnd"),
  ])
    p.removeChild(c);
  after.parentNode!.insertBefore(p, after.nextSibling);
  return p;
}

export function rows(tbl: Element): Element[] {
  return children(tbl, "tr");
}

export function cells(tr: Element): Element[] {
  return children(tr, "tc");
}

export function cell(tbl: Element, r: number, c: number): Element {
  const tr = rows(tbl)[r];
  const tc = tr ? cells(tr)[c] : undefined;
  if (!tc) throw new Error(`Template cell R${r}C${c} not found`);
  return tc;
}

export function cellText(tc: Element): string {
  return descendants(tc, "p").map(paragraphText).join("\n");
}

/** Writes `value` into a cell: into the first empty paragraph, or as a new paragraph after the label. */
export function setCell(tc: Element, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === "") return;
  const v = String(value);
  const ps = children(tc, "p");
  const empty = ps.find((p) => norm(paragraphText(p)) === "");
  const doc = tc.ownerDocument!;
  if (empty) {
    const own = firstRunProps(empty);
    const style = own && children(own, "rFonts").length ? own : (tableFont(tc) ?? own);
    empty.appendChild(makeRun(doc, v, style));
    return;
  }
  const last = ps[ps.length - 1];
  if (!last) {
    const p = doc.createElementNS(W_NS, "w:p");
    p.appendChild(makeRun(doc, v, null));
    tc.appendChild(p);
    return;
  }
  const np = insertEmptyParagraphAfter(last, last);
  np.appendChild(makeRun(doc, v, firstRunProps(last)));
}

/**
 * Run properties for values written into empty cells: the cell's own formatting, else the
 * nearest labelled cell in the same row, else the table's first label. This keeps values in the
 * table's font (e.g. Arial) instead of the document default (Times New Roman).
 */
function tableFont(tc: Element): Element | null {
  const tr = tc.parentNode as Element | null;
  const tbl = tr?.parentNode as Element | null;
  for (const scope of [tc, tr, tbl]) {
    if (!scope) continue;
    const withFont = descendants(scope, "rPr").find(
      (rPr) => children(rPr, "rFonts").length > 0 && !isInsideTextBox(rPr),
    );
    if (withFont) return withoutEmphasis(withFont);
  }
  const own = firstRunProps(tc);
  return own ? withoutEmphasis(own) : null;
}

function withoutEmphasis(rPr: Element): Element {
  const c = rPr.cloneNode(true) as Element;
  for (const tag of ["b", "bCs", "u", "caps", "i", "iCs"]) for (const e of children(c, tag)) c.removeChild(e);
  return c;
}

/** Appends a value after existing label text inside a cell (e.g. "E –MAIL ID"). */
export function appendInCell(tc: Element, value: string | null | undefined, separator = " : "): void {
  if (!value) return;
  const ps = children(tc, "p").filter((p) => norm(paragraphText(p)) !== "");
  const p = ps[ps.length - 1];
  if (!p) return setCell(tc, value);
  p.appendChild(makeRun(tc.ownerDocument!, separator + value, firstRunProps(p)));
}

/**
 * Ensures there are `needed` rows, starting from the template's data rows. When more rows are
 * required, the last template row (or group of rows, for transposed tables) is cloned with its
 * text removed, except for the first `keepCells` cells which hold row labels such as "TITLE".
 * Element references are used so several sections of one table can be expanded safely.
 */
export function ensureRows(templateRows: Element[], needed: number, keepCells = 0): Element[] {
  const data = [...templateRows];
  const last = data[data.length - 1];
  if (!last) throw new Error("Table has no template data rows");
  let anchor = last;
  for (let i = templateRows.length; i < needed; i++) {
    const clone = last.cloneNode(true) as Element;
    clearRow(clone, keepCells);
    last.parentNode!.insertBefore(clone, anchor.nextSibling);
    data.push(clone);
    anchor = clone;
  }
  return data;
}

/** Clones a group of rows (e.g. TITLE/YEAR pairs) `extra` times after the group, keeping label cells. */
export function cloneRowGroup(group: Element[], extra: number, keepCells: number): Element[][] {
  const out: Element[][] = [group];
  let anchor = group[group.length - 1]!;
  for (let k = 0; k < extra; k++) {
    const g: Element[] = [];
    for (const tr of group) {
      const clone = tr.cloneNode(true) as Element;
      clearRow(clone, keepCells);
      anchor.parentNode!.insertBefore(clone, anchor.nextSibling);
      anchor = clone;
      g.push(clone);
    }
    out.push(g);
  }
  return out;
}

function clearRow(tr: Element, keepCells: number) {
  cells(tr).forEach((tc, i) => {
    if (i < keepCells) return;
    for (const p of descendants(tc, "p")) for (const r of children(p, "r")) p.removeChild(r);
  });
}

/**
 * Fills a row of fixed-width "block letter" boxes: one character per cell when the value fits,
 * otherwise merges the boxes into one cell so the full value is preserved (never truncated).
 */
export function fillLetterBoxes(tr: Element, firstBox: number, value: string): "boxes" | "merged" {
  const tcs = cells(tr).slice(firstBox);
  const chars = [...value];
  if (chars.length <= tcs.length) {
    chars.forEach((ch, i) => setCell(tcs[i]!, ch === " " ? "" : ch));
    return "boxes";
  }
  const first = tcs[0]!;
  let span = 0;
  let width = 0;
  for (const tc of tcs) {
    const pr = children(tc, "tcPr")[0];
    const gs = pr ? children(pr, "gridSpan")[0] : undefined;
    span += gs ? Number(gs.getAttribute("w:val")) : 1;
    const w = pr ? children(pr, "tcW")[0] : undefined;
    width += w ? Number(w.getAttribute("w:w")) : 0;
  }
  for (const tc of tcs.slice(1)) tr.removeChild(tc);
  const doc = tr.ownerDocument!;
  let pr = children(first, "tcPr")[0];
  if (!pr) {
    pr = doc.createElementNS(W_NS, "w:tcPr");
    first.insertBefore(pr, first.firstChild);
  }
  const w = children(pr, "tcW")[0];
  if (w) w.setAttribute("w:w", String(width));
  for (const g of children(pr, "gridSpan")) pr.removeChild(g);
  const gs = doc.createElementNS(W_NS, "w:gridSpan");
  gs.setAttribute("w:val", String(span));
  pr.insertBefore(gs, w ? w.nextSibling : pr.firstChild);
  setCell(first, value);
  return "merged";
}

// ---------------------------------------------------------------------------------------------
// Photograph placement
// ---------------------------------------------------------------------------------------------

export interface ImageInfo {
  data: Uint8Array;
  ext: "png" | "jpeg";
  widthPx: number;
  heightPx: number;
}

/** Reads pixel dimensions from PNG or JPEG bytes. */
export function imageInfo(data: Uint8Array): ImageInfo {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return { data, ext: "png", widthPx: dv.getUint32(16), heightPx: dv.getUint32(20) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    let o = 2;
    while (o + 9 < data.length) {
      if (data[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = data[o + 1]!;
      const len = dv.getUint16(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { data, ext: "jpeg", heightPx: dv.getUint16(o + 5), widthPx: dv.getUint16(o + 7) };
      o += 2 + len;
    }
  }
  throw new Error("Photograph must be a PNG or JPEG image");
}

/** Builds an inline DrawingML picture element sized to fit within (maxCx × maxCy) EMU. */
function inlinePicture(
  doc: Document,
  relId: string,
  img: ImageInfo,
  maxCx: number,
  maxCy: number,
  docPrId: number,
): Element {
  const ratio = Math.min(maxCx / img.widthPx, maxCy / img.heightPx);
  const cx = Math.round(img.widthPx * ratio);
  const cy = Math.round(img.heightPx * ratio);
  const xml = `<w:drawing xmlns:w="${W_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:r="${R_NS}"><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="Applicant photograph"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="photo.${img.ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  return parseXml(xml).documentElement! as unknown as Element;
}

/**
 * Replaces the text of every text box whose text equals `boxText` (DrawingML choice and VML
 * fallback) with the photograph. Returns the number of text boxes updated.
 */
export function placePhotoInTextBox(
  doc: Document,
  boxText: string,
  relId: string,
  img: ImageInfo,
  boxCx: number,
  boxCy: number,
): number {
  let n = 0;
  const boxes = descendants(doc, "txbxContent");
  for (const tb of boxes) {
    const text = norm(
      descendants(tb, "t")
        .map((t) => t.textContent ?? "")
        .join(""),
    );
    if (text !== norm(boxText)) continue;
    const ps = children(tb, "p");
    const p = ps[0]!;
    for (const extra of ps.slice(1)) tb.removeChild(extra);
    for (const r of children(p, "r")) p.removeChild(r);
    const run = doc.createElementNS(W_NS, "w:r");
    // Leave room for the default text-box insets (0.1" left/right, 0.05" top/bottom).
    const pic = inlinePicture(doc, relId, img, boxCx - 2 * 91440, boxCy - 2 * 45720 - 45720, 9000 + n);
    run.appendChild(doc.importNode(pic, true));
    p.appendChild(run);
    n++;
  }
  return n;
}

/** Reads the extent (EMU) of the anchored drawing that contains the text box with `boxText`. */
export function textBoxExtent(doc: Document, boxText: string): { cx: number; cy: number } {
  const anchors = doc.getElementsByTagNameNS(WP_NS, "anchor");
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    const text = norm(
      descendants(a, "t")
        .map((t) => t.textContent ?? "")
        .join(""),
    );
    if (text !== norm(boxText)) continue;
    const ext = a.getElementsByTagNameNS(WP_NS, "extent")[0];
    if (ext) return { cx: Number(ext.getAttribute("cx")), cy: Number(ext.getAttribute("cy")) };
  }
  // Legacy VML text boxes (v:rect / v:shape with style="width:93.95pt;height:87.7pt").
  for (const tb of descendants(doc, "txbxContent")) {
    const text = norm(
      descendants(tb, "t")
        .map((t) => t.textContent ?? "")
        .join(""),
    );
    if (text !== norm(boxText)) continue;
    const shape = tb.parentNode?.parentNode as Element | null;
    const style = shape?.getAttribute?.("style") ?? "";
    const dim = (k: string) => {
      const m = new RegExp(`(?:^|;)${k}:([\\d.]+)(pt|in)`).exec(style);
      if (!m) return null;
      return Math.round(Number(m[1]) * (m[2] === "in" ? 914400 : 12700));
    };
    const cx = dim("width");
    const cy = dim("height");
    if (cx && cy) return { cx, cy };
  }
  throw new Error(`Text box "${boxText}" not found`);
}

export { R_NS };

/** Finds the top-level table whose first non-empty cell text starts with `heading`. */
export function findTable(doc: Document, heading: string): Element {
  const want = norm(heading);
  for (const t of topTables(doc)) {
    const first = rows(t)[0];
    if (first && norm(cells(first).map(cellText).join(" ")).startsWith(want)) return t;
  }
  throw new Error(`Template table not found: "${heading}"`);
}

/** Finds the row of `tbl` whose first cell text starts with `label`. */
export function findRow(tbl: Element, label: string, from?: Element): Element {
  const rs = rows(tbl);
  const start = from ? rs.indexOf(from) + 1 : 0;
  const want = norm(label);
  for (let i = start; i < rs.length; i++) {
    const c = cells(rs[i]!)[0];
    if (c && norm(cellText(c)).startsWith(want)) return rs[i]!;
  }
  throw new Error(`Template row not found: "${label}"`);
}

/** The `count` rows following `tr` in its table. */
export function rowsAfter(tr: Element, count: number): Element[] {
  const out: Element[] = [];
  for (let n = tr.nextSibling; n && out.length < count; n = n.nextSibling)
    if ((n as Element).localName === "tr") out.push(n as Element);
  return out;
}

/** Replaces a run of underscores ("____") in the paragraph with the value (fill-in-the-blank). */
export function replaceBlank(p: Element, value: string): boolean {
  if (!value) return false;
  // The blank may be split across runs ("_" + "_____"); every underscore of it is replaced.
  const ts = descendants(p, "t").filter((t) => !isInsideTextBox(t) && /_/.test(t.textContent ?? ""));
  const first = ts.find((t) => /_{3,}/.test(t.textContent ?? "")) ?? ts[0];
  if (!first) {
    appendToParagraph(p, " " + value);
    return false;
  }
  for (const t of ts) {
    const s = t.textContent ?? "";
    t.textContent = t === first ? s.replace(/_+/, " " + value + " ").replace(/_/g, "") : s.replace(/_/g, "");
    t.setAttribute("xml:space", "preserve");
  }
  return true;
}

/**
 * Writes entries into the empty top-level paragraphs between `start` (exclusive) and the next
 * paragraph/table that contains content. Long entries consume extra blank lines (estimated at
 * `charsPerLine`) so the printed page boundaries move as little as possible. When entries need
 * more space than the template provides, extra paragraphs are inserted (continuation) — no entry
 * is ever dropped. Returns the number of inserted continuation paragraphs.
 */
export function fillBlankLines(start: Element, entries: string[], charsPerLine: number, prefix = ""): number {
  const blanks: Element[] = [];
  for (let n = start.nextSibling; n; n = n.nextSibling) {
    const el = n as Element;
    if (el.localName === "tbl") break;
    if (el.localName !== "p") continue;
    if (norm(paragraphText(el)) !== "") break;
    if (descendants(el, "br").some((b) => b.getAttribute("w:type") === "page")) break;
    blanks.push(el);
  }
  const doc = start.ownerDocument!;
  const styleP = blanks[0] ?? start;
  let used = 0;
  let inserted = 0;
  let last: Element = start;
  entries.forEach((e, i) => {
    const text = `${prefix}${i + 1}. ${e}`;
    let p = blanks[used];
    if (!p) {
      p = insertEmptyParagraphAfter(last, styleP);
      inserted++;
    } else used++;
    p.appendChild(makeRun(doc, text, firstRunPropsPublic(p) ?? firstRunPropsPublic(start)));
    last = p;
    // Remove blank lines that the wrapped entry now occupies.
    const extraLines = Math.ceil(text.length / charsPerLine) - 1 + (text.match(/\n/g)?.length ?? 0);
    for (let k = 0; k < extraLines && used < blanks.length; k++) {
      const b = blanks[used]!;
      // Keep the final blank line so a trailing spacer remains before the next heading.
      if (used === blanks.length - 1) break;
      b.parentNode!.removeChild(b);
      blanks.splice(used, 1);
    }
  });
  return inserted;
}

export function firstRunPropsPublic(scope: Element): Element | null {
  for (const r of descendants(scope, "r")) {
    const rPr = children(r, "rPr")[0];
    if (rPr) return rPr;
  }
  const pPr = descendants(scope, "pPr")[0];
  return (pPr ? children(pPr, "rPr")[0] : undefined) ?? null;
}

/** Sets a single left tab stop (twips) on a paragraph. */
export function setTabStop(p: Element, posTwips: number): void {
  const doc = p.ownerDocument!;
  let pPr = children(p, "pPr")[0];
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, "w:pPr");
    p.insertBefore(pPr, p.firstChild);
  }
  for (const t of children(pPr, "tabs")) pPr.removeChild(t);
  const tabs = doc.createElementNS(W_NS, "w:tabs");
  const tab = doc.createElementNS(W_NS, "w:tab");
  tab.setAttribute("w:val", "left");
  tab.setAttribute("w:pos", String(posTwips));
  tabs.appendChild(tab);
  const after = children(pPr, "pStyle")[0] ?? children(pPr, "keepNext")[0];
  pPr.insertBefore(tabs, after ? after.nextSibling : pPr.firstChild);
}
