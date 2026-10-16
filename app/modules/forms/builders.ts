import type {
  DateField,
  DerivedField,
  ListField,
  MonthYearField,
  NumberField,
  Requirement,
  ScalarField,
  SelectField,
  SourceRef,
  TableField,
  TextAreaField,
  TextField,
} from "./types";

type Opts<T> = Partial<Omit<T, "kind" | "key" | "label" | "source">> & { requirement?: Requirement };

const src = (page: number, label: string): SourceRef => ({ page, label });

export const text = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<TextField> = {},
): TextField => ({
  kind: "text",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  maxLength: 200,
  ...o,
});

export const textarea = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<TextAreaField> = {},
): TextAreaField => ({
  kind: "textarea",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  maxLength: 4000,
  rows: 4,
  ...o,
});

export const date = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<DateField> = {},
): DateField => ({
  kind: "date",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  ...o,
});

export const monthYear = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<MonthYearField> = {},
): MonthYearField => ({
  kind: "monthYear",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  ...o,
});

export const num = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<NumberField> = {},
): NumberField => ({
  kind: "number",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  min: 0,
  ...o,
});

export const select = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  options: string[] | { value: string; label: string }[],
  o: Opts<SelectField> = {},
): SelectField => ({
  kind: "select",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  options: options.map((x) => (typeof x === "string" ? { value: x, label: x } : x)),
  ...o,
});

export const derived = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  derivedFrom: string,
  o: Opts<DerivedField> = {},
): DerivedField => ({
  kind: "derived",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  derivedFrom,
  ...o,
});

export const table = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  columns: ScalarField[],
  o: Opts<TableField> & { templateRows: number },
): TableField => ({
  kind: "table",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  columns,
  maxRows: 60,
  ...o,
});

export const list = (
  key: string,
  label: string,
  page: number,
  sourceLabel: string,
  o: Opts<ListField> & { templateCapacity: number },
): ListField => ({
  kind: "list",
  key,
  label,
  source: src(page, sourceLabel),
  requirement: "optional",
  itemLabel: "Entry",
  itemMaxLength: 1000,
  maxItems: 200,
  ...o,
});
