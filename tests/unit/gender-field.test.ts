import { describe, expect, it } from "vitest";
import { findField, getFormDefinition } from "~/modules/forms/registry";
import type { SelectField } from "~/modules/forms/types";
import { checkScalar } from "~/modules/forms/validation";

describe("Gender dropdown specification (M, F)", () => {
  it("defines gender as a select dropdown with M and F options on Assistant Professor form", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const gender = findField(def, "gender") as SelectField;
    expect(gender).toBeDefined();
    expect(gender.kind).toBe("select");
    expect(gender.requirement).toBe("required");
    expect(gender.options).toEqual([
      { value: "M", label: "M" },
      { value: "F", label: "F" },
    ]);
  });

  it("defines gender as a select dropdown with M and F options on Associate Professor form", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const gender = findField(def, "gender") as SelectField;
    expect(gender).toBeDefined();
    expect(gender.kind).toBe("select");
    expect(gender.requirement).toBe("required");
    expect(gender.options).toEqual([
      { value: "M", label: "M" },
      { value: "F", label: "F" },
    ]);
  });

  describe("validation for gender dropdown", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const gender = findField(def, "gender") as SelectField;

    it("accepts valid M and F choices", () => {
      expect(checkScalar(gender, "M", "submit", true)).toBeNull();
      expect(checkScalar(gender, "F", "submit", true)).toBeNull();
      expect(checkScalar(gender, "M", "draft", false)).toBeNull();
      expect(checkScalar(gender, "F", "draft", false)).toBeNull();
    });

    it("rejects invalid choices", () => {
      expect(checkScalar(gender, "Male", "submit", true)).toBe("Gender has an invalid choice");
      expect(checkScalar(gender, "Female", "submit", true)).toBe("Gender has an invalid choice");
      expect(checkScalar(gender, "Other", "submit", true)).toBe("Gender has an invalid choice");
    });

    it("requires selection on submit", () => {
      expect(checkScalar(gender, null, "submit", true)).toBe("Gender is required");
      expect(checkScalar(gender, "", "submit", true)).toBe("Gender is required");
    });

    it("permits empty selection while in draft mode", () => {
      expect(checkScalar(gender, null, "draft", false)).toBeNull();
      expect(checkScalar(gender, "", "draft", false)).toBeNull();
    });
  });
});
