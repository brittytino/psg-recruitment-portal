import { date, derived, monthYear, num, select, table, text, textarea } from "../builders";
import { INDIAN_RELIGIONS } from "../religions";
import type { FormDefinition } from "../types";

/**
 * APPLICATION for the post of ASSISTANT PROFESSOR — template version 1.
 * Source: source-documents/APPLICATION for the post of ASSISTANT PROFESSOR.docx
 * (SHA-256 65e9419ac0eaed97dc0eefc383831f21257a52030e74f1088796ecd34790d30e), A4, 2 pages.
 */
export const assistantProfessorV1: FormDefinition = {
  code: "ASSISTANT_PROFESSOR",
  version: 1,
  title: "APPLICATION for the post of ASSISTANT PROFESSOR",
  sourceDocument: "source-documents/APPLICATION for the post of ASSISTANT PROFESSOR.docx",
  templatePath: "templates/assistant-professor/v1.docx",
  sourcePageCount: 2,
  sections: [
    {
      id: "post",
      title: "Post and department",
      sourceHeading: "APPLICATION for the post of ASSISTANT PROFESSOR - DEPARTMENT OF",
      pages: [1],
      description: "The department is taken from the vacancy you are applying for.",
      fields: [
        derived(
          "department",
          "Department of",
          1,
          "DEPARTMENT OF _____________________",
          "vacancy.department",
        ),
      ],
    },
    {
      id: "personal",
      title: "Personal details",
      sourceHeading: "1. – 5.",
      pages: [1],
      fields: [
        select("salutation", "Title", 1, "(Dr. / Mrs. / Ms./ Mr.)", ["Dr.", "Mrs.", "Ms.", "Mr."], {
          requirement: "required",
        }),
        text("name", "Name (in block letters)", 1, "1.  NAME (In Block Letters)", {
          requirement: "required",
          uppercase: true,
          maxLength: 120,
        }),
        select("addressType", "Address type", 1, "(Permanent / Present)", ["Permanent", "Present"], {
          requirement: "required",
          help: "The official form asks for one address marked Permanent or Present.",
        }),
        textarea("address", "Address", 1, "2.  Address", {
          requirement: "required",
          maxLength: 500,
          rows: 4,
        }),
        text("phone", "Phone / mobile number", 1, "PHONE / MOBILE NO", {
          requirement: "required",
          inputMode: "tel",
          maxLength: 40,
          pattern: { regex: "^[0-9+()\\-\\s/]{6,40}$", message: "Enter a valid phone or mobile number" },
        }),
        text("email", "E-mail ID", 1, "E-MAIL ID", {
          requirement: "required",
          inputMode: "email",
          maxLength: 200,
          pattern: { regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message: "Enter a valid e-mail address" },
        }),
        date("dateOfBirth", "Date of birth", 1, "3.  Date of Birth", { requirement: "required" }),
        derived("age", "Age", 1, "Age", "dateOfBirth", {
          help: "Calculated from date of birth on the date of submission.",
        }),
        select(
          "gender",
          "Gender",
          1,
          "Gender  : M/F",
          [
            { value: "M", label: "M" },
            { value: "F", label: "F" },
          ],
          {
            requirement: "required",
          },
        ),
        text("placeOfBirth", "Place of birth", 1, "4.  Place of Birth", {
          requirement: "required",
          maxLength: 100,
        }),
        text("district", "District", 1, "District", { requirement: "required", maxLength: 100 }),
        text("state", "State", 1, "State", { requirement: "required", maxLength: 100 }),
        text("motherTongue", "Mother tongue", 1, "5.  Mother Tongue", {
          requirement: "required",
          maxLength: 60,
        }),
        text("nationality", "Nationality", 1, "Nationality & Religion", {
          requirement: "required",
          maxLength: 60,
        }),
        select("religion", "Religion", 1, "Nationality & Religion", [...INDIAN_RELIGIONS], {
          requirement: "policy",
          allowOther: true,
          otherOptionValue: "Others",
          otherLabel: "Please specify your religion",
          otherPlaceholder: "Enter your religion",
          otherMaxLength: 60,
        }),
        select(
          "community",
          "Community",
          1,
          "Community",
          [
            { value: "OC", label: "OC — Open Competition" },
            { value: "BC", label: "BC — Backward Class" },
            { value: "BCM", label: "BCM — Backward Class (Muslim)" },
            { value: "MBC", label: "MBC — Most Backward Class" },
            { value: "DNC", label: "DNC — Denotified Communities" },
            { value: "SC", label: "SC — Scheduled Caste" },
            { value: "SCA", label: "SCA — Scheduled Caste (Arunthathiyar)" },
            { value: "ST", label: "ST — Scheduled Tribe" },
          ],
          { requirement: "policy" },
        ),
      ],
    },
    {
      id: "academic",
      title: "Academic qualifications",
      sourceHeading: "6.  Academic Qualifications",
      pages: [1],
      fields: [
        table(
          "academicQualifications",
          "Academic qualifications",
          1,
          "6.  Academic Qualifications",
          [
            text("degree", "Degree / Diploma", 1, "Degree / Diploma", {
              requirement: "required",
              maxLength: 150,
            }),
            text("university", "University", 1, "University", { requirement: "required", maxLength: 150 }),
            text("institution", "Name of the Institution studied", 1, "Name of the Institution studied", {
              requirement: "required",
              maxLength: 200,
            }),
            text("class", "Class", 1, "Class", {
              requirement: "required",
              maxLength: 60,
              placeholder: "e.g. First Class with Distinction",
            }),
            text("cgpaOrMarks", "(CGPA/Marks)", 1, "CGPA/Marks", {
              requirement: "required",
              maxLength: 60,
              placeholder: "e.g. 8.5 CGPA or 85%",
            }),
            monthYear("monthYearOfPassing", "Month & Year of Passing", 1, "Month & Year of  Passing", {
              requirement: "required",
            }),
            num("attempts", "No. of attempts", 1, "No. of attempts", {
              requirement: "required",
              min: 1,
              max: 99,
              integer: true,
              placeholder: "e.g. 1",
            }),
          ],
          {
            templateRows: 5,
            minRows: 1,
            maxRows: 20,
            requirement: "required",
            attachment: {
              required: true,
              label: "Degree certificate / Mark sheet",
              docType: "DEGREE_CERTIFICATE",
              allowedDocTypes: ["DEGREE_CERTIFICATE", "MARK_SHEET", "PHD_CERTIFICATE"],
              help: "Upload attested degree certificate, provisional certificate or mark sheet (PDF, JPEG, or PNG up to 10 MB).",
            },
          },
        ),
        text("specialisation", "Specialisation", 1, "Specialisation", {
          requirement: "required",
          maxLength: 300,
        }),
      ],
    },
    {
      id: "experience",
      title: "Professional / teaching / research experience",
      sourceHeading: "7. Professional / Teaching / Research Experience (attach separate sheets if necessary)",
      pages: [1],
      description: "Add every position. Rows beyond the five printed rows are added to the same table.",
      fields: [
        table(
          "experience",
          "Experience",
          1,
          "7. Professional / Teaching / Research Experience",
          [
            text("post", "Name of the Post", 1, "Name of the Post", {
              requirement: "required",
              maxLength: 150,
            }),
            text("employer", "Employer", 1, "Employer", { requirement: "required", maxLength: 200 }),
            text("payScale", "Pay and Scale of Pay", 1, "Pay and Scale of Pay", { maxLength: 120 }),
            date("from", "Period of Employment — From", 1, "From", { requirement: "required" }),
            date("to", "Period of Employment — To", 1, "To", {
              help: "Leave blank if this is your current position.",
            }),
            num("years", "Yrs", 1, "Yrs", { integer: true, max: 60 }),
            num("months", "Mon", 1, "Mon", { integer: true, max: 11 }),
            select(
              "nature",
              "Teaching / Industrial / Research",
              1,
              "Teaching/ Industrial/Research",
              ["Teaching", "Industrial", "Research"],
              { requirement: "required" },
            ),
          ],
          {
            templateRows: 4,
            maxRows: 40,
            attachment: {
              required: true,
              label: "Experience certificate / Testimonial",
              docType: "EXPERIENCE_CERTIFICATE",
              allowedDocTypes: ["EXPERIENCE_CERTIFICATE"],
              help: "Upload experience certificate, relieving order or service testimonial (PDF, JPEG, or PNG up to 10 MB).",
            },
          },
        ),
      ],
    },
    {
      id: "memberships-publications",
      title: "Memberships and publications",
      sourceHeading: "8. – 9.",
      pages: [2],
      fields: [
        textarea(
          "memberships",
          "Membership of professional bodies",
          2,
          "8.  Membership of Professional Bodies",
          {
            maxLength: 3000,
          },
        ),
        textarea(
          "publications",
          "Publications",
          2,
          "9. Publications (attach separate sheets, If necessary)",
          {
            maxLength: 20000,
            rows: 10,
            help: "List each publication on a new line. Long lists continue on the form without truncation.",
          },
        ),
      ],
    },
    {
      id: "employment",
      title: "Present post and joining",
      sourceHeading: "10. – 11.",
      pages: [2],
      fields: [
        text("presentPost", "Present post", 2, "10.   Present post, basic and total emoluments/month", {
          maxLength: 150,
        }),
        num("basicPay", "Basic (Rs. per month)", 2, "Basic : Rs.", {
          help: "Last drawn salary certificate to be enclosed.",
        }),
        num("totalEmoluments", "Total emoluments (Rs. per month)", 2, "Total emoluments :  Rs."),
        text("joiningTime", "Joining time required (In Days)", 2, "11. Joining time required", {
          requirement: "required",
          maxLength: 100,
        }),
      ],
    },
    {
      id: "references",
      title: "References and other information",
      sourceHeading: "12. – 13.",
      pages: [2],
      fields: [
        textarea(
          "reference1",
          "Reference 1 — name and address",
          2,
          "12. Name and address of the persons to whom reference can be made about the applicant — 1.",
          {
            requirement: "required",
            maxLength: 500,
          },
        ),
        textarea("reference2", "Reference 2 — name and address", 2, "12. … — 2.", {
          requirement: "required",
          maxLength: 500,
        }),
        textarea(
          "otherInformation",
          "Any other information the applicant wishes to state",
          2,
          "13. Any other information the applicant wishes to state",
          {
            maxLength: 5000,
          },
        ),
      ],
    },
    {
      id: "declaration",
      title: "Place and date",
      pages: [2],
      description:
        "The applicant signature and the endorsement of the present employer are signed on the printed application.",
      fields: [
        text("place", "Place", 2, "Place", { requirement: "required", maxLength: 100 }),
        date("declarationDate", "Date", 2, "Date", { requirement: "required" }),
      ],
    },
  ],
  preservedText: [
    {
      id: "letterhead",
      page: 1,
      text: "PSG COLLEGE OF TECHNOLOGY : COIMBATORE - 641 004 (AUTONOMOUS & AFFILIATED TO ANNA UNIVERSITY AN ISO 9001:2015 CERTIFIED INSTITUTION)",
      note: "Letterhead text box and embedded logo (OLE/WMF) preserved unchanged.",
    },
    {
      id: "photo",
      page: 1,
      text: "AFFIX RECENT PASSPORT SIZE PHOTOGRAPH",
      note: "Photograph box. The uploaded photograph is placed inside this box.",
    },
    {
      id: "ssc",
      page: 1,
      text: "ssc",
      note: "Unexplained text box in the source; preserved unchanged. Awaiting clarification.",
    },
    { id: "pto", page: 1, text: "P.TO.", note: "Preserved." },
    {
      id: "salaryNote",
      page: 2,
      text: "(Last drawn salary certificate to be enclosed)",
      note: "Preserved; salary certificate is a document type.",
    },
    {
      id: "applicantSignature",
      page: 2,
      text: "Signature of the Applicant",
      note: "Left for wet signature.",
    },
    {
      id: "endorsement",
      page: 2,
      text: "(Endorsement of the present employer) FORWARDED Place : Date : (Seal) Signature of the present employer",
      note: "Left blank for the present employer. Never filled by the portal.",
    },
    {
      id: "note",
      page: 2,
      text: "Note :  ATTESTED  XEROX  COPIES   of   degrees,  certificates,  testimonials,   community  etc. should be annexed to the application. Candidate already employed should send their applications only through their present employer. Application, incomplete in any respect or from candidates who do not fully satisfy the prescribed qualifications etc, are liable to be rejected.",
      note: "Preserved verbatim; also shown to candidates before submission.",
    },
  ],
};
