import { describe, expect, it } from "vitest";
import {
  ACADEMIC_DEGREES,
  ACADEMIC_DISCIPLINES,
  COMPETITIVE_EXAMINATIONS,
  CONFERENCE_INDEXING,
  DESIGNATIONS,
  EMPLOYMENT_NATURE,
  EMPLOYMENT_TYPES,
  HSC_MAJOR_STREAMS,
  INDIAN_RELIGIONS,
  INDIAN_STATES,
  JOINING_TIME_OPTIONS,
  JOURNAL_PUBLICATION_TYPES,
  MEMBERSHIP_TYPES,
  MODES_OF_EDUCATION,
  MOTHER_TONGUES,
  NATIONALITIES,
  PATENT_STATUS,
  PHD_STATUS_OPTIONS,
  PROFESSIONAL_BODIES,
  PROJECT_ROLES,
  PROJECT_STATUS,
  QUALIFICATION_CLASSES,
  QUALIFICATION_LEVELS,
  REFERENCE_RELATIONSHIPS,
  RELATIVE_RELATIONSHIPS,
  SCHOOL_BOARDS,
  VACANCY_SOURCES,
} from "~/modules/forms/options";
import { assistantProfessorV2, associateProfessorV2 } from "~/modules/forms/definitions/faculty-v2";
import type { SelectField, TableField } from "~/modules/forms/types";
import { csvCell, parseColumns, parseListQuery } from "~/modules/reporting/applications.server";
import { hasPermission, type RoleGrant } from "~/modules/auth/permissions";

describe("Centralized Structured Options", () => {
  it("provides comprehensive degree categories including school, UG, PG, Ph.D. and Diploma", () => {
    expect(ACADEMIC_DEGREES).toContain("B.E.");
    expect(ACADEMIC_DEGREES).toContain("B.Tech.");
    expect(ACADEMIC_DEGREES).toContain("M.E.");
    expect(ACADEMIC_DEGREES).toContain("M.Tech.");
    expect(ACADEMIC_DEGREES).toContain("Ph.D.");
    expect(ACADEMIC_DEGREES).toContain("M.Phil.");
    expect(ACADEMIC_DEGREES).toContain("Diploma in Engineering");
    expect(ACADEMIC_DEGREES).toContain("Other");

    expect(ACADEMIC_DISCIPLINES).toContain("Computer Science and Engineering");
    expect(ACADEMIC_DISCIPLINES).toContain("Information Technology");

    expect(QUALIFICATION_LEVELS.map((l) => l.value)).toContain("UG");
    expect(QUALIFICATION_LEVELS.map((l) => l.value)).toContain("PG");
  });

  it("supports the required qualification classes", () => {
    expect(QUALIFICATION_CLASSES).toContain("First Class");
    expect(QUALIFICATION_CLASSES).toContain("First Class with Distinction / Honours");
    expect(QUALIFICATION_CLASSES).toContain("Second Class");
    expect(QUALIFICATION_CLASSES).toContain("Other");
  });

  it("supports the required modes of education", () => {
    expect(MODES_OF_EDUCATION).toContain("Full-time");
    expect(MODES_OF_EDUCATION).toContain("Part-time");
    expect(MODES_OF_EDUCATION).toContain("Distance Education");
  });

  it("provides controlled options for employment, research, and publications", () => {
    expect(EMPLOYMENT_NATURE).toContain("Teaching");
    expect(EMPLOYMENT_NATURE).toContain("Industry");
    expect(EMPLOYMENT_NATURE).toContain("Research");

    expect(EMPLOYMENT_TYPES).toContain("Regular");
    expect(EMPLOYMENT_TYPES).toContain("Contract");
    expect(EMPLOYMENT_TYPES).toContain("Ad hoc");

    expect(DESIGNATIONS).toContain("Assistant Professor");
    expect(DESIGNATIONS).toContain("Associate Professor");
    expect(DESIGNATIONS).toContain("Professor");

    expect(JOURNAL_PUBLICATION_TYPES).toContain("SCI / SCIE");
    expect(JOURNAL_PUBLICATION_TYPES).toContain("Scopus");
    expect(JOURNAL_PUBLICATION_TYPES).toContain("Web of Science");
    expect(JOURNAL_PUBLICATION_TYPES).toContain("UGC-CARE");

    expect(CONFERENCE_INDEXING).toContain("Scopus");
    expect(CONFERENCE_INDEXING).toContain("IEEE Xplore");

    expect(PROJECT_ROLES).toContain("Principal Investigator");
    expect(PROJECT_ROLES).toContain("Co-Investigator");

    expect(PROJECT_STATUS).toContain("Ongoing");
    expect(PROJECT_STATUS).toContain("Completed");

    expect(PATENT_STATUS).toContain("Filed");
    expect(PATENT_STATUS).toContain("Published");
    expect(PATENT_STATUS).toContain("Granted");

    expect(PHD_STATUS_OPTIONS).toContain("Awarded");
    expect(PHD_STATUS_OPTIONS).toContain("Thesis submitted");

    expect(COMPETITIVE_EXAMINATIONS).toContain("GATE");
    expect(COMPETITIVE_EXAMINATIONS).toContain("UGC-NET");

    expect(PROFESSIONAL_BODIES).toContain("IEEE");
    expect(PROFESSIONAL_BODIES).toContain("ACM");

    expect(MEMBERSHIP_TYPES).toContain("Life Member");
    expect(MEMBERSHIP_TYPES).toContain("Senior Member");
  });

  it("provides institutional recruitment vacancy sources and personal options", () => {
    expect(VACANCY_SOURCES).toContain("The Hindu newspaper");
    expect(VACANCY_SOURCES).toContain("Naukri.com");
    expect(VACANCY_SOURCES).toContain("College website");
    expect(VACANCY_SOURCES).toContain("Known source");
    expect(VACANCY_SOURCES).toContain("Other");

    expect(JOINING_TIME_OPTIONS).toContain("Immediate");
    expect(JOINING_TIME_OPTIONS).toContain("1 month");

    expect(SCHOOL_BOARDS).toContain("State Board (Tamil Nadu)");
    expect(SCHOOL_BOARDS).toContain("CBSE (Central Board of Secondary Education)");
    expect(HSC_MAJOR_STREAMS).toContain("Mathematics, Physics, Chemistry, Computer Science");

    expect(INDIAN_RELIGIONS.map((r) => r.value)).toContain("Hindu");
    expect(INDIAN_STATES).toContain("Tamil Nadu");
    expect(MOTHER_TONGUES).toContain("Tamil");
    expect(NATIONALITIES).toContain("Indian");

    expect(RELATIVE_RELATIONSHIPS).toContain("Spouse");
    expect(REFERENCE_RELATIONSHIPS).toContain("Head of Department");

    expect(associateProfessorV2.code).toBe("ASSOCIATE_PROFESSOR");
  });
});

describe("Structured Form Field Definitions in Faculty V2", () => {
  it("configures personal, school, and college dropdowns with other support", () => {
    const personalSec = assistantProfessorV2.sections.find((s) => s.id === "personal")!;
    const stateField = personalSec.fields.find((f) => f.key === "state") as SelectField;
    expect(stateField.kind).toBe("select");
    expect(stateField.allowOther).toBe(true);

    const schoolSec = assistantProfessorV2.sections.find((s) => s.id === "school")!;
    const sslcBoard = schoolSec.fields.find((f) => f.key === "sslcBoard") as SelectField;
    expect(sslcBoard.kind).toBe("select");
    expect(sslcBoard.allowOther).toBe(true);

    const collegeSec = assistantProfessorV2.sections.find((s) => s.id === "college")!;
    const collegeTable = collegeSec.fields.find((f) => f.key === "collegeQualifications") as TableField;
    expect(collegeTable.kind).toBe("table");

    const degreeCol = collegeTable.columns.find((c) => c.key === "degree") as SelectField;
    expect(degreeCol.kind).toBe("select");
    expect(degreeCol.allowOther).toBe(true);

    const specialisationCol = collegeTable.columns.find((c) => c.key === "specialisation") as SelectField;
    expect(specialisationCol.kind).toBe("select");
    expect(specialisationCol.allowOther).toBe(true);

    const classCol = collegeTable.columns.find((c) => c.key === "classAwarded") as SelectField;
    expect(classCol.kind).toBe("select");
    expect(classCol.allowOther).toBe(true);
  });

  it("configures experience, publications, projects, and memberships with structured selectors", () => {
    const expSec = assistantProfessorV2.sections.find((s) => s.id === "experience")!;
    const expTable = expSec.fields.find((f) => f.key === "experience") as TableField;
    const desigCol = expTable.columns.find((c) => c.key === "designation") as SelectField;
    expect(desigCol.kind).toBe("select");
    expect(desigCol.allowOther).toBe(true);

    const natureCol = expTable.columns.find((c) => c.key === "nature") as SelectField;
    expect(natureCol.kind).toBe("select");

    const pubSec = assistantProfessorV2.sections.find((s) => s.id === "publications")!;
    const journalTable = pubSec.fields.find((f) => f.key === "journalPapers") as TableField;
    const pubTypeCol = journalTable.columns.find((c) => c.key === "publicationType") as SelectField;
    expect(pubTypeCol.kind).toBe("select");
    expect(pubTypeCol.allowOther).toBe(true);

    const projSec = assistantProfessorV2.sections.find((s) => s.id === "projects")!;
    const projTable = projSec.fields.find((f) => f.key === "researchProjects") as TableField;
    const roleCol = projTable.columns.find((c) => c.key === "role") as SelectField;
    expect(roleCol.kind).toBe("select");
    expect(roleCol.allowOther).toBe(true);

    const memSec = assistantProfessorV2.sections.find((s) => s.id === "memberships")!;
    const memTable = memSec.fields.find((f) => f.key === "memberships") as TableField;
    const bodyCol = memTable.columns.find((c) => c.key === "body") as SelectField;
    expect(bodyCol.kind).toBe("select");
    expect(bodyCol.allowOther).toBe(true);
  });
});

describe("Candidate Filtering and Query Parsing", () => {
  it("correctly parses multi-criteria filter parameters", () => {
    const url = new URL(
      "http://localhost:3000/staff?q=sharma&position=ASSISTANT_PROFESSOR&status=SUBMITTED&phd=awarded&exam=GATE&minExp=3&page=2&size=50&sort=-submittedAt",
    );
    const q = parseListQuery(url);
    expect(q.q).toBe("sharma");
    expect(q.position).toBe("ASSISTANT_PROFESSOR");
    expect(q.status).toBe("SUBMITTED");
    expect(q.phd).toBe("awarded");
    expect(q.exam).toBe("GATE");
    expect(q.minExp).toBe(3);
    expect(q.page).toBe(2);
    expect(q.size).toBe(50);
    expect(q.sort).toBe("-submittedAt");
  });

  it("handles empty or invalid filter parameters gracefully", () => {
    const url = new URL("http://localhost:3000/staff?position=INVALID&minExp=invalid&page=-5");
    const q = parseListQuery(url);
    expect(q.position).toBeUndefined();
    expect(q.minExp).toBeUndefined();
    expect(q.page).toBe(1);
  });

  it("extracts selected row IDs for selective export", () => {
    const url = new URL("http://localhost:3000/staff/export?ids=id1&ids=id2&ids=id3");
    const selectedIds = url.searchParams.getAll("ids").filter(Boolean);
    expect(selectedIds).toEqual(["id1", "id2", "id3"]);
  });
});

describe("CSV Export and Formula Injection Defense", () => {
  it("escapes special characters and prevents CSV injection", () => {
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("+919876543210")).toBe('"\'+919876543210"');
    expect(csvCell("-100")).toBe('"\'-100"');
    expect(csvCell("@username")).toBe('"\'@username"');
    expect(csvCell("\tcmd")).toBe('"\'\tcmd"');
    expect(csvCell("\rcmd")).toBe('"\'\rcmd"');
    expect(csvCell("John Doe")).toBe('"John Doe"');
    expect(csvCell('He said "Hello"')).toBe('"He said ""Hello"""');
  });

  it("permits selection of valid export columns and ignores unknown columns", () => {
    const valid = parseColumns([
      "sNo",
      "candidateName",
      "department",
      "appliedFor",
      "status",
      "phdStatus",
      "hIndex",
    ]);
    expect(valid).toEqual([
      "sNo",
      "candidateName",
      "department",
      "appliedFor",
      "status",
      "phdStatus",
      "hIndex",
    ]);

    const withMalicious = parseColumns(["candidateName", "hackCol", "password"]);
    expect(withMalicious).toEqual(["candidateName"]);
  });
});

describe("Role-Based Access Control and Isolation", () => {
  const g = (role: RoleGrant["role"]): RoleGrant[] => [{ role, departmentId: null }];

  it("guarantees Super Admin holds all system, user, and audit permissions", () => {
    const superAdmin = g("SUPER_ADMIN");
    expect(hasPermission(superAdmin, "user:manage")).toBe(true);
    expect(hasPermission(superAdmin, "settings:manage")).toBe(true);
    expect(hasPermission(superAdmin, "audit:read")).toBe(true);
    expect(hasPermission(superAdmin, "position:approve")).toBe(true);
    expect(hasPermission(superAdmin, "recruitment:manage")).toBe(true);
    expect(hasPermission(superAdmin, "application:assign")).toBe(true);
    expect(hasPermission(superAdmin, "application:export")).toBe(true);
  });

  it("guarantees Principal and Dean have assignment and recruitment management privileges without user management", () => {
    const dean = g("ADMIN");
    expect(hasPermission(dean, "application:assign")).toBe(true);
    expect(hasPermission(dean, "position:approve")).toBe(true);
    expect(hasPermission(dean, "recruitment:manage")).toBe(true);
    expect(hasPermission(dean, "user:manage")).toBe(false);
    expect(hasPermission(dean, "audit:read")).toBe(false);
  });

  it("strictly enforces HOD review boundaries", () => {
    const hod = g("HOD");
    expect(hasPermission(hod, "review:record")).toBe(true);
    expect(hasPermission(hod, "application:list")).toBe(true);
    expect(hasPermission(hod, "application:export")).toBe(false);
    expect(hasPermission(hod, "application:assign")).toBe(false);
    expect(hasPermission(hod, "user:manage")).toBe(false);
  });
});
