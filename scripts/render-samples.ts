/** Renders fixture applications through the real converter for visual inspection. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderApplicationDocx } from "~/modules/documents/docx/render";
import { getFormDefinition } from "~/modules/forms/registry";
import { withDerived } from "~/modules/forms/validation";
import type { Answers, FormCode } from "~/modules/forms/types";
import { assistantFull, assistantMinimal, associateFull, associateMinimal, testPhotoPng } from "../tests/fixtures/applications";

const OUT = "tests/pdf-regression/output";
const CONVERTER = process.env.CONVERTER_URL ?? "http://localhost:63100";

async function toPdf(docx: Uint8Array): Promise<Uint8Array> {
  const r = await fetch(`${CONVERTER}/convert?from=docx`, { method: "POST", body: Buffer.from(docx) });
  if (!r.ok) throw new Error(`converter ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });
const cases: [string, FormCode, Answers][] = [
  ["assistant-minimal", "ASSISTANT_PROFESSOR", assistantMinimal],
  ["assistant-full", "ASSISTANT_PROFESSOR", assistantFull],
  ["associate-minimal", "ASSOCIATE_PROFESSOR", associateMinimal],
  ["associate-full", "ASSOCIATE_PROFESSOR", associateFull],
];
for (const code of ["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR"] as const) {
  const def = getFormDefinition(code, 1);
  writeFileSync(`${OUT}/${code.toLowerCase()}-original.pdf`, await toPdf(new Uint8Array(readFileSync(def.templatePath))));
}
for (const [name, code, answers] of cases) {
  const def = getFormDefinition(code, 1);
  const { docx, report } = await renderApplicationDocx({
    formCode: code,
    template: new Uint8Array(readFileSync(def.templatePath)),
    answers: withDerived(def, answers, { department: "Computer Science and Engineering", asOf: "2026-10-01" }),
    photo: testPhotoPng(),
  });
  writeFileSync(`${OUT}/${name}.docx`, docx);
  writeFileSync(`${OUT}/${name}.pdf`, await toPdf(docx));
  console.log(name, report.deviations);
}
