/**
 * Populates the official DOCX templates with a submitted application revision.
 *
 * Each form has an explicit binding function. Every field key that is written is recorded in
 * `report.boundKeys`; the PDF regression suite asserts that every field of the form definition is
 * bound, so a field can never be silently omitted from the generated application.
 */
import JSZip from "jszip";
import type { Document, Element } from "@xmldom/xmldom";
import type { Answers, FormCode, ScalarValue, TableRow } from "~/modules/forms/types";
import {
  appendInCell,
  appendToParagraph,
  cells,
  cloneRowGroup,
  ensureRows,
  fillBlankLines,
  fillLetterBoxes,
  findParagraph,
  findRow,
  findTable,
  imageInfo,
  insertAfterMarker,
  insertEmptyParagraphAfter,
  paragraphText,
  W_NS,
  layout,
  makeRun,
  firstRunPropsPublic,
  parseXml,
  placePhotoInTextBox,
  replaceBlank,
  rows,
  rowsAfter,
  serializeXml,
  setCell,
  setTabStop,
  textBoxExtent,
} from "./ooxml";

export interface RenderInput {
  formCode: FormCode;
  template: Uint8Array;
  /** Answers including derived values (department, age). */
  answers: Answers;
  photo?: Uint8Array | null;
}

export interface RenderReport {
  boundKeys: string[];
  /** Human-readable notes about continuation rows/paragraphs or merged boxes. */
  deviations: string[];
  photoPlaced: boolean;
}

const PHOTO_BOX = "AFFIX RECENT PASSPORT SIZE PHOTOGRAPH";

// ------------------------------------------------------------------------------------------------
// Value formatting
// ------------------------------------------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(v: ScalarValue | undefined): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return v == null ? "" : String(v);
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
}

export function fmtMonthYear(v: ScalarValue | undefined): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}$/.test(v)) return v == null ? "" : String(v);
  const [y, m] = v.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rowsOf = (a: Answers, k: string): TableRow[] => (Array.isArray(a[k]) ? (a[k] as TableRow[]) : []);
const listOf = (a: Answers, k: string): string[] =>
  Array.isArray(a[k]) ? (a[k] as string[]).filter((x) => typeof x === "string") : [];

/** Wraps text to lines of at most `width` characters (word boundaries). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= width) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
}

class Binder {
  readonly bound = new Set<string>();
  readonly deviations: string[] = [];
  constructor(
    readonly doc: Document,
    readonly a: Answers,
  ) {}
  v(key: string): string {
    this.bound.add(key);
    return s(this.a[key]);
  }
  rows(key: string): TableRow[] {
    this.bound.add(key);
    return rowsOf(this.a, key);
  }
  list(key: string): string[] {
    this.bound.add(key);
    return listOf(this.a, key);
  }
  mark(...keys: string[]) {
    keys.forEach((k) => this.bound.add(k));
  }
  /** Fills a regular data table, cloning the last row when entries exceed template rows. */
  table(
    templateRows: Element[],
    entries: TableRow[],
    cols: ((r: TableRow, i: number) => string)[],
    name: string,
  ) {
    const target = ensureRows(templateRows, Math.max(entries.length, templateRows.length));
    if (entries.length > templateRows.length)
      this.deviations.push(
        `${name}: ${entries.length - templateRows.length} row(s) added beyond the ${templateRows.length} printed rows`,
      );
    entries.forEach((r, i) => {
      const tcs = cells(target[i]!);
      cols.forEach((fn, c) => setCell(tcs[c]!, fn(r, i)));
    });
  }
  /** Fills transposed blocks (label rows with N entry columns), cloning the block for overflow. */
  transposed(group: Element[], entries: TableRow[], fields: string[], name: string) {
    const perBlock = cells(group[0]!).length - 1;
    const blocksNeeded = Math.max(1, Math.ceil(entries.length / perBlock));
    const blocks = cloneRowGroup(group, blocksNeeded - 1, 1);
    if (blocksNeeded > 1) this.deviations.push(`${name}: ${blocksNeeded - 1} continuation block(s) added`);
    entries.forEach((e, i) => {
      const block = blocks[Math.floor(i / perBlock)]!;
      const col = 1 + (i % perBlock);
      fields.forEach((f, r) => setCell(cells(block[r]!)[col]!, s(e[f])));
    });
  }
}

const hasPageBreak = (p: Element) =>
  Array.from(p.getElementsByTagNameNS(W_NS, "br") as unknown as ArrayLike<Element>).some(
    (br) => br.getAttribute("w:type") === "page",
  );

/** Consecutive empty top-level paragraphs after `p` (the template's writing space). */
function blankLinesAfter(p: Element): Element[] {
  const out: Element[] = [];
  for (let n = p.nextSibling; n; n = n.nextSibling) {
    const el = n as Element;
    if (el.localName === "tbl") break;
    if (el.localName !== "p") continue;
    if (
      paragraphText(el).trim() !== "" ||
      el.getElementsByTagNameNS(W_NS, "drawing").length ||
      hasPageBreak(el)
    )
      break;
    out.push(el);
  }
  return out;
}

/**
 * Writes lines aligned to a tab stop. Lines go first into `slots` (existing label paragraphs whose
 * value column is free), then into the blank writing lines that follow, keeping one blank line as a
 * spacer; only when those run out are new paragraphs inserted. This keeps pagination close to the
 * original form. Returns the number of inserted paragraphs.
 */
function writeLines(
  b: Binder,
  after: Element,
  lines: string[],
  tabTwips: number,
  slots: Element[] = [],
  prefix = "\t",
): number {
  const style = firstRunPropsPublic(after);
  const anchor = slots[slots.length - 1] ?? after;
  const blanks = blankLinesAfter(anchor);
  const usable = [...slots, ...blanks.slice(0, Math.max(0, blanks.length - 1))];
  let last = usable[usable.length - 1] ?? anchor;
  let inserted = 0;
  lines.forEach((line, i) => {
    let p = usable[i];
    if (!p) {
      p = insertEmptyParagraphAfter(last, after);
      last = p;
      inserted++;
    }
    setTabStop(p, tabTwips);
    p.appendChild(makeRun(b.doc, prefix + line, style));
  });
  return inserted;
}

/** Writes multi-line text: first line after the label's colon, the rest aligned below it. */
function afterColonMultiline(
  b: Binder,
  p: Element,
  occurrence: number,
  text: string,
  tabTwips: number,
  slots: Element[] = [],
): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return 0;
  insertAfterMarker(p, ":", occurrence, lines[0]!);
  return writeLines(b, p, lines.slice(1), tabTwips, slots);
}

// ------------------------------------------------------------------------------------------------
// ASSISTANT PROFESSOR v1
// ------------------------------------------------------------------------------------------------
function bindAssistant(b: Binder) {
  const d = b.doc;
  replaceBlank(findParagraph(d, "APPLICATION for the post of ASSISTANT PROFESSOR"), b.v("department"));

  const name = [b.v("salutation"), b.v("name").toUpperCase()].filter(Boolean).join(" ");
  insertAfterMarker(findParagraph(d, "1. NAME (In Block Letters)"), ":", 1, name);

  const addrP = findParagraph(d, "2. Address");
  const typeP = findParagraph(d, "(Permanent / Present)", addrP);
  appendToParagraph(typeP, b.v("addressType") ? `  — ${b.v("addressType")}` : "");
  // Address line 2 shares the "(Permanent / Present)" line; later lines use the blank lines below.
  afterColonMultiline(b, addrP, 1, b.v("address"), 4320, [typeP]);

  insertAfterMarker(findParagraph(d, "PHONE / MOBILE NO"), ":", 1, b.v("phone"));
  insertAfterMarker(findParagraph(d, "E-MAIL ID"), ":", 1, b.v("email"));

  const dobP = findParagraph(d, "3. Date of Birth");
  // Insert right-to-left so inserted values cannot shift later markers.
  insertAfterMarker(dobP, "M/F", 1, b.v("gender") ? ` ${b.v("gender")}` : "");
  insertAfterMarker(dobP, ":", 2, b.v("age"));
  insertAfterMarker(dobP, ":", 1, fmtDate(b.v("dateOfBirth")));

  const pobP = findParagraph(d, "4. Place of Birth");
  // "District :" and "State :" follow; Place of Birth has no colon in the source.
  insertAfterMarker(pobP, ":", 2, b.v("state"));
  insertAfterMarker(pobP, ":", 1, b.v("district"));
  insertAfterMarker(pobP, "Place of Birth", 1, b.v("placeOfBirth") ? ` : ${b.v("placeOfBirth")}` : "");

  insertAfterMarker(findParagraph(d, "5. Mother Tongue"), ":", 1, b.v("motherTongue"));
  const natP = findParagraph(d, "Nationality & Religion");
  insertAfterMarker(natP, ":", 2, b.v("community"));
  insertAfterMarker(natP, ":", 1, [b.v("nationality"), b.v("religion")].filter(Boolean).join(" & "));

  const acad = findTable(d, "Degree / Diploma");
  b.table(
    rows(acad).slice(1, 6),
    b.rows("academicQualifications"),
    [
      (r) => s(r.degree),
      (r) => s(r.university),
      (r) => s(r.institution),
      (r) => {
        const cls = s(r.class) || s(r.classOrMarks);
        const cgpa = s(r.cgpaOrMarks);
        const marks = [cls, cgpa].filter(Boolean).join(" / ");
        return [marks, r.attempts ? `(${r.attempts} att.)` : ""]
          .filter(Boolean)
          .join(" ");
      },
      (r) => fmtMonthYear(r.monthYearOfPassing),
    ],
    "Academic Qualifications",
  );
  replaceBlank(findParagraph(d, "Specialisation"), b.v("specialisation"));

  const exp = findTable(d, "Sl.");
  b.table(
    rows(exp).slice(2, 6),
    b.rows("experience"),
    [
      (_r, i) => String(i + 1),
      (r) => s(r.post),
      (r) => s(r.employer),
      (r) => s(r.payScale),
      (r) => fmtDate(r.from),
      (r) => (r.to ? fmtDate(r.to) : "Till date"),
      (r) => s(r.years),
      (r) => s(r.months),
      (r) => s(r.nature),
    ],
    "Experience",
  );

  afterColonMultiline(
    b,
    findParagraph(d, "8. Membership of Professional Bodies"),
    1,
    b.v("memberships"),
    5040,
  );

  const pubLabel2 = findParagraph(d, "sheets, If necessary)");
  const pubs = b
    .v("publications")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (pubs.length) {
    const lines = pubs.flatMap((p, i) => wrap(`${i + 1}. ${p}`, 80));
    const added = writeLines(b, pubLabel2, lines, 720);
    if (added) b.deviations.push(`Publications: ${added} continuation line(s) added`);
  }

  const salP = findParagraph(d, "10. Present post");
  insertAfterMarker(salP, "Rs.", 1, b.v("basicPay"));
  insertAfterMarker(salP, ":", 1, b.v("presentPost") ? `${b.v("presentPost")};` : "");
  insertAfterMarker(findParagraph(d, "Total emoluments"), "Rs.", 1, b.v("totalEmoluments"));
  insertAfterMarker(findParagraph(d, "11. Joining time required"), ":", 1, b.v("joiningTime"));

  // References: two columns under "1." and "2.", using a tab stop at the "2." column.
  const refHead = findParagraph(d, "1.", findParagraph(d, "12. Name and address"));
  const r1 = b.v("reference1") ? wrap(b.v("reference1"), 38) : [];
  const r2 = b.v("reference2") ? wrap(b.v("reference2"), 38) : [];
  const refLines = Array.from(
    { length: Math.max(r1.length, r2.length) },
    (_, i) => `      ${r1[i] ?? ""}\t${r2[i] ?? ""}`,
  );
  writeLines(b, refHead, refLines, 4680, [], "");

  const otherP = findParagraph(d, "13. Any other information");
  const other = b.v("otherInformation");
  if (other) writeLines(b, otherP, wrap(other, 80), 720);

  const placeP = findParagraph(d, "Place :");
  insertAfterMarker(placeP, ":", 1, b.v("place"));
  insertAfterMarker(findParagraph(d, "Date :", placeP), ":", 1, fmtDate(b.v("declarationDate")));
}

// ------------------------------------------------------------------------------------------------
// ASSOCIATE PROFESSOR v1
// ------------------------------------------------------------------------------------------------
function bindAssociate(b: Binder) {
  const d = b.doc;
  replaceBlank(findParagraph(d, "DEPARTMENT OF"), b.v("department"));

  // Page 1 personal-information table.
  const t0 = findTable(d, "NAME (BLOCK LETTERS)");
  const boxes = (label: string, value: string) => {
    if (fillLetterBoxes(findRow(t0, label), 1, value) === "merged")
      b.deviations.push(
        `${label}: value longer than the printed letter boxes; boxes merged to keep the full value`,
      );
  };
  boxes("NAME (BLOCK LETTERS)", b.v("name").toUpperCase());
  boxes(
    "DATE OF BIRTH, AGE & GENDER",
    [fmtDate(b.v("dateOfBirth")).replace(/-/g, "/"), b.v("age"), b.v("gender").toUpperCase()]
      .filter(Boolean)
      .join(" "),
  );
  boxes(
    "QUALIFICATIONS",
    b
      .v("qualificationsSummary")
      .toUpperCase()
      .replace(/\s*\n\s*/g, " "),
  );

  const addrRows: [string, string][] = [
    ["DOOR NO.", "DoorNo"],
    ["STREET", "Street"],
    ["VILLAGE/TOWN/CITY", "City"],
    ["DISTRICT", "District"],
    ["STATE", "State"],
    ["PIN", "Pin"],
  ];
  for (const [label, suffix] of addrRows) {
    const tcs = cells(findRow(t0, label));
    setCell(tcs[1]!, b.v(`present${suffix}`));
    setCell(tcs[2]!, b.v(`permanent${suffix}`));
  }
  const mob = cells(findRow(t0, "MOBILE NO."));
  setCell(mob[1]!, b.v("mobile"));
  appendInCell(mob[2]!, b.v("email"));
  const rel = cells(findRow(t0, "RELIGION"));
  setCell(rel[1]!, b.v("religion"));
  setCell(rel[3]!, b.v("caste"));
  appendInCell(rel[4]!, b.v("communityCategory"));

  const marY = findRow(t0, "MARITAL STATUS");
  const marN = rowsAfter(marY, 1)[0]!;
  const ms = b.v("maritalStatus");
  if (ms === "Y") appendInCell(cells(marY)[1]!, "✓", " ");
  if (ms === "N") appendInCell(cells(marN)[1]!, "✓", " ");
  setCell(cells(marY)[3]!, b.v("spouseNameOccupation"));
  const spouseAddr = rowsAfter(marN, 1)[0]!;
  setCell(cells(spouseAddr)[2]!, b.v("spouseOfficialAddress"));

  const childRows = [findRow(t0, "DETAILS OF CHILDREN")];
  childRows.push(...rowsAfter(childRows[0]!, 2));
  const kids = b.rows("children");
  if (kids.length > 3)
    b.deviations.push(`Children: ${kids.length - 3} additional child(ren) listed in the third column`);
  ["name", "age", "status"].forEach((f, r) => {
    const tcs = cells(childRows[r]!);
    for (let c = 0; c < 3; c++) {
      const vals = (c < 2 ? kids.slice(c, c + 1) : kids.slice(2)).map((k) => s(k[f]));
      setCell(tcs[2 + c]!, vals.join("\n"));
    }
  });
  setCell(cells(findRow(t0, "JOINING TIME REQUIRED"))[1]!, b.v("joiningTime"));

  // Page 2: references, jobs held, educational qualifications.
  const t1 = findTable(d, "REFERENCES");
  const refRow = rows(t1)[0]!;
  setCell(cells(refRow)[1]!, b.v("reference1"));
  setCell(cells(refRow)[2]!, b.v("reference2"));
  const jobsHead = findRow(t1, "DESIGNATION");
  b.table(
    rowsAfter(jobsHead, 6).slice(1, 6),
    b.rows("jobsHeld"),
    [
      (r) => s(r.designation),
      (r) => s(r.scaleOfPay),
      (r) => s(r.totalSalary),
      (r) => s(r.organisation),
      (r) => fmtDate(r.from),
      (r) => (r.to ? fmtDate(r.to) : "Till date"),
      (r) => s(r.years),
      (r) => s(r.months),
      (r) => s(r.reasonForLeaving),
    ],
    "Details of jobs held",
  );
  const levelCol: Record<string, number> = { UG: 1, PG: 2, RESEARCH: 3, OTHERS: 4 };
  const eduRows: [string, (r: TableRow) => string][] = [
    ["DEGREE", (r) => s(r.degree)],
    ["MONTH & YEAR", (r) => fmtMonthYear(r.monthYear)],
    ["COLLEGE", (r) => s(r.college)],
    ["UNIVERSITY", (r) => s(r.university)],
    [
      "CLASS & % OF MARKS",
      (r) => {
        const cls = s(r.class) || s(r.classPercent);
        const cgpa = s(r.cgpaOrMarks);
        const marks = [cls, cgpa].filter(Boolean).join(" / ");
        return [marks, r.attempts ? `(${r.attempts} att.)` : ""]
          .filter(Boolean)
          .join(" ");
      },
    ],
    ["THESIS", (r) => s(r.thesis)],
    ["SPECIALISATION", (r) => s(r.specialisation)],
  ];
  const eduHead = findRow(t1, "EDUCATIONAL QUALIFICATIONS");
  for (const q of b.rows("educationalQualifications")) {
    const col = levelCol[s(q.level)];
    if (!col) continue;
    for (const [label, fn] of eduRows) setCell(cells(findRow(t1, label, eduHead))[col]!, fn(q));
  }

  // Page 3: subjects taught and prepared material.
  const t2 = findTable(d, "SUBJECTS TAUGHT DURING LAST FIVE YEARS");
  const ug = b.list("subjectsUg");
  const pg = b.list("subjectsPg");
  const subjRows = ensureRows(
    rows(t2).slice(2, 7),
    Math.max(5, Math.ceil(ug.length / 2), Math.ceil(pg.length / 2)),
  );
  if (subjRows.length > 5) b.deviations.push(`Subjects taught: ${subjRows.length - 5} row(s) added`);
  ug.forEach((x, i) => setCell(cells(subjRows[Math.floor(i / 2)]!)[i % 2]!, x));
  pg.forEach((x, i) => setCell(cells(subjRows[Math.floor(i / 2)]!)[2 + (i % 2)]!, x));
  const group = (head: string, n: number) => rowsAfter(findRow(t2, head), n);
  b.transposed(
    group("COURSE MATERIALS PREPARED", 2),
    b.rows("courseMaterials"),
    ["title", "year"],
    "Course materials",
  );
  b.transposed(
    group("LABORATORY MANUALS PREPARED", 2),
    b.rows("labManuals"),
    ["title", "year"],
    "Laboratory manuals",
  );
  b.transposed(group("MONOGRAPHS PREPARED", 2), b.rows("monographs"), ["title", "year"], "Monographs");
  b.transposed(group("BOOKS PUBLISHED", 3), b.rows("books"), ["name", "publisher", "year"], "Books");

  // Page 4: journal papers written into the blank lines.
  const intl = b.list("internationalJournals");
  const nat = b.list("nationalJournals");
  const addI = fillBlankLines(findParagraph(d, "PAPERS PUBLISHED IN INTERNATIONAL JOURNALS"), intl, 95);
  const addN = fillBlankLines(findParagraph(d, "PAPERS PUBLISHED IN NATIONAL JOURNALS"), nat, 95);
  if (addI) b.deviations.push(`International journals: ${addI} continuation line(s) added`);
  if (addN) b.deviations.push(`National journals: ${addN} continuation line(s) added`);

  // Page 5.
  const t3 = findTable(d, "PARTICIPATION IN CONSULTANCY ACTIVITIES");
  const after = (t: Element, label: string, n: number) => rowsAfter(findRow(t, label), n);
  b.table(
    after(t3, "CONSULTANCY JOB / PROJECT", 4),
    b.rows("consultancy"),
    [(r) => s(r.job), (r) => s(r.organisation), (r) => s(r.projectLeader), (r) => s(r.revenue)],
    "Consultancy",
  );
  b.table(
    after(t3, "TESTING JOB", 4),
    b.rows("testing"),
    [(r) => s(r.job), (r) => s(r.organisation), (r) => s(r.testsDone), (r) => s(r.revenue)],
    "Testing",
  );
  b.table(
    after(t3, "PROGRAMME", 4),
    b.rows("summerPrograms"),
    [(r) => s(r.programme), (r) => s(r.heldAt), (r) => s(r.duration)],
    "Summer / continuing education programmes",
  );

  // Page 6.
  const conf = b.list("conferencePapers");
  const addC = fillBlankLines(findParagraph(d, "PAPERS PRESENTED IN CONFERENCES"), conf, 95);
  if (addC) b.deviations.push(`Conference papers: ${addC} continuation line(s) added`);
  const t4 = findTable(d, "MEMBERSHIP OF PROFESSIONAL BODIES");
  b.table(
    after(t4, "PROFESSIONAL BODY", 5),
    b.rows("memberships"),
    [(r) => s(r.body), (r) => s(r.type), (r) => s(r.position)],
    "Memberships",
  );

  // Page 7.
  const t5 = findTable(d, "ANY LABORATORY MODELS");
  setCell(cells(rows(t5)[1]!)[0]!, b.v("labModels"));
  b.table(
    after(t5, "EQUIPMENT", 4),
    b.rows("labDevelopment"),
    [(r) => s(r.equipment), (r) => s(r.cost), (r) => s(r.whenPurchased), (r) => s(r.involvement)],
    "Laboratory development",
  );
  setCell(cells(rowsAfter(findRow(t5, "STATE ANY INNOVATIONS"), 1)[0]!)[0]!, b.v("teachingInnovations"));

  // Page 8.
  const t6 = findTable(d, "PARTICIPATION IN THE ORGANISATION OF CONTINUING");
  b.table(
    after(t6, "PROGRAMME", 4),
    b.rows("ceOrganised"),
    [
      (r) => s(r.programme),
      (r) => s(r.duration),
      (r) => s(r.period),
      (r) => s(r.participants),
      (r) => s(r.involvement),
    ],
    "Continuing education programmes organised",
  );
  b.table(
    after(t6, "PROJECT", 4),
    b.rows("sponsoredResearch"),
    [
      (r) => s(r.project),
      (r) => s(r.sponsor),
      (r) => s(r.period),
      (r) => s(r.grant),
      (r) => s(r.principalInvestigator),
    ],
    "Sponsored research",
  );
  const sug = b.list("studentProjectsUg");
  const spg = b.list("studentProjectsPg");
  const spRows = ensureRows(after(t6, "UNDER GRADUATE", 7), Math.max(7, sug.length, spg.length));
  if (spRows.length > 7) b.deviations.push(`Student projects: ${spRows.length - 7} row(s) added`);
  sug.forEach((x, i) => setCell(cells(spRows[i]!)[0]!, x));
  spg.forEach((x, i) => setCell(cells(spRows[i]!)[1]!, x));

  // Page 9.
  const t7 = findTable(d, "MENTORSHIP DURING THE LAST THREE YEARS");
  b.table(
    after(t7, "CLASS", 4),
    b.rows("mentorship"),
    [(r) => s(r.class), (r) => s(r.year), (r) => s(r.contribution)],
    "Mentorship",
  );
  const toursHead = findRow(t7, "CLASS", findRow(t7, "ACCOMPANYING STUDENTS"));
  b.table(
    rowsAfter(toursHead, 3),
    b.rows("tours"),
    [(r) => s(r.class), (r) => s(r.visitTo), (r) => s(r.duration), (r) => s(r.yearMonth)],
    "Educational tours / industrial visits",
  );
  const t8 = findTable(d, "DISTINCTIONS AND AWARDS");
  const awards = b.list("awardsPatents");
  const awRows = ensureRows(rows(t8).slice(1, 5), Math.max(4, awards.length));
  if (awRows.length > 4) b.deviations.push(`Distinctions and awards: ${awRows.length - 4} row(s) added`);
  awards.forEach((x, i) => setCell(cells(awRows[i]!)[0]!, `${i + 1}. ${x}`));

  const stationP = findParagraph(d, "STATION :");
  insertAfterMarker(stationP, ":", 1, b.v("station"));
  insertAfterMarker(findParagraph(d, "DATE :", stationP), ":", 1, fmtDate(b.v("declarationDate")));
}

const BINDERS: Record<FormCode, (b: Binder) => void> = {
  ASSISTANT_PROFESSOR: bindAssistant,
  ASSOCIATE_PROFESSOR: bindAssociate,
};

const IMAGE_CT: Record<string, string> = { png: "image/png", jpeg: "image/jpeg" };

/** Populates the template and returns the DOCX bytes plus a traceability report. */
export async function renderApplicationDocx(
  input: RenderInput,
): Promise<{ docx: Uint8Array; report: RenderReport }> {
  const zip = await JSZip.loadAsync(input.template);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Template has no word/document.xml");
  const doc = parseXml(await docFile.async("string"));
  const styles = await zip.file("word/styles.xml")?.async("string");
  // Font size used by the layout simulation: Normal paragraph style, else document defaults.
  const sz =
    (styles && /w:styleId="Normal"[\s\S]*?<\/w:style>/.exec(styles)?.[0].match(/<w:sz w:val="(\d+)"/)) ||
    (styles && /<w:docDefaults>[\s\S]*?<w:sz w:val="(\d+)"/.exec(styles));
  layout.defaultSzHalfPts = sz ? Number(sz[1]) : 20;
  const b = new Binder(doc, input.answers);
  BINDERS[input.formCode](b);

  let photoPlaced = false;
  if (input.photo && input.photo.length) {
    const img = imageInfo(input.photo);
    const { cx, cy } = textBoxExtent(doc, PHOTO_BOX);
    const relsPath = "word/_rels/document.xml.rels";
    const rels = parseXml(await zip.file(relsPath)!.async("string"));
    const relId = "rIdApplicantPhoto";
    const rel = rels.createElementNS(
      "http://schemas.openxmlformats.org/package/2006/relationships",
      "Relationship",
    );
    rel.setAttribute("Id", relId);
    rel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
    rel.setAttribute("Target", `media/applicant-photo.${img.ext}`);
    rels.documentElement!.appendChild(rel);
    zip.file(relsPath, serializeXml(rels));
    zip.file(`word/media/applicant-photo.${img.ext}`, img.data);
    const ct = parseXml(await zip.file("[Content_Types].xml")!.async("string"));
    const defaults = ct.getElementsByTagName("Default");
    let has = false;
    for (let i = 0; i < defaults.length; i++)
      if (defaults[i]!.getAttribute("Extension") === img.ext) has = true;
    if (!has) {
      const def = ct.createElementNS(
        "http://schemas.openxmlformats.org/package/2006/content-types",
        "Default",
      );
      def.setAttribute("Extension", img.ext);
      def.setAttribute("ContentType", IMAGE_CT[img.ext]!);
      ct.documentElement!.insertBefore(def, ct.documentElement!.firstChild);
      zip.file("[Content_Types].xml", serializeXml(ct));
    }
    photoPlaced = placePhotoInTextBox(doc, PHOTO_BOX, relId, img, cx, cy) > 0;
  }

  zip.file("word/document.xml", serializeXml(doc));
  const docx = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { docx, report: { boundKeys: [...b.bound].sort(), deviations: b.deviations, photoPlaced } };
}
