import { assistantProfessorV1 } from "./definitions/assistant-professor";
import { associateProfessorV1 } from "./definitions/associate-professor";
import type { FieldDef, FormCode, FormDefinition, ScalarField } from "./types";

const definitions: FormDefinition[] = [assistantProfessorV1, associateProfessorV1];

export function getFormDefinition(code: FormCode, version: number): FormDefinition {
  const def = definitions.find((d) => d.code === code && d.version === version);
  if (!def) throw new Error(`Unknown form template ${code} v${version}`);
  return def;
}

export function listFormDefinitions(): readonly FormDefinition[] {
  return definitions;
}

export function allFields(def: FormDefinition): FieldDef[] {
  return def.sections.flatMap((s) => s.fields);
}

export function findField(def: FormDefinition, key: string): FieldDef | undefined {
  return allFields(def).find((f) => f.key === key);
}

export function isScalar(f: FieldDef): f is ScalarField {
  return f.kind !== "table" && f.kind !== "list";
}
