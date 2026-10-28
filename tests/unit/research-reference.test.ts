import { describe, expect, it } from "vitest";
import {
  formatResearchReference,
  RESEARCH_REFERENCE,
  parseResearchReference,
} from "~/modules/applications/reference";

describe("Research reference numbers", () => {
  it("formats reference number with PSGCT, academic year, RA_, and 4-digit sequence", () => {
    expect(formatResearchReference("2026-27", 1)).toBe("PSGCT2026-27RA_0001");
    expect(formatResearchReference("2026-27", 42)).toBe("PSGCT2026-27RA_0042");
    expect(formatResearchReference("2026-27", 9999)).toBe("PSGCT2026-27RA_9999");
  });

  it("matches RESEARCH_REFERENCE regex correctly", () => {
    expect(RESEARCH_REFERENCE.test("PSGCT2026-27RA_0001")).toBe(true);
    expect(RESEARCH_REFERENCE.test("PSGCT2025-26RA_0123")).toBe(true);
    // Faculty references should not match
    expect(RESEARCH_REFERENCE.test("PSGCT2026-27CSE_0001")).toBe(false);
    expect(RESEARCH_REFERENCE.test("PSGCT2026-27_0001")).toBe(false);
    expect(RESEARCH_REFERENCE.test("invalid")).toBe(false);
  });

  it("parses valid research reference numbers into year and sequence", () => {
    const parsed = parseResearchReference("PSGCT2026-27RA_0042");
    expect(parsed).toEqual({
      academicYear: "2026-27",
      sequence: 42,
    });
  });

  it("returns null when parsing invalid references", () => {
    expect(parseResearchReference("PSGCT2026-27CSE_0001")).toBeNull();
    expect(parseResearchReference("not-a-reference")).toBeNull();
  });
});
