import { describe, expect, it } from "vitest";
import { getFormDefinition } from "~/modules/forms/registry";
import type { TableField, TextField } from "~/modules/forms/types";
import { checkScalar, validateAnswers } from "~/modules/forms/validation";

describe("Educational qualifications Class and (CGPA/Marks) fields", () => {
  it("defines class and (CGPA/Marks) columns in academicQualifications on Assistant Professor form", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;

    expect(tableField).toBeDefined();

    const classCol = tableField.columns.find((c) => c.key === "class") as TextField;
    expect(classCol).toBeDefined();
    expect(classCol.kind).toBe("text");
    expect(classCol.label).toBe("Class");
    expect(classCol.requirement).toBe("required");

    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    expect(cgpaCol).toBeDefined();
    expect(cgpaCol.kind).toBe("text");
    expect(cgpaCol.label).toBe("(CGPA/Marks)");
    expect(cgpaCol.requirement).toBe("required");
  });

  it("defines class and (CGPA/Marks) columns in educationalQualifications on Associate Professor form", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "education")
      ?.fields.find((f) => f.key === "educationalQualifications") as TableField;

    expect(tableField).toBeDefined();

    const classCol = tableField.columns.find((c) => c.key === "class") as TextField;
    expect(classCol).toBeDefined();
    expect(classCol.kind).toBe("text");
    expect(classCol.label).toBe("Class");
    expect(classCol.requirement).toBe("required");

    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    expect(cgpaCol).toBeDefined();
    expect(cgpaCol.kind).toBe("text");
    expect(cgpaCol.label).toBe("(CGPA/Marks)");
    expect(cgpaCol.requirement).toBe("required");
  });

  describe("validation on submission and draft", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;
    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    const classCol = tableField.columns.find((c) => c.key === "class") as TextField;

    it("accepts valid non-empty string values", () => {
      expect(checkScalar(cgpaCol, "8.75 CGPA", "submit", true)).toBeNull();
      expect(checkScalar(cgpaCol, "85%", "submit", true)).toBeNull();
      expect(checkScalar(classCol, "First Class with Distinction", "submit", true)).toBeNull();
    });

    it("rejects empty values on submit mode", () => {
      expect(checkScalar(cgpaCol, null, "submit", true)).toBe("(CGPA/Marks) is required");
      expect(checkScalar(cgpaCol, "", "submit", true)).toBe("(CGPA/Marks) is required");
      expect(checkScalar(classCol, null, "submit", true)).toBe("Class is required");
      expect(checkScalar(classCol, "", "submit", true)).toBe("Class is required");
    });

    it("allows empty values in draft mode", () => {
      expect(checkScalar(cgpaCol, null, "draft", false)).toBeNull();
      expect(checkScalar(cgpaCol, "", "draft", false)).toBeNull();
      expect(checkScalar(classCol, null, "draft", false)).toBeNull();
      expect(checkScalar(classCol, "", "draft", false)).toBeNull();
    });

    it("validates full answer submission requiring both class and (CGPA/Marks)", () => {
      const validRow = {
        degree: "B.E.",
        university: "Anna University",
        institution: "PSG Tech",
        class: "First Class with Distinction",
        cgpaOrMarks: "85%",
        monthYearOfPassing: "2015-05",
        attempts: 1,
        documentId: "doc-sample-123",
      };

      const issuesValid = validateAnswers(
        def,
        { academicQualifications: [validRow] },
        "submit",
      );
      expect(issuesValid.some((i) => i.path.includes("cgpaOrMarks"))).toBe(false);
      expect(issuesValid.some((i) => i.path.includes("class"))).toBe(false);

      const issuesWithoutCgpa = validateAnswers(
        def,
        { academicQualifications: [{ ...validRow, cgpaOrMarks: null }] },
        "submit",
      );
      expect(issuesWithoutCgpa.some((i) => i.path.includes("cgpaOrMarks"))).toBe(true);

      const issuesWithoutClass = validateAnswers(
        def,
        { academicQualifications: [{ ...validRow, class: "" }] },
        "submit",
      );
      expect(issuesWithoutClass.some((i) => i.path.includes("class"))).toBe(true);
    });
  });
});
