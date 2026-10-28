import { describe, expect, it } from "vitest";
import { researchApplicationV1 } from "~/modules/forms/definitions/research-application";
import { computeDerived, uploadRequired, validateAnswers } from "~/modules/forms/validation";

describe("Research Application Form (V1)", () => {
  it("has correct metadata and 11 distinct sections", () => {
    expect(researchApplicationV1.code).toBe("RESEARCH_APPLICATION");
    expect(researchApplicationV1.version).toBe(1);
    expect(researchApplicationV1.renderer).toBe("pdf");
    expect(researchApplicationV1.sections.length).toBe(11);

    const sectionTitles = researchApplicationV1.sections.map((s) => s.title);
    expect(sectionTitles).toContain("Position and research area");
    expect(sectionTitles).toContain("Personal details");
    expect(sectionTitles).toContain("Research background & skills");
    expect(sectionTitles).toContain("Publications & patents");
    expect(sectionTitles).toContain("Declaration");
  });

  it("computes derived context correctly including specialisation, post, and age", () => {
    const derived = computeDerived(
      researchApplicationV1,
      {
        name: "DR. RAMANUJAN",
        dateOfBirth: "2000-01-01",
      },
      {
        department: "",
        specialisation: "Robotics & Autonomous Systems",
        position: "Research Assistant",
        asOf: "2026-10-28",
      },
    );

    expect(derived.specialisation).toBe("Robotics & Autonomous Systems");
    expect(derived.appliedPost).toBe("Research Assistant");
    expect(derived.age).toBeDefined();
    expect(Number(derived.age)).toBeGreaterThanOrEqual(24);
  });

  it("requires personal details, research statements, and declaration on submit", () => {
    const issues = validateAnswers(researchApplicationV1, {}, "submit");
    const paths = issues.map((i) => i.path);

    expect(paths).toContain("salutation");
    expect(paths).toContain("name");
    expect(paths).toContain("dateOfBirth");
    expect(paths).toContain("statementOfPurpose");
    expect(paths).toContain("technicalSkills");
    expect(paths).toContain("place");
  });

  it("validates references count and details", () => {
    const validRef = {
      name: "Prof. Einstein",
      designation: "Professor",
      organisation: "PSG Tech",
      mobile: "9876543210",
      email: "einstein@psgtech.ac.in",
      relationship: "Guide",
    };

    const emptyRefIssues = validateAnswers(researchApplicationV1, { references: [] }, "submit").filter(
      (i) => i.path === "references",
    );
    expect(emptyRefIssues.length).toBeGreaterThan(0);

    const oneRefIssues = validateAnswers(researchApplicationV1, { references: [validRef] }, "submit").filter(
      (i) => i.path.startsWith("references"),
    );
    expect(oneRefIssues.length).toBe(0);

    const invalidMobileRef = {
      ...validRef,
      mobile: "1234",
    };
    const badMobileIssues = validateAnswers(
      researchApplicationV1,
      { references: [invalidMobileRef] },
      "submit",
    ).filter((i) => i.path.startsWith("references"));
    expect(badMobileIssues.some((i) => i.path.includes("mobile"))).toBe(true);
  });

  it("determines mandatory vs optional upload groups correctly", () => {
    const uploads = researchApplicationV1.uploads ?? [];
    const photoGroup = uploads.find((u) => u.id === "photo");
    expect(photoGroup).toBeDefined();
    expect(uploadRequired(photoGroup!, {})).toBe(true);

    const sigGroup = uploads.find((u) => u.id === "signature");
    expect(sigGroup).toBeDefined();
    expect(uploadRequired(sigGroup!, {})).toBe(true);

    const resumeGroup = uploads.find((u) => u.id === "resume");
    expect(resumeGroup).toBeDefined();
    expect(uploadRequired(resumeGroup!, {})).toBe(true);

    const qualGroup = uploads.find((u) => u.id === "qualifications");
    expect(qualGroup).toBeDefined();
    expect(uploadRequired(qualGroup!, {})).toBe(true);

    const pubGroup = uploads.find((u) => u.id === "publications");
    expect(pubGroup).toBeDefined();
    expect(uploadRequired(pubGroup!, {})).toBe(false);
  });
});
