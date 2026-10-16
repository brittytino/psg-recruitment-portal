import { date, derived, list, monthYear, num, select, table, text, textarea } from "../builders";
import type { FormDefinition, ScalarField } from "../types";

const titleYear = (page: number): ScalarField[] => [
  text("title", "Title", page, "TITLE", { requirement: "required", maxLength: 300 }),
  text("year", "Year", page, "YEAR", { requirement: "required", maxLength: 10 }),
];

const addressColumns = (side: "present" | "permanent"): ScalarField[] => {
  const head = side === "present" ? "PRESENT" : "PERMANENT";
  return [
    text(`${side}DoorNo`, `${head} — Door no.`, 1, "DOOR  NO.", { requirement: "required", maxLength: 60 }),
    text(`${side}Street`, `${head} — Street`, 1, "STREET", { requirement: "required", maxLength: 150 }),
    text(`${side}City`, `${head} — Village / Town / City`, 1, "VILLAGE/TOWN/CITY", { requirement: "required", maxLength: 100 }),
    text(`${side}District`, `${head} — District`, 1, "DISTRICT", { requirement: "required", maxLength: 100 }),
    text(`${side}State`, `${head} — State`, 1, "STATE", { requirement: "required", maxLength: 100 }),
    text(`${side}Pin`, `${head} — PIN`, 1, "PIN", {
      requirement: "required",
      inputMode: "numeric",
      maxLength: 10,
      pattern: { regex: "^[0-9]{6}$", message: "Enter a 6-digit PIN code" },
    }),
  ];
};

/**
 * APPLICATION for the post of PROFESSOR / ASSOCIATE PROFESSOR — template version 1.
 * Source: source-documents/APPLICATION for the post of ASSOCIATE PROFESSOR.docx
 * (SHA-256 5bca9c249fe2ed4893dce2de7b28066d7943c8034709ad1f0dae060577552a0b), US Letter.
 * docProps/app.xml reports 10 pages; printed page markers run ": 2 :" … ": 10 :".
 */
export const associateProfessorV1: FormDefinition = {
  code: "ASSOCIATE_PROFESSOR",
  version: 1,
  title: "APPLICATION for the post of  PROFESSOR  /  ASSOCIATE PROFESSOR",
  sourceDocument: "source-documents/APPLICATION for the post of ASSOCIATE PROFESSOR.docx",
  templatePath: "templates/associate-professor/v1.docx",
  sourcePageCount: 10,
  sections: [
    {
      id: "post",
      title: "Post and department",
      sourceHeading: "APPLICATION for the post of  PROFESSOR  /  ASSOCIATE PROFESSOR",
      pages: [1],
      fields: [derived("department", "Department of", 1, "DEPARTMENT OF_____________________________________________", "vacancy.department")],
    },
    {
      id: "personal",
      title: "Personal information",
      pages: [1],
      fields: [
        text("name", "Name (block letters)", 1, "NAME (BLOCK  LETTERS)", { requirement: "required", uppercase: true, maxLength: 120 }),
        date("dateOfBirth", "Date of birth", 1, "DATE OF BIRTH, AGE & GENDER", { requirement: "required" }),
        derived("age", "Age", 1, "DATE OF BIRTH, AGE & GENDER", "dateOfBirth"),
        text("gender", "Gender", 1, "DATE OF BIRTH, AGE & GENDER", { requirement: "required", maxLength: 30 }),
        textarea("qualificationsSummary", "Qualifications", 1, "QUALIFICATIONS", {
          requirement: "required",
          maxLength: 300,
          rows: 2,
          help: "For example: B.E., M.E., Ph.D.",
        }),
      ],
    },
    {
      id: "address",
      title: "Residential address",
      sourceHeading: "RESIDENTIAL ADDRESS",
      pages: [1],
      fields: [
        ...addressColumns("present"),
        ...addressColumns("permanent"),
        text("mobile", "Mobile no.", 1, "MOBILE NO.", {
          requirement: "required",
          inputMode: "tel",
          maxLength: 40,
          pattern: { regex: "^[0-9+()\\-\\s/]{6,40}$", message: "Enter a valid mobile number" },
        }),
        text("email", "E-mail ID", 1, "E –MAIL ID", {
          requirement: "required",
          inputMode: "email",
          maxLength: 200,
          pattern: { regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message: "Enter a valid e-mail address" },
        }),
        text("religion", "Religion", 1, "RELIGION", { requirement: "policy", maxLength: 60 }),
        text("caste", "Community / caste", 1, "COMMUNITY | CASTE", { requirement: "policy", maxLength: 100 }),
        select("communityCategory", "Community category", 1, "OC/BC/MBC/DNC/SC/ST", ["OC", "BC", "MBC", "DNC", "SC", "ST"], {
          requirement: "policy",
        }),
      ],
    },
    {
      id: "family",
      title: "Marital and family details",
      pages: [1],
      fields: [
        select("maritalStatus", "Marital status", 1, "MARITAL STATUS (Y / N)", [
          { value: "Y", label: "Y — Married" },
          { value: "N", label: "N — Not married" },
        ], { requirement: "required" }),
        text("spouseNameOccupation", "If married — name and occupation of spouse", 1, "IF MARRIED NAME AND OCCUPATION OF SPOUSE", {
          maxLength: 200,
        }),
        textarea("spouseOfficialAddress", "Official address of spouse", 1, "OFFICIAL ADDRESS OF SPOUSE", { maxLength: 400, rows: 2 }),
        table(
          "children",
          "Details of children",
          1,
          "DETAILS OF CHILDREN",
          [
            text("name", "Name", 1, "NAME", { requirement: "required", maxLength: 100 }),
            num("age", "Age", 1, "AGE", { integer: true, max: 80 }),
            text("status", "Studying / employed", 1, "STUDYING / EMPLOYED", { maxLength: 100 }),
          ],
          { templateRows: 3, maxRows: 10, help: "The form has space for three children; additional children are listed in the third column." },
        ),
        text("joiningTime", "Joining time required", 1, "JOINING TIME REQUIRED", { requirement: "required", maxLength: 100 }),
      ],
    },
    {
      id: "references",
      title: "References",
      sourceHeading: "REFERENCES",
      pages: [2],
      fields: [
        textarea("reference1", "Reference 1 — name and address", 2, "REFERENCES (first cell)", { requirement: "required", maxLength: 500 }),
        textarea("reference2", "Reference 2 — name and address", 2, "REFERENCES (second cell)", { requirement: "required", maxLength: 500 }),
      ],
    },
    {
      id: "jobs",
      title: "Details of jobs held",
      sourceHeading: "DETAILS OF JOBS HELD",
      pages: [2],
      fields: [
        table(
          "jobsHeld",
          "Details of jobs held",
          2,
          "DETAILS OF JOBS HELD",
          [
            text("designation", "Designation", 2, "DESIGNATION", { requirement: "required", maxLength: 150 }),
            text("scaleOfPay", "Scale of pay", 2, "SCALE OF PAY", { maxLength: 120 }),
            text("totalSalary", "Total salary", 2, "TOTAL SALARY", { maxLength: 60 }),
            text("organisation", "Organisation", 2, "ORGANISATION", { requirement: "required", maxLength: 200 }),
            date("from", "Period — From", 2, "FROM", { requirement: "required" }),
            date("to", "Period — To", 2, "TO"),
            num("years", "Yrs", 2, "YRS", { integer: true, max: 60 }),
            num("months", "Mon", 2, "MON", { integer: true, max: 11 }),
            text("reasonForLeaving", "Reason for leaving", 2, "REASON FOR LEAVING", { maxLength: 300 }),
          ],
          { templateRows: 5, maxRows: 40 },
        ),
      ],
    },
    {
      id: "education",
      title: "Educational qualifications",
      sourceHeading: "EDUCATIONAL QUALIFICATIONS",
      pages: [2],
      description:
        "The official table has four columns: Under-graduate, Post-graduate, Research and Others. Each row below is one column of that table.",
      fields: [
        table(
          "educationalQualifications",
          "Educational qualifications",
          2,
          "EDUCATIONAL QUALIFICATIONS",
          [
            select("level", "Level", 2, "UNDER-GRADUATE / POST-GRADUATE / RESEARCH / OTHERS", [
              { value: "UG", label: "Under-graduate" },
              { value: "PG", label: "Post-graduate" },
              { value: "RESEARCH", label: "Research" },
              { value: "OTHERS", label: "Others" },
            ], { requirement: "required" }),
            text("degree", "Degree", 2, "DEGREE", { requirement: "required", maxLength: 150 }),
            monthYear("monthYear", "Month & year", 2, "MONTH & YEAR", { requirement: "required" }),
            text("college", "College", 2, "COLLEGE", { requirement: "required", maxLength: 200 }),
            text("university", "University", 2, "UNIVERSITY", { requirement: "required", maxLength: 200 }),
            text("classPercent", "Class & % of marks", 2, "CLASS  &  % OF MARKS", { maxLength: 60 }),
            text("thesis", "Thesis", 2, "THESIS", { maxLength: 400 }),
            text("specialisation", "Specialisation", 2, "SPECIALISATION", { maxLength: 200 }),
          ],
          { templateRows: 4, minRows: 1, maxRows: 4, requirement: "required" },
        ),
      ],
    },
    {
      id: "teaching",
      title: "Subjects taught and teaching material",
      pages: [3],
      fields: [
        list("subjectsUg", "Subjects taught during last five years — Undergraduate", 3, "SUBJECTS TAUGHT DURING LAST FIVE YEARS — UNDERGRADUATE", {
          templateCapacity: 10,
          itemLabel: "Subject",
          itemMaxLength: 200,
          maxItems: 40,
        }),
        list("subjectsPg", "Subjects taught during last five years — Post graduate", 3, "SUBJECTS TAUGHT DURING LAST FIVE YEARS — POST GRADUATE", {
          templateCapacity: 10,
          itemLabel: "Subject",
          itemMaxLength: 200,
          maxItems: 40,
        }),
        table("courseMaterials", "Course materials prepared", 3, "COURSE MATERIALS PREPARED", titleYear(3), { templateRows: 3, maxRows: 30 }),
        table("labManuals", "Laboratory manuals prepared", 3, "LABORATORY MANUALS PREPARED", titleYear(3), { templateRows: 3, maxRows: 30 }),
        table("monographs", "Monographs prepared", 3, "MONOGRAPHS PREPARED", titleYear(3), { templateRows: 3, maxRows: 30 }),
        table(
          "books",
          "Books published",
          3,
          "BOOKS PUBLISHED",
          [
            text("name", "Name of the book", 3, "NAME OF THE BOOK", { requirement: "required", maxLength: 300 }),
            text("publisher", "Publisher", 3, "PUBLISHER", { maxLength: 200 }),
            text("year", "Year", 3, "YEAR", { maxLength: 10 }),
          ],
          { templateRows: 3, maxRows: 30 },
        ),
      ],
    },
    {
      id: "journals",
      title: "Journal publications",
      pages: [4],
      fields: [
        list("internationalJournals", "Papers published in international journals during the last five years", 4, "PAPERS PUBLISHED IN INTERNATIONAL JOURNALS DURING THE  LAST FIVE YEARS:", {
          templateCapacity: 31,
          itemLabel: "Paper",
          itemMaxLength: 1500,
          maxItems: 300,
          help: "One paper per entry: authors, title, journal, volume, pages, year.",
        }),
        list("nationalJournals", "Papers published in national journals during the last five years", 4, "PAPERS PUBLISHED IN NATIONAL JOURNALS DURING THE LAST FIVE YEARS:", {
          templateCapacity: 14,
          itemLabel: "Paper",
          itemMaxLength: 1500,
          maxItems: 300,
        }),
      ],
    },
    {
      id: "consultancy",
      title: "Consultancy, testing and continuing education",
      pages: [5],
      fields: [
        table(
          "consultancy",
          "Participation in consultancy activities through college during the last three years",
          5,
          "PARTICIPATION IN CONSULTANCY ACTIVITIES THROUGH COLLEGE DURING THE LAST THREE YEARS",
          [
            text("job", "Consultancy job / project", 5, "CONSULTANCY JOB / PROJECT", { requirement: "required", maxLength: 300 }),
            text("organisation", "Organisation", 5, "ORGANISATION", { maxLength: 200 }),
            text("projectLeader", "Project leader", 5, "PROJECT LEADER", { maxLength: 150 }),
            text("revenue", "Revenue generated", 5, "REVENUE GENERATED", { maxLength: 60 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        table(
          "testing",
          "Participation in testing activities during the last three years",
          5,
          "PARTICIPATION IN TESTING ACTIVITIES DURING THE LAST THREE YEARS",
          [
            text("job", "Testing job", 5, "TESTING JOB", { requirement: "required", maxLength: 300 }),
            text("organisation", "Organisation", 5, "ORGANISATION", { maxLength: 200 }),
            text("testsDone", "No of tests done", 5, "NO OF TESTS DONE", { maxLength: 30 }),
            text("revenue", "Revenue generated", 5, "REVENUE GENERATED", { maxLength: 60 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        table(
          "summerPrograms",
          "Participation in summer / continuing education programmes during the last three years",
          5,
          "PARTICIPATION IN SUMMER /CONTINUING EDUCATION PROGRAMMES DURING THE LAST THREE YEARS",
          [
            text("programme", "Programme", 5, "PROGRAMME", { requirement: "required", maxLength: 300 }),
            text("heldAt", "Held at", 5, "HELD AT", { maxLength: 200 }),
            text("duration", "Duration", 5, "DURATION", { maxLength: 60 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
      ],
    },
    {
      id: "conferences",
      title: "Conferences and memberships",
      pages: [6],
      fields: [
        list("conferencePapers", "Papers presented in conferences during the last three years", 6, "PAPERS PRESENTED IN CONFERENCES DURING THE LAST THREE YEARS:", {
          templateCapacity: 22,
          itemLabel: "Paper",
          itemMaxLength: 1500,
          maxItems: 300,
        }),
        table(
          "memberships",
          "Membership of professional bodies",
          6,
          "MEMBERSHIP OF PROFESSIONAL BODIES",
          [
            text("body", "Professional body", 6, "PROFESSIONAL BODY", { requirement: "required", maxLength: 200 }),
            text("type", "Type of membership", 6, "TYPE OF MEMBERSHIP", { maxLength: 100 }),
            text("position", "Position held", 6, "POSITION HELD", { maxLength: 100 }),
          ],
          { templateRows: 5, maxRows: 30 },
        ),
      ],
    },
    {
      id: "laboratory",
      title: "Laboratory and teaching innovation",
      pages: [7],
      fields: [
        textarea("labModels", "Any laboratory models / teaching aids developed / new laboratory experiments devised during last three years", 7, "ANY LABORATORY MODELS / TEACHING AIDS DEVELOPED / NEW LABORATORY EXPERIMENTS DEVISED DURING LAST THREE YEARS (GIVE DETAILS)", {
          maxLength: 6000,
          rows: 6,
        }),
        table(
          "labDevelopment",
          "Department / laboratory development during the last three years (state your contribution)",
          7,
          "DEPARTMENT / LABORATORY DEVELOPMENT DURING THE LAST THREE YEARS (STATE YOUR CONTRIBUTION)",
          [
            text("equipment", "Equipment", 7, "EQUIPMENT", { requirement: "required", maxLength: 200 }),
            text("cost", "Cost", 7, "COST", { maxLength: 60 }),
            text("whenPurchased", "When purchased", 7, "WHEN PURCHASED", { maxLength: 60 }),
            text("involvement", "Your involvement", 7, "YOUR INVOLVEMENT", { maxLength: 300 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        textarea("teachingInnovations", "State any innovations in teaching / evaluation you have experimented during the last three years", 7, "STATE ANY INNOVATIONS IN TEACHING / EVALUATION YOU HAVE EXPERIMENTED DURING THE LAST THREE YEARS", {
          maxLength: 6000,
          rows: 6,
        }),
      ],
    },
    {
      id: "programmes",
      title: "Programmes, sponsored research and student projects",
      pages: [8],
      fields: [
        table(
          "ceOrganised",
          "Participation in the organisation of continuing educational programmes during the last three years",
          8,
          "PARTICIPATION IN THE ORGANISATION OF CONTINUING EDUCATIONAL PROGRAMMES DURING THE LAST THREE YEARS",
          [
            text("programme", "Programme", 8, "PROGRAMME", { requirement: "required", maxLength: 300 }),
            text("duration", "Duration", 8, "DURATION", { maxLength: 60 }),
            text("period", "Period", 8, "PERIOD", { maxLength: 60 }),
            num("participants", "No. of participants", 8, "NO. OF PATICIPANTS", { integer: true }),
            text("involvement", "Nature of involvement", 8, "NATURE OF INVOLVEMENT", { maxLength: 200 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        table(
          "sponsoredResearch",
          "Sponsored research carried out during the last three years",
          8,
          "SPONSORED RESEARCH CARRIED OUT  DURING THE LAST THREE YEARS",
          [
            text("project", "Project", 8, "PROJECT", { requirement: "required", maxLength: 300 }),
            text("sponsor", "Sponsoring organisation", 8, "SPONSORING ORGANISATION", { maxLength: 200 }),
            text("period", "Period", 8, "PERIOD", { maxLength: 60 }),
            text("grant", "Grant", 8, "GRANT", { maxLength: 60 }),
            text("principalInvestigator", "Principal investigator", 8, "PRINCIPAL INVESTIGATOR", { maxLength: 150 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        list("studentProjectsUg", "Student projects supervised during the last three years — Under graduate", 8, "STUDENT PROJECTS SUPERVISED DURING THE LAST THREE YEARS — UNDER GRADUATE", {
          templateCapacity: 7,
          itemLabel: "Project",
          itemMaxLength: 400,
          maxItems: 100,
        }),
        list("studentProjectsPg", "Student projects supervised during the last three years — Post graduate", 8, "STUDENT PROJECTS SUPERVISED DURING THE LAST THREE YEARS — POST GRADUATE", {
          templateCapacity: 7,
          itemLabel: "Project",
          itemMaxLength: 400,
          maxItems: 100,
        }),
      ],
    },
    {
      id: "mentorship",
      title: "Mentorship, visits and awards",
      pages: [9],
      fields: [
        table(
          "mentorship",
          "Mentorship during the last three years — experience and contribution as mentor",
          9,
          "MENTORSHIP DURING THE LAST THREE YEARS PLEASE STATE YOUR EXPERIENCE AND CONTRIBUTION AS MENTOR",
          [
            text("class", "Class", 9, "CLASS", { requirement: "required", maxLength: 100 }),
            text("year", "Year", 9, "YEAR", { maxLength: 20 }),
            text("contribution", "Specific contribution", 9, "SPECIFIC CONTRIBUTION", { maxLength: 500 }),
          ],
          { templateRows: 4, maxRows: 30 },
        ),
        table(
          "tours",
          "Accompanying students for educational tours / industrial visits during the last three years",
          9,
          "ACCOMPANYING STUDENTS FOR EDUCATIONAL TOURS / INDUSTRIAL VISITS DURING THE LAST THREE YEARS",
          [
            text("class", "Class", 9, "CLASS", { requirement: "required", maxLength: 100 }),
            text("visitTo", "Visit to", 9, "VISIT TO", { maxLength: 200 }),
            text("duration", "Duration", 9, "DURATION", { maxLength: 60 }),
            text("yearMonth", "Year / month", 9, "YEAR / MONTH", { maxLength: 30 }),
          ],
          { templateRows: 3, maxRows: 30 },
        ),
        list("awardsPatents", "Distinctions and awards received and patents obtained", 9, "DISTINCTIONS AND AWARDS RECEIVED AND PATENTS OBTAINED", {
          templateCapacity: 4,
          itemLabel: "Distinction / award / patent",
          itemMaxLength: 600,
          maxItems: 100,
        }),
      ],
    },
    {
      id: "declaration",
      title: "Station and date",
      pages: [9],
      description: "The applicant signature and the endorsement of the present employer are signed on the printed application.",
      fields: [
        text("station", "Station", 9, "STATION", { requirement: "required", maxLength: 100 }),
        date("declarationDate", "Date", 9, "DATE", { requirement: "required" }),
      ],
    },
  ],
  preservedText: [
    { id: "letterhead", page: 1, text: "PSG COLLEGE OF TECHNOLOGY : COIMBATORE - 641 004 (AUTONOMOUS & AFFILIATED TO ANNA UNIVERSITY AN ISO 9001:2015 CERTIFIED INSTITUTION)", note: "Letterhead text box and embedded logo (OLE/WMF) preserved unchanged." },
    { id: "photo", page: 1, text: "AFFIX RECENT PASSPORT SIZE PHOTOGRAPH", note: "Photograph box. The uploaded photograph is placed inside this box." },
    { id: "ssc", page: 1, text: "ssc", note: "Unexplained text box in the source; preserved unchanged. Awaiting clarification." },
    { id: "pageMarkers", page: 1, text: "..2  : 2 :  …  ..10  : 10 :", note: "Typed page-continuation markers preserved. With long answers they may no longer sit at a physical page boundary (documented deviation)." },
    { id: "applicantSignature", page: 9, text: "SIGNATURE OF THE APPLICANT", note: "Left for wet signature." },
    { id: "endorsement", page: 10, text: "ENDORSEMENT OF THE PRESENT EMPLOYER FORWARDED PLACE : Signature of the present employer DATE : (SEAL)", note: "Left blank for the present employer. Never filled by the portal." },
    { id: "note", page: 10, text: "Note :  ATTESTED  XEROX  COPIES   of   degrees,  certificates,  testimonials,   community  etc.  should  be annexed to the application. Candidate already employed should send their applications only through their present employer. Application, incomplete in any respect or from candidates who do not fully satisfy the prescribed qualifications etc, are liable to be rejected.", note: "Preserved verbatim." },
  ],
};
