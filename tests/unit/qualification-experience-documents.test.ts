import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_DOC_TYPES,
  INLINE_ENTRY_DOC_TYPES,
  QUALIFICATION_DOC_TYPES,
  STANDALONE_DOCUMENT_TYPES,
} from "~/modules/documents/policy";
import { assistantProfessorV1 } from "~/modules/forms/definitions/assistant-professor";
import { associateProfessorV1 } from "~/modules/forms/definitions/associate-professor";
import { getFormDefinition } from "~/modules/forms/registry";
import type { TableField } from "~/modules/forms/types";
import { validateAnswers } from "~/modules/forms/validation";
import { assistantMinimal, associateMinimal } from "../fixtures/applications";

describe("Qualification & Experience Documents Policy", () => {
  it("defines qualification and experience document types as inline entry document types", () => {
    expect(QUALIFICATION_DOC_TYPES).toContain("DEGREE_CERTIFICATE");
    expect(QUALIFICATION_DOC_TYPES).toContain("MARK_SHEET");
    expect(QUALIFICATION_DOC_TYPES).toContain("PHD_CERTIFICATE");
    expect(EXPERIENCE_DOC_TYPES).toContain("EXPERIENCE_CERTIFICATE");

    for (const q of QUALIFICATION_DOC_TYPES) {
      expect(INLINE_ENTRY_DOC_TYPES).toContain(q);
    }
    for (const e of EXPERIENCE_DOC_TYPES) {
      expect(INLINE_ENTRY_DOC_TYPES).toContain(e);
    }
  });

  it("removes all qualification and experience document types from standalone document types", () => {
    expect(STANDALONE_DOCUMENT_TYPES).not.toContain("DEGREE_CERTIFICATE");
    expect(STANDALONE_DOCUMENT_TYPES).not.toContain("MARK_SHEET");
    expect(STANDALONE_DOCUMENT_TYPES).not.toContain("PHD_CERTIFICATE");
    expect(STANDALONE_DOCUMENT_TYPES).not.toContain("EXPERIENCE_CERTIFICATE");

    // Retains general standalone documents
    expect(STANDALONE_DOCUMENT_TYPES).toContain("PHOTOGRAPH");
    expect(STANDALONE_DOCUMENT_TYPES).toContain("COMMUNITY_CERTIFICATE");
    expect(STANDALONE_DOCUMENT_TYPES).toContain("SALARY_CERTIFICATE");
    expect(STANDALONE_DOCUMENT_TYPES).toContain("NO_OBJECTION_CERTIFICATE");
    expect(STANDALONE_DOCUMENT_TYPES).toContain("PUBLICATIONS");
    expect(STANDALONE_DOCUMENT_TYPES).toContain("OTHER");
  });
});

describe("Form Definitions Attachment Configuration", () => {
  it("configures inline attachments on Assistant Professor qualifications and experience tables", () => {
    const acad = assistantProfessorV1.sections
      .find((s) => s.id === "academic")
      ?.fields.find((f) => f.key === "academicQualifications") as TableField | undefined;
    expect(acad).toBeDefined();
    expect(acad?.attachment).toBeDefined();
    expect(acad?.attachment?.required).toBe(true);
    expect(acad?.attachment?.docType).toBe("DEGREE_CERTIFICATE");

    const exp = assistantProfessorV1.sections
      .find((s) => s.id === "experience")
      ?.fields.find((f) => f.key === "experience") as TableField | undefined;
    expect(exp).toBeDefined();
    expect(exp?.attachment).toBeDefined();
    expect(exp?.attachment?.required).toBe(true);
    expect(exp?.attachment?.docType).toBe("EXPERIENCE_CERTIFICATE");
  });

  it("configures inline attachments on Associate Professor education and jobs tables", () => {
    const edu = associateProfessorV1.sections
      .find((s) => s.id === "education")
      ?.fields.find((f) => f.key === "educationalQualifications") as TableField | undefined;
    expect(edu).toBeDefined();
    expect(edu?.attachment).toBeDefined();
    expect(edu?.attachment?.required).toBe(true);
    expect(edu?.attachment?.docType).toBe("DEGREE_CERTIFICATE");

    const jobs = associateProfessorV1.sections
      .find((s) => s.id === "jobs")
      ?.fields.find((f) => f.key === "jobsHeld") as TableField | undefined;
    expect(jobs).toBeDefined();
    expect(jobs?.attachment).toBeDefined();
    expect(jobs?.attachment?.required).toBe(true);
    expect(jobs?.attachment?.docType).toBe("EXPERIENCE_CERTIFICATE");
  });
});

describe("Inline Document Attachment Validation", () => {
  const apDef = getFormDefinition("ASSISTANT_PROFESSOR", 1);
  const asDef = getFormDefinition("ASSOCIATE_PROFESSOR", 1);

  it("allows documentId, documentName, documentType in draft mode without unknown column errors", () => {
    const draftAnswers = {
      ...assistantMinimal,
      academicQualifications: [
        {
          degree: "B.E.",
          university: "Anna University",
          institution: "PSG Tech",
          class: "First Class",
          cgpaOrMarks: "80%",
          monthYearOfPassing: "2015-05",
          attempts: 1,
          documentId: "doc-12345",
          documentName: "be-degree.pdf",
          documentType: "DEGREE_CERTIFICATE",
        },
      ],
    };
    const issues = validateAnswers(apDef, draftAnswers, "draft");
    expect(issues.filter((i) => i.path.includes("academicQualifications"))).toEqual([]);
  });

  it("permits draft save without document attached yet", () => {
    const draftWithoutDoc = {
      ...assistantMinimal,
      academicQualifications: [
        {
          degree: "B.E.",
          university: "Anna University",
          institution: "PSG Tech",
          class: "First Class",
          cgpaOrMarks: "80%",
          monthYearOfPassing: "2015-05",
          attempts: 1,
        },
      ],
    };
    const issues = validateAnswers(apDef, draftWithoutDoc, "draft");
    expect(issues.filter((i) => i.path.includes("academicQualifications"))).toEqual([]);
  });

  it("enforces document attachment in submit mode for qualification rows", () => {
    const submitWithoutDoc = {
      ...assistantMinimal,
      academicQualifications: [
        {
          degree: "B.E.",
          university: "Anna University",
          institution: "PSG Tech",
          class: "First Class",
          cgpaOrMarks: "80%",
          monthYearOfPassing: "2015-05",
          attempts: 1,
          documentId: null,
        },
      ],
    };
    const issues = validateAnswers(apDef, submitWithoutDoc, "submit");
    const docIssue = issues.find((i) => i.path === "academicQualifications.0.documentId");
    expect(docIssue).toBeDefined();
    expect(docIssue?.message).toMatch(/Please upload the required Degree certificate/i);
  });

  it("enforces document attachment in submit mode for experience rows", () => {
    const submitWithExpWithoutDoc = {
      ...assistantMinimal,
      academicQualifications: [
        {
          degree: "B.E.",
          university: "Anna University",
          institution: "PSG Tech",
          class: "First Class",
          cgpaOrMarks: "80%",
          monthYearOfPassing: "2015-05",
          attempts: 1,
          documentId: "valid-doc-id",
        },
      ],
      experience: [
        {
          post: "Assistant Professor",
          employer: "PSG Tech",
          from: "2018-06-01",
          to: "2024-05-31",
          nature: "Teaching",
          documentId: "",
        },
      ],
    };
    const issues = validateAnswers(apDef, submitWithExpWithoutDoc, "submit");
    const expIssue = issues.find((i) => i.path === "experience.0.documentId");
    expect(expIssue).toBeDefined();
    expect(expIssue?.message).toMatch(/Please upload the required Experience certificate/i);
  });

  it("passes submit validation when all qualification and experience entries have documents", () => {
    const validSubmit = {
      ...assistantMinimal,
      academicQualifications: [
        {
          degree: "B.E.",
          university: "Anna University",
          institution: "PSG Tech",
          class: "First Class",
          cgpaOrMarks: "80%",
          monthYearOfPassing: "2015-05",
          attempts: 1,
          documentId: "doc-qual-123",
          documentName: "degree.pdf",
        },
      ],
      experience: [
        {
          post: "Assistant Professor",
          employer: "PSG Tech",
          from: "2018-06-01",
          to: "2024-05-31",
          nature: "Teaching",
          documentId: "doc-exp-456",
          documentName: "exp.pdf",
        },
      ],
    };
    const issues = validateAnswers(apDef, validSubmit, "submit");
    const tableIssues = issues.filter(
      (i) => i.path.startsWith("academicQualifications") || i.path.startsWith("experience"),
    );
    expect(tableIssues).toEqual([]);
  });

  it("enforces document attachment in submit mode for Associate Professor educational qualifications", () => {
    const submitWithoutDoc = {
      ...associateMinimal,
      educationalQualifications: [
        {
          level: "UG",
          degree: "B.E.",
          monthYear: "2003-04",
          college: "Example College",
          university: "Example University",
          class: "First Class",
          cgpaOrMarks: "78%",
          attempts: 1,
          documentId: null,
        },
      ],
    };
    const issues = validateAnswers(asDef, submitWithoutDoc, "submit");
    const docIssue = issues.find((i) => i.path === "educationalQualifications.0.documentId");
    expect(docIssue).toBeDefined();
    expect(docIssue?.message).toMatch(/Please upload the required Degree \/ Provisional certificate/i);
  });
});
