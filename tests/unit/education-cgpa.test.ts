import { describe, expect, it } from "vitest";
import { getFormDefinition } from "~/modules/forms/registry";
import type { SelectField, TableField, TextField } from "~/modules/forms/types";
import { checkScalar, validateAnswers } from "~/modules/forms/validation";

describe("Educational qualifications Class, (CGPA/Marks) and Mode of study fields", () => {
  it("defines dropdown class, cgpaOrMarks, and modeOfStudy in academicQualifications on Assistant Professor form", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;

    expect(tableField).toBeDefined();

    const classCol = tableField.columns.find((c) => c.key === "class") as SelectField;
    expect(classCol).toBeDefined();
    expect(classCol.kind).toBe("select");
    expect(classCol.label).toBe("Class");
    expect(classCol.requirement).toBe("required");
    expect(classCol.options.map((o) => o.value)).toEqual([
      "First",
      "Second",
      "First with Distinction",
      "Honors",
    ]);

    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    expect(cgpaCol).toBeDefined();
    expect(cgpaCol.kind).toBe("text");
    expect(cgpaCol.label).toBe("(CGPA/Marks)");
    expect(cgpaCol.requirement).toBe("required");

    const modeCol = tableField.columns.find((c) => c.key === "modeOfStudy") as SelectField;
    expect(modeCol).toBeDefined();
    expect(modeCol.kind).toBe("select");
    expect(modeCol.label).toBe("Mode of study");
    expect(modeCol.requirement).toBe("required");
    expect(modeCol.options.map((o) => o.value)).toEqual(["Full-Time", "Part-Time", "Distance"]);
  });

  it("defines dropdown class, cgpaOrMarks, and modeOfStudy in educationalQualifications on Associate Professor form", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "education")
      ?.fields.find((f) => f.key === "educationalQualifications") as TableField;

    expect(tableField).toBeDefined();

    const classCol = tableField.columns.find((c) => c.key === "class") as SelectField;
    expect(classCol).toBeDefined();
    expect(classCol.kind).toBe("select");
    expect(classCol.label).toBe("Class");
    expect(classCol.requirement).toBe("required");
    expect(classCol.options.map((o) => o.value)).toEqual([
      "First",
      "Second",
      "First with Distinction",
      "Honors",
    ]);

    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    expect(cgpaCol).toBeDefined();
    expect(cgpaCol.kind).toBe("text");
    expect(cgpaCol.label).toBe("(CGPA/Marks)");
    expect(cgpaCol.requirement).toBe("required");

    const modeCol = tableField.columns.find((c) => c.key === "modeOfStudy") as SelectField;
    expect(modeCol).toBeDefined();
    expect(modeCol.kind).toBe("select");
    expect(modeCol.label).toBe("Mode of study");
    expect(modeCol.requirement).toBe("required");
    expect(modeCol.options.map((o) => o.value)).toEqual(["Full-Time", "Part-Time", "Distance"]);
  });

  describe("validation on submission and draft", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const tableField = def.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField;
    const cgpaCol = tableField.columns.find((c) => c.key === "cgpaOrMarks") as TextField;
    const classCol = tableField.columns.find((c) => c.key === "class") as SelectField;
    const modeCol = tableField.columns.find((c) => c.key === "modeOfStudy") as SelectField;

    it("accepts valid dropdown choices and CGPA/Marks values", () => {
      expect(checkScalar(cgpaCol, "8.75 CGPA", "submit", true)).toBeNull();
      expect(checkScalar(cgpaCol, "85%", "submit", true)).toBeNull();
      expect(checkScalar(classCol, "First", "submit", true)).toBeNull();
      expect(checkScalar(classCol, "Second", "submit", true)).toBeNull();
      expect(checkScalar(classCol, "First with Distinction", "submit", true)).toBeNull();
      expect(checkScalar(classCol, "Honors", "submit", true)).toBeNull();
      expect(checkScalar(modeCol, "Full-Time", "submit", true)).toBeNull();
      expect(checkScalar(modeCol, "Part-Time", "submit", true)).toBeNull();
      expect(checkScalar(modeCol, "Distance", "submit", true)).toBeNull();
    });

    it("rejects invalid dropdown choices", () => {
      expect(checkScalar(classCol, "InvalidClass", "submit", true)).toBe("Class has an invalid choice");
      expect(checkScalar(modeCol, "Online", "submit", true)).toBe("Mode of study has an invalid choice");
    });

    it("rejects empty values on submit mode", () => {
      expect(checkScalar(cgpaCol, null, "submit", true)).toBe("(CGPA/Marks) is required");
      expect(checkScalar(cgpaCol, "", "submit", true)).toBe("(CGPA/Marks) is required");
      expect(checkScalar(classCol, null, "submit", true)).toBe("Class is required");
      expect(checkScalar(classCol, "", "submit", true)).toBe("Class is required");
      expect(checkScalar(modeCol, null, "submit", true)).toBe("Mode of study is required");
      expect(checkScalar(modeCol, "", "submit", true)).toBe("Mode of study is required");
    });

    it("allows empty values in draft mode", () => {
      expect(checkScalar(cgpaCol, null, "draft", false)).toBeNull();
      expect(checkScalar(cgpaCol, "", "draft", false)).toBeNull();
      expect(checkScalar(classCol, null, "draft", false)).toBeNull();
      expect(checkScalar(classCol, "", "draft", false)).toBeNull();
      expect(checkScalar(modeCol, null, "draft", false)).toBeNull();
      expect(checkScalar(modeCol, "", "draft", false)).toBeNull();
    });

    it("validates full answer submission requiring class, (CGPA/Marks), and modeOfStudy", () => {
      const validRow = {
        degree: "B.E.",
        university: "Anna University",
        institution: "PSG Tech",
        class: "First with Distinction",
        cgpaOrMarks: "85%",
        modeOfStudy: "Full-Time",
        monthYearOfPassing: "2015-05",
        attempts: 1,
        documentId: "doc-sample-123",
      };

      const issuesValid = validateAnswers(def, { academicQualifications: [validRow] }, "submit");
      expect(issuesValid.some((i) => i.path.includes("cgpaOrMarks"))).toBe(false);
      expect(issuesValid.some((i) => i.path.includes("class"))).toBe(false);
      expect(issuesValid.some((i) => i.path.includes("modeOfStudy"))).toBe(false);

      const issuesWithoutMode = validateAnswers(
        def,
        { academicQualifications: [{ ...validRow, modeOfStudy: null }] },
        "submit",
      );
      expect(issuesWithoutMode.some((i) => i.path.includes("modeOfStudy"))).toBe(true);

      const issuesInvalidClass = validateAnswers(
        def,
        { academicQualifications: [{ ...validRow, class: "Third Class" }] },
        "submit",
      );
      expect(issuesInvalidClass.some((i) => i.path.includes("class"))).toBe(true);
    });
  });
});
