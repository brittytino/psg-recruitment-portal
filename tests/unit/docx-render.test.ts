import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderApplicationDocx } from "~/modules/documents/docx/render";
import { allFields, getFormDefinition } from "~/modules/forms/registry";
import { validateAnswers, withDerived } from "~/modules/forms/validation";
import type { Answers, FormCode } from "~/modules/forms/types";
import {
  assistantFull,
  assistantMinimal,
  associateFull,
  associateMinimal,
  testPhotoPng,
} from "../fixtures/applications";

async function render(code: FormCode, answers: Answers, photo = true) {
  const def = getFormDefinition(code, 1);
  const template = new Uint8Array(readFileSync(def.templatePath));
  const full = withDerived(def, answers, {
    department: "Computer Science and Engineering",
    asOf: "2026-10-01",
  });
  const out = await renderApplicationDocx({
    formCode: code,
    template,
    answers: full,
    photo: photo ? testPhotoPng() : null,
  });
  const xml = await (await JSZip.loadAsync(out.docx)).file("word/document.xml")!.async("string");
  const text = xml.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "");
  return { ...out, xml, text, def };
}

describe.each([
  ["ASSISTANT_PROFESSOR", assistantMinimal, assistantFull],
  ["ASSOCIATE_PROFESSOR", associateMinimal, associateFull],
] as const)("%s template", (code, minimal, full) => {
  it("fixtures are valid submissions", () => {
    const def = getFormDefinition(code, 1);
    expect(validateAnswers(def, minimal, "submit")).toEqual([]);
    expect(validateAnswers(def, full, "submit")).toEqual([]);
  });

  it("binds every field in the form definition (no silently omitted field)", async () => {
    const { report, def } = await render(code, full);
    const keys = allFields(def)
      .map((f) => f.key)
      .sort();
    expect(report.boundKeys).toEqual(keys);
  });

  it("writes every scalar, table cell and list entry value into the document", async () => {
    const { text, def } = await render(code, full);
    // Compare on letters/digits only, so XML escaping, wrapping and block-letter boxes don't matter.
    const key = (v: string) =>
      v
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    const doc = key(text);
    const has = (v: string) => doc.includes(key(v));
    const missing: string[] = [];
    for (const f of allFields(def)) {
      const v = full[f.key];
      if (v == null || f.kind === "derived" || f.kind === "date" || f.kind === "monthYear") continue;
      if (f.kind === "list") (v as string[]).forEach((x) => !has(x) && missing.push(`${f.key}: ${x}`));
      else if (f.kind === "table")
        (v as Record<string, unknown>[]).forEach((r) =>
          f.columns.forEach((c) => {
            const cv = r[c.key];
            if (cv == null || cv === "" || c.kind === "date" || c.kind === "monthYear" || c.key === "level")
              return;
            if (!has(String(cv))) missing.push(`${f.key}.${c.key}: ${String(cv)}`);
          }),
        );
      else if (f.kind === "textarea")
        String(v)
          .split("\n")
          .forEach((line) => !has(line) && missing.push(`${f.key}: ${line}`));
      else if (!has(String(v))) missing.push(`${f.key}: ${String(v)}`);
    }
    expect(missing).toEqual([]);
  });

  it("preserves every original label and instruction", async () => {
    const def = getFormDefinition(code, 1);
    const origXml = await (
      await JSZip.loadAsync(readFileSync(def.templatePath))
    )
      .file("word/document.xml")!
      .async("string");
    const textsOf = (x: string) =>
      [...x.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1]!)
        .join("")
        .replace(/\s+/g, "");
    const { xml } = await render(code, full, false);
    const after = textsOf(xml);
    // Every original text run's characters (minus blanks filled with values) still appear in order.
    const original = textsOf(origXml).replace(/_/g, "");
    let i = 0;
    for (const ch of original) {
      const j = after.indexOf(ch, i);
      expect(
        j,
        `original text lost near "${original.slice(Math.max(0, original.indexOf(ch, i) - 20), original.indexOf(ch, i) + 20)}"`,
      ).toBeGreaterThanOrEqual(0);
      i = j + 1;
    }
  });

  it("places the photograph inside the photograph box", async () => {
    const { report, xml } = await render(code, minimal);
    expect(report.photoPlaced).toBe(true);
    expect(xml).toContain('r:embed="rIdApplicantPhoto"');
  });

  it("records continuation deviations for large inputs", async () => {
    const { report } = await render(code, full);
    expect(report.deviations.length).toBeGreaterThan(0);
  });
});
