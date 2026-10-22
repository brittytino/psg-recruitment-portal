import { describe, expect, it } from "vitest";
import { findField, getFormDefinition } from "~/modules/forms/registry";
import { INDIAN_RELIGIONS } from "~/modules/forms/religions";
import type { SelectField } from "~/modules/forms/types";
import { checkScalar } from "~/modules/forms/validation";

describe("Religion dropdown and custom input specification", () => {
  it("defines religion as a select with Indian religions and allowOther on Assistant Professor form", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const religion = findField(def, "religion") as SelectField;
    expect(religion).toBeDefined();
    expect(religion.kind).toBe("select");
    expect(religion.allowOther).toBe(true);
    expect(religion.otherOptionValue).toBe("Others");
    expect(religion.options.map((o) => o.value)).toEqual(INDIAN_RELIGIONS.map((o) => o.value));
  });

  it("defines religion as a select with Indian religions and allowOther on Associate Professor form", () => {
    const def = getFormDefinition("ASSOCIATE_PROFESSOR", 1);
    const religion = findField(def, "religion") as SelectField;
    expect(religion).toBeDefined();
    expect(religion.kind).toBe("select");
    expect(religion.allowOther).toBe(true);
    expect(religion.otherOptionValue).toBe("Others");
    expect(religion.options.map((o) => o.value)).toEqual(INDIAN_RELIGIONS.map((o) => o.value));
  });

  it("includes all major Indian religions and Others option", () => {
    const values = INDIAN_RELIGIONS.map((r) => r.value);
    expect(values).toContain("Hindu");
    expect(values).toContain("Muslim");
    expect(values).toContain("Christian");
    expect(values).toContain("Sikh");
    expect(values).toContain("Buddhist");
    expect(values).toContain("Jain");
    expect(values).toContain("Others");
  });

  describe("validation for select field with allowOther", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR", 1);
    const religion = findField(def, "religion") as SelectField;

    it("accepts predefined religion choices", () => {
      expect(checkScalar(religion, "Hindu", "submit", false)).toBeNull();
      expect(checkScalar(religion, "Muslim", "submit", false)).toBeNull();
      expect(checkScalar(religion, "Christian", "submit", false)).toBeNull();
      expect(checkScalar(religion, "Sikh", "submit", false)).toBeNull();
    });

    it("accepts custom typed religion when Others was chosen", () => {
      expect(checkScalar(religion, "Sarna", "submit", false)).toBeNull();
      expect(checkScalar(religion, "Zoroastrian", "submit", false)).toBeNull();
      expect(checkScalar(religion, "Bahá'í", "submit", false)).toBeNull();
    });

    it("requires specifying the religion if Others is submitted without text", () => {
      expect(checkScalar(religion, "Others", "submit", false)).toBe("Please specify your religion");
      // But in draft mode it can be saved
      expect(checkScalar(religion, "Others", "draft", false)).toBeNull();
    });

    it("rejects custom input exceeding maxLength", () => {
      const tooLong = "A".repeat(61);
      expect(checkScalar(religion, tooLong, "submit", false)).toBe(
        "Religion must be at most 60 characters",
      );
    });

    it("allows empty value when field is optional", () => {
      expect(checkScalar(religion, null, "submit", false)).toBeNull();
      expect(checkScalar(religion, "", "submit", false)).toBeNull();
    });
  });
});
