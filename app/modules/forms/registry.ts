import { assistantProfessorV1 } from "./definitions/assistant-professor";
import { associateProfessorV1 } from "./definitions/associate-professor";
import { assistantProfessorV2, associateProfessorV2 } from "./definitions/faculty-v2";
import type { FieldDef, FormCode, FormDefinition, ScalarField } from "./types";

const definitions: FormDefinition[] = [
  assistantProfessorV1,
  associateProfessorV1,
  assistantProfessorV2,
  associateProfessorV2,
];

export function getFormDefinition(code: FormCode, version: number): FormDefinition {
  const def = definitions.find((d) => d.code === code && d.version === version);
  if (!def) throw new Error(`Unknown form template ${code} v${version}`);
  return def;
}

export function listFormDefinitions(): readonly FormDefinition[] {
  return definitions;
}

/** Forms filled into the official Word template (v1). */
export const isDocxForm = (def: FormDefinition) => (def.renderer ?? "docx") === "docx";

export function allFields(def: FormDefinition): FieldDef[] {
  return def.sections.flatMap((s) => s.fields);
}

export function findField(def: FormDefinition, key: string): FieldDef | undefined {
  return allFields(def).find((f) => f.key === key);
}

export function isScalar(f: FieldDef): f is ScalarField {
  return f.kind !== "table" && f.kind !== "list";
}
