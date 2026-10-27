import { describe, expect, it } from "vitest";
import { getFormDefinition } from "~/modules/forms/registry";
import type { NumberField, TableField } from "~/modules/forms/types";
import { checkScalar, validateAnswers } from "~/modules/forms/validation";

describe("Education qualifications number of attempts", () => {
  it("defines attempts column in academicQualifications on Assistant Professor form", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;

    expect(tableField).toBeDefined();
    const attemptsCol = tableField.columns.find((c) => c.key === "attempts") as NumberField;
    expect(attemptsCol).toBeDefined();
    expect(attemptsCol.kind).toBe("number");
    expect(attemptsCol.integer).toBe(true);
    expect(attemptsCol.min).toBe(1);
    expect(attemptsCol.requirement).toBe("required");
  });

  it("defines attempts column in educationalQualifications on Associate Professor form", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "education")
      ?.fields.find((f) => f.key === "educationalQualifications") as TableField;

    expect(tableField).toBeDefined();
    const attemptsCol = tableField.columns.find((c) => c.key === "attempts") as NumberField;
    expect(attemptsCol).toBeDefined();
    expect(attemptsCol.kind).toBe("number");
    expect(attemptsCol.integer).toBe(true);
    expect(attemptsCol.min).toBe(1);
    expect(attemptsCol.requirement).toBe("required");
  });

  describe("attempts column validation", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;
    const attemptsCol = tableField.columns.find((c) => c.key === "attempts") as NumberField;

    it("accepts valid positive integer attempts", () => {
      expect(checkScalar(attemptsCol, 1, "submit", true)).toBeNull();
      expect(checkScalar(attemptsCol, 2, "submit", true)).toBeNull();
      expect(checkScalar(attemptsCol, "1", "submit", true)).toBeNull();
    });

    it("rejects 0 or negative numbers", () => {
      expect(checkScalar(attemptsCol, 0, "submit", true)).toBe("No. of attempts must be at least 1");
      expect(checkScalar(attemptsCol, -1, "submit", true)).toBe("No. of attempts must be at least 1");
    });

    it("rejects non-integer numbers", () => {
      expect(checkScalar(attemptsCol, 1.5, "submit", true)).toBe("No. of attempts must be a whole number");
    });

    it("rejects empty attempts on submit mode", () => {
      expect(checkScalar(attemptsCol, null, "submit", true)).toBe("No. of attempts is required");
      expect(checkScalar(attemptsCol, "", "submit", true)).toBe("No. of attempts is required");
    });

    it("allows empty attempts in draft mode", () => {
      expect(checkScalar(attemptsCol, null, "draft", false)).toBeNull();
      expect(checkScalar(attemptsCol, "", "draft", false)).toBeNull();
    });
  });

  it("validates full answer submission requiring attempts in qualifications", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const validRow = {
      degree: "B.E.",
      university: "Anna University",
      institution: "PSG Tech",
      class: "First Class",
      cgpaOrMarks: "80%",
      monthYearOfPassing: "2015-05",
      attempts: 1,
    };
    const rowWithoutAttempts = {
      ...validRow,
      attempts: null,
    };

    const issuesWithAttempts = validateAnswers(
      def,
      { academicQualifications: [validRow] },
      "submit",
    );
    expect(issuesWithAttempts.some((i) => i.path.includes("attempts"))).toBe(false);

    const issuesWithoutAttempts = validateAnswers(
      def,
      { academicQualifications: [rowWithoutAttempts] },
      "submit",
    );
    expect(issuesWithoutAttempts.some((i) => i.path.includes("attempts"))).toBe(true);
  });
});
