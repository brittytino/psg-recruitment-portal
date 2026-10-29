import { describe, expect, it } from "vitest";
import { academicYearOf, formatReference, referenceDeptCode } from "~/modules/applications/reference";
import { findTransition } from "~/modules/applications/workflow";
import { codeHash, generateCode } from "~/modules/auth/otp.server";
import { hasPermission, homePath, type RoleGrant } from "~/modules/auth/permissions";
import { assistantProfessorV2, associateProfessorV2 } from "~/modules/forms/definitions/faculty-v2";
import {
  formatYearsMonths,
  overlappingPeriods,
  periodDuration,
  totalDuration,
} from "~/modules/forms/experience";
import type { Answers } from "~/modules/forms/types";
import { computeDerived, uploadRequired, validateAnswers } from "~/modules/forms/validation";
import { csvCell, parseColumns } from "~/modules/reporting/applications.server";
import { allowedChanges, isAllowedChange } from "~/modules/reviews/position-policy";

process.env.SESSION_SECRET ??= "unit-test-secret-at-least-32-characters-long";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://x";
process.env.REDIS_URL ??= "redis://x";
process.env.STORAGE_DIR ??= "./storage-test";
process.env.CONVERTER_URL ??= "http://localhost:1";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.MAIL_FROM ??= "Test <t@localhost>";

const TODAY = "2026-10-22";

describe("experience duration", () => {
  it("counts whole months with an inclusive end date", () => {
    expect(periodDuration({ from: "2020-06-01", to: "2023-05-31" }, TODAY)).toMatchObject({
      years: 3,
      months: 0,
    });
    expect(periodDuration({ from: "2021-01-15", to: "2021-03-14" }, TODAY)).toMatchObject({ totalMonths: 2 });
    expect(periodDuration({ from: "2021-01-15", to: "2021-03-13" }, TODAY)).toMatchObject({ totalMonths: 1 });
  });
  it("handles leap years and month ends", () => {
    expect(periodDuration({ from: "2020-02-29", to: "2021-02-28" }, TODAY)).toMatchObject({
      years: 1,
      months: 0,
    });
    expect(periodDuration({ from: "2019-01-31", to: "2019-02-28" }, TODAY)).toMatchObject({ totalMonths: 1 });
  });
  it("uses today for a current position and rejects reversed dates", () => {
    expect(periodDuration({ from: "2025-10-22", to: null }, TODAY)).toMatchObject({ years: 1, months: 0 });
    expect(periodDuration({ from: "2024-01-01", to: "2023-01-01" }, TODAY)).toBeNull();
  });
  it("merges overlapping periods in totals", () => {
    const periods = [
      { from: "2018-01-01", to: "2019-12-31" },
      { from: "2019-07-01", to: "2020-12-31" },
    ];
    expect(totalDuration(periods, TODAY)).toMatchObject({ years: 3, months: 0 });
    expect(overlappingPeriods(periods, TODAY)).toEqual([0, 1]);
  });
  it("clips totals to a start date (experience after PG)", () => {
    expect(totalDuration([{ from: "2015-01-01", to: "2020-12-31" }], TODAY, "2018-01-01")).toMatchObject({
      years: 3,
    });
  });
  it("formats years and months", () => {
    expect(formatYearsMonths({ years: 3, months: 7, totalMonths: 43 })).toBe("3 years 7 months");
    expect(formatYearsMonths({ years: 1, months: 0, totalMonths: 12 })).toBe("1 year");
    expect(formatYearsMonths({ years: 0, months: 0, totalMonths: 0 })).toBe("0 months");
  });
});

describe("reference numbers", () => {
  it("uses the June–May academic year in IST", () => {
    expect(academicYearOf(new Date("2026-06-01T00:00:00+05:30"))).toBe("2026-27");
    expect(academicYearOf(new Date("2027-05-31T23:00:00+05:30"))).toBe("2026-27");
    expect(academicYearOf(new Date("2026-05-31T12:00:00+05:30"))).toBe("2025-26");
    expect(academicYearOf(new Date("2099-07-01T00:00:00Z"))).toBe("2099-00");
  });
  it("formats PSGCT<year><DEPT>_<NNNN>", () => {
    expect(formatReference("2026-27", "CSE", 1)).toBe("PSGCT2026-27CSE_0001");
    expect(formatReference("2026-27", "demo-ece", 42)).toBe("PSGCT2026-27DEMOECE_0042");
    expect(referenceDeptCode("--")).toBe("GEN");
  });
});

describe("position-change policy", () => {
  it("allows only recommendations to a lower cadre", () => {
    expect(isAllowedChange("ASSOCIATE_PROFESSOR", "ASSISTANT_PROFESSOR")).toBe(true);
    expect(isAllowedChange("PROFESSOR", "ASSOCIATE_PROFESSOR")).toBe(true);
    expect(isAllowedChange("ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR")).toBe(false);
    expect(isAllowedChange("ASSOCIATE_PROFESSOR", "PROFESSOR")).toBe(false);
    expect(allowedChanges("ASSISTANT_PROFESSOR")).toEqual([]);
  });
});

describe("roles", () => {
  const g = (role: RoleGrant["role"]): RoleGrant[] => [{ role, departmentId: null }];
  it("gives HODs review but not export, user management or position approval", () => {
    expect(hasPermission(g("HOD"), "review:record")).toBe(true);
    expect(hasPermission(g("HOD"), "application:export")).toBe(false);
    expect(hasPermission(g("HOD"), "user:manage")).toBe(false);
    expect(hasPermission(g("HOD"), "position:approve")).toBe(false);
  });
  it("gives HR job profiles and exports but not user management", () => {
    expect(hasPermission(g("HR"), "recruitment:manage")).toBe(true);
    expect(hasPermission(g("HR"), "application:export")).toBe(true);
    expect(hasPermission(g("HR"), "user:manage")).toBe(false);
  });
  it("gives Admin operational recruitment control and Super Admin full control", () => {
    expect(hasPermission(g("ADMIN"), "position:approve")).toBe(true);
    expect(hasPermission(g("ADMIN"), "application:assign")).toBe(true);
    expect(hasPermission(g("ADMIN"), "user:manage")).toBe(false);
    expect(hasPermission(g("ADMIN"), "settings:manage")).toBe(false);
    expect(hasPermission(g("ADMIN"), "audit:read")).toBe(false);

    for (const p of [
      "user:manage",
      "settings:manage",
      "position:approve",
      "audit:read",
      "system:manage",
    ] as const)
      expect(hasPermission(g("SUPER_ADMIN"), p)).toBe(true);
  });
  it("sends each role to its home page", () => {
    expect(homePath(g("HOD"))).toBe("/staff/review");
    expect(homePath(g("HR"))).toBe("/staff");
    expect(homePath(g("CANDIDATE"))).toBe("/account");
  });
});

describe("workflow", () => {
  it("lets the office act on HOD outcomes but not shortlist a rejected application", () => {
    expect(findTransition("HOD_ACCEPTED", "SHORTLISTED", "hr")).toBeDefined();
    expect(findTransition("HOD_RECOMMENDED_CHANGE", "SHORTLISTED", "hr")?.requires).toBe("positionDecided");
    expect(findTransition("HOD_REJECTED", "SHORTLISTED", "hr")).toBeUndefined();
    expect(findTransition("ASSIGNED_TO_HOD", "WITHDRAWN", "candidate")?.reasonRequired).toBe(true);
  });
});

describe("e-mail OTP", () => {
  it("generates 6-digit codes and binds the hash to the challenge", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(codeHash("a", "123456")).not.toBe(codeHash("b", "123456"));
    expect(codeHash("a", "123456")).toBe(codeHash("a", "123456"));
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+1234")).toBe(`"'+1234"`);
    expect(csvCell("-5")).toBe(`"'-5"`);
    expect(csvCell("@SUM(A1:A5)")).toBe(`"'@SUM(A1:A5)"`);
    expect(csvCell("\tcmd")).toBe(`"'\tcmd"`);
    expect(csvCell("\rcmd")).toBe(`"'\rcmd"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell("Normal Safe Text")).toBe('"Normal Safe Text"');
  });
  it("keeps only known columns and falls back to the summary columns", () => {
    expect(parseColumns(["candidateName", "nope"])).toEqual(["candidateName"]);
    expect(parseColumns([])).toEqual(["sNo", "candidateName", "department", "appliedFor", "status"]);
  });
});

describe("v2 application form", () => {
  const ref = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Ref ${i}`,
      designation: "Professor",
      organisation: "PSG",
      mobile: "9876543210",
      email: null,
      relationship: null,
    }));
  const refIssues = (n: number) =>
    validateAnswers(assistantProfessorV2, { references: ref(n) }, "submit").filter(
      (i) => i.path === "references",
    );
  it("requires one or two references", () => {
    expect(refIssues(0).length).toBe(1);
    expect(refIssues(1).length).toBe(0);
    expect(refIssues(2).length).toBe(0);
    expect(refIssues(3)[0]?.message).toMatch(/at most 2/);
  });
  it("validates Indian mobile numbers on references", () => {
    const bad = [{ ...ref(1)[0], mobile: "12345" }];
    const issues = validateAnswers(assistantProfessorV2, { references: bad }, "submit");
    expect(issues.some((i) => i.path === "references.0.mobile")).toBe(true);
  });
  it("ignores hidden conditional fields and requires them when shown", () => {
    const base: Answers = { maritalStatus: "Unmarried" };
    expect(
      validateAnswers(assistantProfessorV2, base, "submit").some((i) => i.path === "spouseNameOccupation"),
    ).toBe(false);
    expect(
      validateAnswers(assistantProfessorV2, { maritalStatus: "Married" }, "submit").some(
        (i) => i.path === "spouseNameOccupation",
      ),
    ).toBe(true);
  });
  it("requires UG and PG degrees and checks CGPA range", () => {
    const issues = validateAnswers(
      assistantProfessorV2,
      { collegeQualifications: [{ level: "UG", scoreType: "CGPA (out of 10)", score: 12 }] },
      "submit",
    );
    expect(issues.some((i) => i.message === "Add a post-graduate (PG) degree")).toBe(true);
    expect(issues.some((i) => i.path === "collegeQualifications.0.score")).toBe(true);
  });
  it("does not ask for a To date or reason for a current position", () => {
    const issues = validateAnswers(
      assistantProfessorV2,
      {
        experience: [
          {
            institution: "X",
            designation: "AP",
            nature: "Teaching",
            from: "2020-01-01",
            isCurrent: "Yes",
            serviceCertificate: "No",
          },
        ],
      },
      "submit",
    );
    expect(
      issues.some((i) => i.path === "experience.0.to" || i.path === "experience.0.reasonForLeaving"),
    ).toBe(false);
  });
  it("computes experience totals and diploma count", () => {
    const d = computeDerived(
      associateProfessorV2,
      {
        experience: [
          { from: "2016-07-01", to: "2019-06-30", isCurrent: "No", nature: "Industry" },
          { from: "2019-07-01", isCurrent: "Yes", nature: "Teaching" },
        ],
        collegeQualifications: [{ level: "PG", monthYear: "2018-05" }, { level: "DIPLOMA" }],
      },
      { department: "CSE", position: "Associate Professor", asOf: TODAY },
    );
    expect(d.industryExperience).toBe("3 years");
    expect(d.totalExperience).toBe("10 years 3 months");
    expect(d.experienceAfterPg).toBe("8 years 5 months");
    expect(d.othersCount).toBe(1);
  });
  it("makes photograph, signature and resume mandatory and the rest conditional", () => {
    const g = (id: string) => assistantProfessorV2.uploads!.find((u) => u.id === id)!;
    for (const id of ["photo", "signature", "resume"]) expect(uploadRequired(g(id), {})).toBe(true);
    expect(uploadRequired(g("salary"), {})).toBe(false);
    expect(uploadRequired(g("salary"), { experience: [{}] })).toBe(true);
    expect(uploadRequired(g("service"), { currentlyEmployed: "Yes" })).toBe(true);
    expect(uploadRequired(g("memberships"), {})).toBe(false);
  });
  it("keeps every v1 field key in the v2 forms", async () => {
    const { assistantProfessorV1 } = await import("~/modules/forms/definitions/assistant-professor");
    const { associateProfessorV1 } = await import("~/modules/forms/definitions/associate-professor");
    const v2Keys = new Set(associateProfessorV2.sections.flatMap((s) => s.fields.map((f) => f.key)));
    // v1 keys whose data now lives in a richer v2 structure.
    const replaced: Record<string, string> = {
      academicQualifications: "collegeQualifications",
      educationalQualifications: "collegeQualifications",
      specialisation: "collegeQualifications",
      qualificationsSummary: "collegeQualifications",
      addressType: "presentDoorNo",
      address: "presentStreet",
      phone: "mobile",
      email: "email",
      jobsHeld: "experience",
      publications: "journalPapers",
      internationalJournals: "journalPapers",
      nationalJournals: "journalPapers",
      reference1: "references",
      reference2: "references",
      books: "booksPublished",
      summerPrograms: "conferenceParticipation",
      conferencePapers: "conferencePapers",
      labDevelopment: "labModels",
      sponsoredResearch: "researchProjects",
      tours: "mentorship",
      awardsPatents: "patents",
      communityCategory: "community",
      station: "place",
    };
    for (const def of [assistantProfessorV1, associateProfessorV1])
      for (const f of def.sections.flatMap((s) => s.fields)) {
        const key = replaced[f.key] ?? f.key;
        expect(v2Keys.has(key), `${def.code} v1 field ${f.key}`).toBe(true);
      }
  });
});
