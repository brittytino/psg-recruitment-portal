import { date, derived, list, monthYear, num, select, table, text, textarea } from "../builders";
import {
  ACADEMIC_DEGREES,
  ACADEMIC_DISCIPLINES,
  BOOK_PUBLISHERS,
  COMPETITIVE_EXAMINATIONS,
  CONFERENCE_INDEXING,
  CONFERENCE_LEVELS,
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
} from "../options";
import type { FormCode, FormDefinition, ScalarField, SectionDef, UploadGroup } from "../types";

const YES_NO = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];
const MODE = [...MODES_OF_EDUCATION];
const CLASS_OPTIONS = [...QUALIFICATION_CLASSES];
const NOT_CURRENT = { key: "isCurrent", in: ["No"] } as const;
const EMPLOYED = { key: "currentlyEmployed", in: ["Yes"] } as const;
const HAS_PHD = { key: "phdStatus", in: ["Awarded", "Thesis submitted", "Pursuing"] } as const;
const MOBILE = {
  regex: "^(\\+91[\\s-]?)?[6-9][0-9]{9}$",
  message: "Enter a valid 10-digit Indian mobile number",
};
const EMAIL = { regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message: "Enter a valid e-mail address" };
const YEAR = { min: 1950, max: 2100, integer: true, placeholder: "YYYY" };

const address = (side: "present" | "permanent", step: number): ScalarField[] => {
  const head = side === "present" ? "Present address" : "Permanent address";
  return [
    text(`${side}DoorNo`, `${head} — Door no.`, step, "Door no.", { requirement: "required", maxLength: 60 }),
    text(`${side}Street`, `${head} — Street`, step, "Street", { requirement: "required", maxLength: 150 }),
    text(`${side}City`, `${head} — Village / Town / City`, step, "City", {
      requirement: "required",
      maxLength: 100,
    }),
    text(`${side}District`, `${head} — District`, step, "District", {
      requirement: "required",
      maxLength: 100,
    }),
    select(`${side}State`, `${head} — State`, step, "State", [...INDIAN_STATES], {
      requirement: "required",
      allowOther: true,
      otherOptionValue: "Other State / UT",
      otherLabel: "Specify State / UT",
      otherMaxLength: 80,
    }),
    text(`${side}Pin`, `${head} — PIN code`, step, "PIN", {
      requirement: "required",
      inputMode: "numeric",
      maxLength: 6,
      pattern: { regex: "^[0-9]{6}$", message: "Enter a 6-digit PIN code" },
    }),
  ];
};

const titleYear = (step: number): ScalarField[] => [
  text("title", "Title", step, "Title", { requirement: "required", maxLength: 300 }),
  text("year", "Year", step, "Year", { requirement: "required", maxLength: 10 }),
];

/** Sections common to every post. */
function commonSections(): SectionDef[] {
  return [
    {
      id: "post",
      title: "Post and department",
      pages: [1],
      description:
        "These details come from the vacancy you are applying for. To apply for a different post or department, apply to that vacancy instead.",
      fields: [
        derived("department", "Department", 1, "Department", "vacancy.department"),
        derived("appliedPost", "Post applied for", 1, "Post", "vacancy.position"),
      ],
    },
    {
      id: "personal",
      title: "Personal details",
      pages: [2],
      fields: [
        select("salutation", "Title", 2, "Dr. / Mrs. / Ms. / Mr.", ["Dr.", "Mrs.", "Ms.", "Mr."], {
          requirement: "required",
        }),
        text("name", "Full name (in block letters)", 2, "NAME", {
          requirement: "required",
          uppercase: true,
          maxLength: 120,
        }),
        date("dateOfBirth", "Date of birth", 2, "Date of birth", { requirement: "required" }),
        derived("age", "Age", 2, "Age", "dateOfBirth", { help: "Calculated from your date of birth." }),
        select(
          "gender",
          "Gender",
          2,
          "Gender",
          [
            { value: "M", label: "Male" },
            { value: "F", label: "Female" },
          ],
          { requirement: "required" },
        ),
        text("placeOfBirth", "Place of birth", 2, "Place of birth", {
          requirement: "required",
          maxLength: 100,
        }),
        text("district", "District of birth", 2, "District", { requirement: "required", maxLength: 100 }),
        select("state", "State of birth", 2, "State", [...INDIAN_STATES], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other State / UT",
          otherLabel: "Specify state or union territory",
          otherMaxLength: 80,
        }),
        select("motherTongue", "Mother tongue", 2, "Mother tongue", [...MOTHER_TONGUES], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify mother tongue",
          otherMaxLength: 60,
        }),
        select("nationality", "Nationality", 2, "Nationality", [...NATIONALITIES], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify nationality",
          otherMaxLength: 60,
        }),
        select("religion", "Religion", 2, "Religion", [...INDIAN_RELIGIONS], {
          requirement: "policy",
          allowOther: true,
          otherOptionValue: "Others",
          otherLabel: "Please specify your religion",
          otherMaxLength: 60,
        }),
        select(
          "community",
          "Community",
          2,
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
        text("caste", "Caste", 2, "Caste", { requirement: "policy", maxLength: 100 }),
        select("maritalStatus", "Marital status", 2, "Marital status", ["Married", "Unmarried"], {
          requirement: "required",
        }),
        text("spouseNameOccupation", "Name and occupation of spouse", 2, "Spouse", {
          maxLength: 200,
          when: { key: "maritalStatus", in: ["Married"] },
          requirement: "required",
        }),
        textarea("spouseOfficialAddress", "Official address of spouse", 2, "Spouse address", {
          maxLength: 400,
          rows: 2,
          when: { key: "maritalStatus", in: ["Married"] },
        }),
        table(
          "children",
          "Details of children",
          2,
          "Children",
          [
            text("name", "Name", 2, "Name", { requirement: "required", maxLength: 100 }),
            num("age", "Age", 2, "Age", { integer: true, max: 80 }),
            text("status", "Studying / employed", 2, "Studying / employed", { maxLength: 100 }),
          ],
          {
            templateRows: 0,
            maxRows: 10,
            itemLabel: "Child",
            when: { key: "maritalStatus", in: ["Married"] },
          },
        ),
      ],
    },
    {
      id: "contact",
      title: "Contact details",
      pages: [3],
      fields: [
        text("mobile", "Mobile number", 3, "Mobile", {
          requirement: "required",
          inputMode: "tel",
          maxLength: 16,
          pattern: MOBILE,
        }),
        text("alternatePhone", "Alternate phone number", 3, "Phone", {
          inputMode: "tel",
          maxLength: 40,
          pattern: { regex: "^[0-9+()\\-\\s/]{6,40}$", message: "Enter a valid phone number" },
        }),
        text("email", "E-mail address", 3, "E-mail", {
          requirement: "required",
          inputMode: "email",
          maxLength: 200,
          pattern: EMAIL,
        }),
        ...address("present", 3),
        ...address("permanent", 3),
      ],
    },
    {
      id: "school",
      title: "School education",
      pages: [4],
      description: "SSLC (Class 10) and HSC (Class 12) details.",
      fields: [
        text("sslcSchool", "SSLC — School", 4, "SSLC School", {
          requirement: "required",
          maxLength: 200,
          wide: true,
        }),
        select("sslcBoard", "SSLC — Board", 4, "Board", [...SCHOOL_BOARDS], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify SSLC board",
          otherMaxLength: 120,
        }),
        num("sslcYear", "SSLC — Year of completion", 4, "Year", { requirement: "required", ...YEAR }),
        text("sslcMarks", "SSLC — Marks / percentage", 4, "Marks", {
          requirement: "required",
          maxLength: 30,
          help: "For example 465/500 or 93%.",
        }),
        select("sslcMode", "SSLC — Mode of education", 4, "Mode", MODE, { requirement: "required" }),
        num("sslcAttempts", "SSLC — Number of attempts", 4, "Attempts", {
          requirement: "required",
          min: 1,
          max: 20,
          integer: true,
        }),
        select("hscMajor", "HSC — Major subjects (group)", 4, "Major subject", [...HSC_MAJOR_STREAMS], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify HSC major subjects",
          otherMaxLength: 150,
          help: "Select your main subjects or choose Other to specify.",
        }),
        text("hscSchool", "HSC — School", 4, "HSC School", {
          requirement: "required",
          maxLength: 200,
          wide: true,
        }),
        select("hscBoard", "HSC — Board", 4, "Board", [...SCHOOL_BOARDS], {
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify HSC board",
          otherMaxLength: 120,
        }),
        num("hscYear", "HSC — Year of completion", 4, "Year", { requirement: "required", ...YEAR }),
        text("hscMarks", "HSC — Marks / percentage", 4, "Marks", { requirement: "required", maxLength: 30 }),
        select("hscMode", "HSC — Mode of education", 4, "Mode", MODE, { requirement: "required" }),
        num("hscAttempts", "HSC — Number of attempts", 4, "Attempts", {
          requirement: "required",
          min: 1,
          max: 20,
          integer: true,
        }),
      ],
    },
    {
      id: "college",
      title: "College education",
      pages: [5],
      description:
        "Add your UG and PG degrees (both required) and any diploma or other qualification. Attach the degree certificate or consolidated mark sheet to each entry.",
      fields: [
        table(
          "collegeQualifications",
          "College qualifications",
          5,
          "UG / PG / Others",
          [
            select("level", "Level", 5, "Level", [...QUALIFICATION_LEVELS], { requirement: "required" }),
            select("degree", "Degree", 5, "Degree", [...ACADEMIC_DEGREES], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Name of the degree (e.g. B.Voc., M.Phil.)",
              otherMaxLength: 100,
            }),
            select(
              "specialisation",
              "Course / branch / specialisation",
              5,
              "Specialisation",
              [...ACADEMIC_DISCIPLINES],
              {
                allowOther: true,
                otherOptionValue: "Other",
                otherLabel: "Name of the course / branch",
                otherMaxLength: 150,
              },
            ),
            text("college", "College", 5, "College", { requirement: "required", maxLength: 200 }),
            text("university", "University", 5, "University", { requirement: "required", maxLength: 200 }),
            monthYear("monthYear", "Month & year of completion", 5, "Year of completion", {
              requirement: "required",
            }),
            select("scoreType", "Score type", 5, "CGPA / Percentage", ["CGPA (out of 10)", "Percentage"], {
              requirement: "required",
            }),
            num("score", "CGPA / percentage", 5, "Percentage", { requirement: "required", max: 100 }),
            select("classAwarded", "Class", 5, "Class", CLASS_OPTIONS, {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify the class awarded",
              otherMaxLength: 80,
            }),
            select("mode", "Mode of study", 5, "Mode of study", MODE, { requirement: "required" }),
            num("attempts", "Number of attempts", 5, "Attempts", {
              requirement: "required",
              min: 1,
              max: 99,
              integer: true,
            }),
          ],
          {
            templateRows: 0,
            minRows: 2,
            maxRows: 12,
            requirement: "required",
            itemLabel: "Qualification",
            attachment: {
              required: true,
              label: "Degree certificate / consolidated mark sheet",
              docType: "DEGREE_CERTIFICATE",
              allowedDocTypes: ["DEGREE_CERTIFICATE", "MARK_SHEET"],
              help: "PDF, JPEG or PNG up to 10 MB.",
            },
          },
        ),
        derived(
          "othersCount",
          "No. of diplomas / other qualifications",
          5,
          "No. of Diploma/Others",
          "count.collegeOthers",
        ),
        select("phdStatus", "Ph.D. status", 5, "Ph.D.", [...PHD_STATUS_OPTIONS], { requirement: "required" }),
        // Thesis title only once the Ph.D. is awarded; the research domain for every Ph.D. status.
        text("phdTitle", "Ph.D. thesis title", 5, "Thesis", {
          maxLength: 400,
          wide: true,
          when: { key: "phdStatus", in: ["Awarded"] },
          requirement: "required",
        }),
        text("phdUniversity", "Ph.D. university", 5, "University", {
          maxLength: 200,
          when: HAS_PHD,
          requirement: "required",
        }),
        text("phdSupervisor", "Ph.D. supervisor", 5, "Supervisor", { maxLength: 150, when: HAS_PHD }),
        select(
          "phdSpecialisation",
          "Ph.D. research domain",
          5,
          "Research domain",
          [...ACADEMIC_DISCIPLINES],
          {
            when: HAS_PHD,
            requirement: "required",
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify the research domain",
            otherMaxLength: 150,
          },
        ),
        num("phdRegistrationYear", "Year of registration", 5, "Registration", { ...YEAR, when: HAS_PHD }),
        monthYear("phdAwardDate", "Month & year of award / thesis submission", 5, "Award", {
          when: { key: "phdStatus", in: ["Awarded", "Thesis submitted"] },
          requirement: "required",
        }),
        select("phdMode", "Ph.D. mode", 5, "Mode", MODE, { when: HAS_PHD }),
      ],
    },
    {
      id: "arrears",
      title: "Arrears, achievements and certifications",
      pages: [6],
      fields: [
        num("ugArrearPapers", "UG — total number of papers with arrears", 6, "UG arrear papers", {
          requirement: "required",
          integer: true,
          max: 100,
          help: "Enter 0 if none.",
        }),
        num("ugArrearAttempts", "UG — total number of attempts for arrears", 6, "UG attempts", {
          requirement: "required",
          integer: true,
          max: 200,
        }),
        num("pgArrearPapers", "PG — total number of papers with arrears", 6, "PG arrear papers", {
          requirement: "required",
          integer: true,
          max: 100,
        }),
        num("pgArrearAttempts", "PG — total number of attempts for arrears", 6, "PG attempts", {
          requirement: "required",
          integer: true,
          max: 200,
        }),
        textarea(
          "academicAchievements",
          "Special achievements in academics",
          6,
          "Best Student, Gold medal, University Rank etc.",
          {
            maxLength: 3000,
            rows: 3,
            wide: true,
            help: "For example Best Student, Gold medal, University rank.",
          },
        ),
        table(
          "certifications",
          "Certification courses completed",
          6,
          "NPTEL, Coursera …",
          [
            text("course", "Course", 6, "Course", { requirement: "required", maxLength: 200 }),
            text("platform", "Platform", 6, "Platform", { maxLength: 100, help: "NPTEL, Coursera, …" }),
            num("year", "Year", 6, "Year", YEAR),
            text("grade", "Score / grade", 6, "Grade", { maxLength: 40 }),
          ],
          { templateRows: 0, maxRows: 40, itemLabel: "Certification" },
        ),
      ],
    },
    {
      id: "experience",
      title: "Work experience",
      pages: [7],
      description:
        "Add every position, most recent first. Duration is calculated in years and months from the dates; overlapping periods are counted once in the totals.",
      fields: [
        table(
          "experience",
          "Work experience",
          7,
          "Work experience",
          [
            text("institution", "Institution / organisation", 7, "Institution Name", {
              requirement: "required",
              maxLength: 200,
            }),
            text("institutionAddress", "Address of the institution", 7, "Address", { maxLength: 300 }),
            select("designation", "Designation", 7, "Designation", [...DESIGNATIONS], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify designation",
              otherMaxLength: 120,
            }),
            select("nature", "Nature of work", 7, "Teaching / Industry / Research", [...EMPLOYMENT_NATURE], {
              requirement: "required",
            }),
            select("employmentType", "Employment type", 7, "Type", [...EMPLOYMENT_TYPES], {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify employment type",
              otherMaxLength: 80,
            }),
            date("from", "From", 7, "From", { requirement: "required" }),
            select("isCurrent", "Currently working here?", 7, "Current", YES_NO, { requirement: "required" }),
            date("to", "To", 7, "To", { requirement: "required", when: NOT_CURRENT }),
            derived("duration", "Duration", 7, "Duration", "row.duration"),
            text("scaleOfPay", "Scale of pay", 7, "Scale of pay", {
              maxLength: 120,
              help: "For example Level 10, ₹57,700–1,82,400.",
            }),
            num("grossSalary", "Gross salary / total emoluments (₹ per month)", 7, "Gross salary", {
              max: 10_000_000,
            }),
            select("serviceCertificate", "Service certificate available?", 7, "Service certificate", YES_NO, {
              requirement: "required",
            }),
            text("reasonForLeaving", "Reason for leaving", 7, "Reason for leaving", {
              maxLength: 300,
              requirement: "required",
              when: NOT_CURRENT,
            }),
          ],
          {
            templateRows: 0,
            maxRows: 40,
            itemLabel: "Position",
            attachment: {
              required: false,
              label: "Experience / service certificate",
              docType: "EXPERIENCE_CERTIFICATE",
              allowedDocTypes: ["EXPERIENCE_CERTIFICATE", "SERVICE_CERTIFICATE"],
              help: "Upload the certificate for this position if available (PDF, JPEG or PNG up to 10 MB).",
            },
          },
        ),
        derived(
          "totalExperience",
          "Total experience",
          7,
          "Total number of years experience",
          "experience.total",
        ),
        derived("teachingExperience", "Teaching experience", 7, "Teaching", "experience.teaching"),
        derived("industryExperience", "Industry experience", 7, "Industry Experience", "experience.industry"),
        derived("experienceAfterPg", "Experience after PG", 7, "Experience after PG", "experience.afterPg"),
        select("currentlyEmployed", "Are you currently employed?", 7, "Currently employed", YES_NO, {
          requirement: "required",
        }),
        select("presentPost", "Present post", 7, "Present post", [...DESIGNATIONS], {
          when: EMPLOYED,
          requirement: "required",
          allowOther: true,
          otherOptionValue: "Other",
          otherLabel: "Specify present post / designation",
          otherMaxLength: 120,
        }),
        num("basicPay", "Basic pay (₹ per month)", 7, "Basic", { when: EMPLOYED }),
        num("totalEmoluments", "Total emoluments (₹ per month)", 7, "Total emoluments", { when: EMPLOYED }),
      ],
    },
    {
      id: "guideship",
      title: "Ph.D. guideship",
      pages: [8],
      fields: [
        select("phdGuide", "Are you a recognised Ph.D. supervisor?", 8, "Guideship", YES_NO, {
          requirement: "required",
        }),
        text("guideshipNumber", "Guideship number", 8, "Guideship Number", {
          maxLength: 60,
          when: { key: "phdGuide", in: ["Yes"] },
          requirement: "required",
        }),
        text("guideshipUniversity", "University", 8, "University", {
          maxLength: 200,
          when: { key: "phdGuide", in: ["Yes"] },
          requirement: "required",
        }),
        num("scholarsRegistered", "Ph.D. scholars registered", 8, "Registered", {
          integer: true,
          max: 200,
          when: { key: "phdGuide", in: ["Yes"] },
        }),
        num("scholarsThesisSubmitted", "Ph.D. scholars — thesis submitted", 8, "Thesis Submitted", {
          integer: true,
          max: 200,
          when: { key: "phdGuide", in: ["Yes"] },
        }),
        num("scholarsCompleted", "Ph.D. scholars completed", 8, "Completed", {
          integer: true,
          max: 200,
          when: { key: "phdGuide", in: ["Yes"] },
        }),
      ],
    },
    {
      id: "publications",
      title: "Publications and research metrics",
      pages: [9],
      description:
        "Add each journal paper, conference paper, book and book chapter. Totals are counted for you.",
      fields: [
        table(
          "journalPapers",
          "Journal papers",
          9,
          "Journal Articles",
          [
            text("authors", "Author name(s)", 9, "Author Name", { requirement: "required", maxLength: 500 }),
            text("title", "Paper title", 9, "Title", { requirement: "required", maxLength: 400 }),
            text("journal", "Journal name", 9, "Journal Name", { requirement: "required", maxLength: 300 }),
            num("year", "Year", 9, "Year", { requirement: "required", ...YEAR }),
            text("volumePages", "Volume / issue / pages", 9, "Volume", { maxLength: 80 }),
            select(
              "publicationType",
              "Publication type",
              9,
              "Publication Type",
              [...JOURNAL_PUBLICATION_TYPES],
              {
                requirement: "required",
                allowOther: true,
                otherOptionValue: "Other",
                otherLabel: "Specify indexing / database",
                otherMaxLength: 100,
              },
            ),
            text("doi", "DOI / URL", 9, "DOI", { maxLength: 300 }),
          ],
          { templateRows: 0, maxRows: 400, itemLabel: "Journal paper", countLabel: "Total journal papers" },
        ),
        table(
          "conferencePapers",
          "Conference papers",
          9,
          "Conference Papers",
          [
            text("authors", "Author name(s)", 9, "Authors", { requirement: "required", maxLength: 500 }),
            text("title", "Paper title", 9, "Title", { requirement: "required", maxLength: 400 }),
            text("conference", "Conference name", 9, "Conference", {
              requirement: "required",
              maxLength: 300,
            }),
            text("organiser", "Organised by", 9, "Organiser", { maxLength: 200 }),
            num("year", "Year", 9, "Year", { requirement: "required", ...YEAR }),
            select("level", "Level", 9, "Level", [...CONFERENCE_LEVELS], { requirement: "required" }),
            select(
              "publicationType",
              "Proceedings indexed in",
              9,
              "Publication Type",
              [...CONFERENCE_INDEXING],
              {
                allowOther: true,
                otherOptionValue: "Other",
                otherLabel: "Specify proceedings indexing",
                otherMaxLength: 100,
              },
            ),
            text("doi", "DOI / URL", 9, "DOI", { maxLength: 300 }),
          ],
          {
            templateRows: 0,
            maxRows: 400,
            itemLabel: "Conference paper",
            countLabel: "Total conference papers",
          },
        ),
        table(
          "booksPublished",
          "Books",
          9,
          "Book",
          [
            text("authors", "Author name(s)", 9, "Authors", { requirement: "required", maxLength: 300 }),
            text("title", "Book title", 9, "Title", { requirement: "required", maxLength: 300 }),
            select("publisher", "Publisher", 9, "Publisher", [...BOOK_PUBLISHERS], {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify publisher",
              otherMaxLength: 150,
            }),
            text("isbn", "ISBN", 9, "ISBN", { maxLength: 30 }),
            num("year", "Year", 9, "Year", YEAR),
          ],
          { templateRows: 0, maxRows: 100, itemLabel: "Book", countLabel: "Total books" },
        ),
        table(
          "bookChapters",
          "Book chapters",
          9,
          "Book Chapters",
          [
            text("authors", "Author name(s)", 9, "Authors", { requirement: "required", maxLength: 300 }),
            text("chapter", "Chapter title", 9, "Chapter", { requirement: "required", maxLength: 300 }),
            text("book", "Book title", 9, "Book", { maxLength: 300 }),
            select("publisher", "Publisher", 9, "Publisher", [...BOOK_PUBLISHERS], {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify publisher",
              otherMaxLength: 150,
            }),
            num("year", "Year", 9, "Year", YEAR),
          ],
          { templateRows: 0, maxRows: 200, itemLabel: "Book chapter", countLabel: "Total book chapters" },
        ),
        num("hIndex", "h-index", 9, "H index", { integer: true, max: 500 }),
        num("i10Index", "i10-index", 9, "i10 index", { integer: true, max: 5000 }),
        num("citations", "Number of citations", 9, "Number of Citations", { integer: true, max: 10_000_000 }),
        text("scopusUrl", "Scopus author URL", 9, "Scopus URL", {
          maxLength: 300,
          pattern: { regex: "^https?://\\S+$", message: "Enter a full URL starting with https://" },
        }),
        text("orcid", "ORCID iD", 9, "ORCID ID", {
          maxLength: 19,
          pattern: {
            regex: "^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]$",
            message: "ORCID iD format is 0000-0000-0000-000X",
          },
        }),
        text("googleScholar", "Google Scholar profile link", 9, "Google Scholar Link", {
          maxLength: 300,
          pattern: { regex: "^https?://\\S+$", message: "Enter a full URL starting with https://" },
        }),
      ],
    },
    {
      id: "projects",
      title: "Research projects and patents",
      pages: [10],
      fields: [
        table(
          "researchProjects",
          "Research projects",
          10,
          "Research Project",
          [
            text("title", "Title of the project", 10, "Title", { requirement: "required", maxLength: 300 }),
            text("agency", "Agency / scheme", 10, "Agency/Scheme", {
              requirement: "required",
              maxLength: 200,
            }),
            date("sanctionedDate", "Sanctioned date", 10, "Sanctioned Date"),
            text("period", "Period", 10, "Period", { maxLength: 60, help: "For example 3 years." }),
            num("amount", "Sanctioned amount (₹)", 10, "Sanctioned Amount", { max: 10_000_000_000 }),
            select("role", "Your role", 10, "Role", [...PROJECT_ROLES], {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify project role",
              otherMaxLength: 100,
            }),
            select("status", "Status", 10, "Status", [...PROJECT_STATUS], { requirement: "required" }),
          ],
          { templateRows: 0, maxRows: 60, itemLabel: "Research project" },
        ),
        table(
          "patents",
          "Patents",
          10,
          "Patent",
          [
            text("inventors", "Name of the inventors", 10, "Name of the Inventors", {
              requirement: "required",
              maxLength: 400,
            }),
            text("title", "Title", 10, "Title", { requirement: "required", maxLength: 300 }),
            text("applicationNumber", "Application number", 10, "Application Number", { maxLength: 60 }),
            date("filingDate", "Date of filing", 10, "Date of Filing"),
            text("filedBy", "Filed by", 10, "Filed By", { maxLength: 200 }),
            select("status", "Status", 10, "Status", [...PATENT_STATUS], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify patent status",
              otherMaxLength: 60,
            }),
            date("statusDate", "Date of current status", 10, "Date"),
          ],
          { templateRows: 0, maxRows: 60, itemLabel: "Patent" },
        ),
        list("awards", "Distinctions and awards received", 10, "Distinctions and awards", {
          templateCapacity: 0,
          itemLabel: "Award",
          itemMaxLength: 600,
          maxItems: 100,
        }),
      ],
    },
    {
      id: "memberships",
      title: "Memberships, conferences and competitive exams",
      pages: [11],
      fields: [
        table(
          "memberships",
          "Membership of professional bodies",
          11,
          "Membership of Professional Bodies",
          [
            select("body", "Professional body", 11, "Body", [...PROFESSIONAL_BODIES], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify professional body",
              otherMaxLength: 150,
            }),
            select("type", "Type of membership", 11, "Type", [...MEMBERSHIP_TYPES], {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify membership type",
              otherMaxLength: 80,
            }),
            text("membershipId", "Membership number", 11, "Membership ID", { maxLength: 60 }),
            num("since", "Member since (year)", 11, "Since", YEAR),
            text("position", "Position held", 11, "Position held", { maxLength: 100 }),
          ],
          { templateRows: 0, maxRows: 30, itemLabel: "Membership" },
        ),
        table(
          "conferenceParticipation",
          "Conference / programme participation",
          11,
          "Conference participation",
          [
            text("event", "Conference / FDP / workshop", 11, "Event", {
              requirement: "required",
              maxLength: 300,
            }),
            text("organiser", "Organised by", 11, "Organiser", { maxLength: 200 }),
            num("year", "Year", 11, "Year", YEAR),
            select(
              "role",
              "Role",
              11,
              "Role",
              ["Participant", "Presenter", "Session chair", "Reviewer", "Organiser", "Resource person"],
              {},
            ),
          ],
          { templateRows: 0, maxRows: 100, itemLabel: "Event" },
        ),
        table(
          "competitiveExams",
          "GATE / NET / SET and other competitive examinations (optional)",
          11,
          "Competitive examinations",
          [
            select("exam", "Examination", 11, "Exam", [...COMPETITIVE_EXAMINATIONS], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Name of the examination",
              otherMaxLength: 80,
            }),
            text("paper", "Discipline / paper", 11, "Paper", { maxLength: 120 }),
            num("year", "Year", 11, "Year", { requirement: "required", ...YEAR }),
            text("score", "Score", 11, "Score", { maxLength: 30 }),
            text("rank", "Rank / percentile", 11, "Rank", { maxLength: 30 }),
            text("validity", "Valid until", 11, "Validity", { maxLength: 30 }),
          ],
          {
            templateRows: 0,
            maxRows: 10,
            itemLabel: "Examination",
            attachment: {
              required: false,
              label: "Score card",
              docType: "COMPETITIVE_EXAM_SCORECARD",
              allowedDocTypes: ["COMPETITIVE_EXAM_SCORECARD"],
              help: "Upload the score card if available.",
            },
          },
        ),
      ],
    },
    {
      id: "references",
      title: "References",
      pages: [12],
      description: "Give one or two persons who can be contacted about you.",
      fields: [
        table(
          "references",
          "References",
          12,
          "References",
          [
            text("name", "Name", 12, "Name", { requirement: "required", maxLength: 120 }),
            text("designation", "Designation", 12, "Designation", {
              requirement: "required",
              maxLength: 150,
            }),
            text("organisation", "Organisation", 12, "Organization", {
              requirement: "required",
              maxLength: 200,
            }),
            text("mobile", "Mobile number", 12, "Mobile No.", {
              requirement: "required",
              inputMode: "tel",
              maxLength: 16,
              pattern: MOBILE,
            }),
            text("email", "E-mail", 12, "E-mail", { inputMode: "email", maxLength: 200, pattern: EMAIL }),
            select(
              "relationship",
              "Professional relationship",
              12,
              "Relationship",
              [...REFERENCE_RELATIONSHIPS],
              {
                allowOther: true,
                otherOptionValue: "Other",
                otherLabel: "Specify relationship",
                otherMaxLength: 100,
              },
            ),
          ],
          { templateRows: 0, minRows: 1, maxRows: 2, requirement: "required", itemLabel: "Reference" },
        ),
      ],
    },
    {
      id: "salary",
      title: "Salary, joining and vacancy source",
      pages: [13],
      fields: [
        num("lastDrawnPay", "Last drawn monthly pay (₹)", 13, "Last Drawn Monthly Pay (Rs.)", {
          requirement: "required",
          max: 10_000_000,
          help: "Enter 0 if you are not employed.",
        }),
        num("expectedPay", "Pay expected, if selected (₹ per month)", 13, "Pay Expected, if Selected (Rs.)", {
          requirement: "required",
          max: 10_000_000,
        }),
        select(
          "joiningTime",
          "Joining time required, if selected",
          13,
          "Joining Time Required, if Selected",
          [...JOINING_TIME_OPTIONS],
          {
            requirement: "required",
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Joining time required",
            otherMaxLength: 60,
          },
        ),
        select(
          "vacancySource",
          "I came to know about the vacancy through",
          13,
          "I came to know about the vacancy through",
          [...VACANCY_SOURCES],
          {
            requirement: "required",
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify vacancy source",
            otherMaxLength: 100,
          },
        ),
        text("vacancySourceDetail", "Name of the known source / other source", 13, "Known Source", {
          maxLength: 200,
          requirement: "required",
          when: { key: "vacancySource", in: ["Known source", "Other"] },
        }),
      ],
    },
    {
      id: "relatives",
      title: "Relatives in PSG Institutions and other information",
      pages: [14],
      fields: [
        table(
          "relatives",
          "Close relatives / known persons employed in PSG Institutions",
          14,
          "In case of Close Relatives/Known Persons employed in PSG Institutions",
          [
            text("name", "Name", 14, "Name", { requirement: "required", maxLength: 120 }),
            select("relationship", "Relationship", 14, "Relationship", [...RELATIVE_RELATIONSHIPS], {
              requirement: "required",
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify relationship",
              otherMaxLength: 80,
            }),
            text("institution", "Institution", 14, "Institution", {
              requirement: "required",
              maxLength: 200,
            }),
            text("designation", "Designation", 14, "Designation", { maxLength: 150 }),
          ],
          { templateRows: 0, maxRows: 10, itemLabel: "Relative" },
        ),
        textarea(
          "otherInformation",
          "Any other information of importance",
          14,
          "Any other information of importance",
          {
            maxLength: 5000,
            wide: true,
          },
        ),
      ],
    },
  ];
}

/** Sections kept from the official Professor / Associate Professor form (v1), all optional. */
function seniorSections(): SectionDef[] {
  return [
    {
      id: "teaching",
      title: "Teaching, consultancy and institutional contribution",
      pages: [15],
      description: "From the official Professor / Associate Professor form. Fill in what applies to you.",
      fields: [
        list("subjectsUg", "Subjects taught during the last five years — UG", 15, "Subjects UG", {
          templateCapacity: 0,
          itemLabel: "Subject",
          itemMaxLength: 200,
          maxItems: 40,
        }),
        list("subjectsPg", "Subjects taught during the last five years — PG", 15, "Subjects PG", {
          templateCapacity: 0,
          itemLabel: "Subject",
          itemMaxLength: 200,
          maxItems: 40,
        }),
        table("courseMaterials", "Course materials prepared", 15, "Course materials", titleYear(15), {
          templateRows: 0,
          maxRows: 30,
          itemLabel: "Course material",
        }),
        table("labManuals", "Laboratory manuals prepared", 15, "Lab manuals", titleYear(15), {
          templateRows: 0,
          maxRows: 30,
          itemLabel: "Laboratory manual",
        }),
        table("monographs", "Monographs prepared", 15, "Monographs", titleYear(15), {
          templateRows: 0,
          maxRows: 30,
          itemLabel: "Monograph",
        }),
        table(
          "consultancy",
          "Consultancy activities (last three years)",
          15,
          "Consultancy",
          [
            text("job", "Consultancy job / project", 15, "Job", { requirement: "required", maxLength: 300 }),
            text("organisation", "Organisation", 15, "Organisation", { maxLength: 200 }),
            text("projectLeader", "Project leader", 15, "Leader", { maxLength: 150 }),
            text("revenue", "Revenue generated", 15, "Revenue", { maxLength: 60 }),
          ],
          { templateRows: 0, maxRows: 30, itemLabel: "Consultancy" },
        ),
        table(
          "testing",
          "Testing activities (last three years)",
          15,
          "Testing",
          [
            text("job", "Testing job", 15, "Job", { requirement: "required", maxLength: 300 }),
            text("organisation", "Organisation", 15, "Organisation", { maxLength: 200 }),
            text("testsDone", "No. of tests done", 15, "Tests", { maxLength: 30 }),
            text("revenue", "Revenue generated", 15, "Revenue", { maxLength: 60 }),
          ],
          { templateRows: 0, maxRows: 30, itemLabel: "Testing activity" },
        ),
        table(
          "ceOrganised",
          "Continuing education programmes organised (last three years)",
          15,
          "CE programmes",
          [
            text("programme", "Programme", 15, "Programme", { requirement: "required", maxLength: 300 }),
            text("duration", "Duration", 15, "Duration", { maxLength: 60 }),
            text("period", "Period", 15, "Period", { maxLength: 60 }),
            num("participants", "No. of participants", 15, "Participants", { integer: true }),
            text("involvement", "Nature of involvement", 15, "Involvement", { maxLength: 200 }),
          ],
          { templateRows: 0, maxRows: 30, itemLabel: "Programme" },
        ),
        textarea(
          "labModels",
          "Laboratory models / teaching aids / new experiments (last three years)",
          15,
          "Lab models",
          {
            maxLength: 6000,
            wide: true,
          },
        ),
        textarea(
          "teachingInnovations",
          "Innovations in teaching / evaluation (last three years)",
          15,
          "Innovations",
          {
            maxLength: 6000,
            wide: true,
          },
        ),
        table(
          "mentorship",
          "Mentorship (last three years)",
          15,
          "Mentorship",
          [
            text("class", "Class", 15, "Class", { requirement: "required", maxLength: 100 }),
            text("year", "Year", 15, "Year", { maxLength: 20 }),
            text("contribution", "Specific contribution", 15, "Contribution", { maxLength: 500 }),
          ],
          { templateRows: 0, maxRows: 30, itemLabel: "Mentorship" },
        ),
        list("studentProjectsUg", "Student projects supervised — UG (last three years)", 15, "UG projects", {
          templateCapacity: 0,
          itemLabel: "Project",
          itemMaxLength: 400,
          maxItems: 100,
        }),
        list("studentProjectsPg", "Student projects supervised — PG (last three years)", 15, "PG projects", {
          templateCapacity: 0,
          itemLabel: "Project",
          itemMaxLength: 400,
          maxItems: 100,
        }),
      ],
    },
  ];
}

const UPLOADS: UploadGroup[] = [
  {
    id: "photo",
    title: "Photograph",
    help: "Recent passport-size colour photograph. JPEG or PNG, up to 2 MB. It is printed on your application.",
    types: ["PHOTOGRAPH"],
    required: true,
    single: true,
  },
  {
    id: "signature",
    title: "Signature",
    help: "Your signature in dark ink on white paper, scanned or photographed. JPEG or PNG. It is printed on your application.",
    types: ["SIGNATURE"],
    required: true,
    single: true,
  },
  {
    id: "resume",
    title: "Resume / CV",
    help: "PDF only.",
    types: ["RESUME"],
    required: true,
    single: true,
  },
  {
    id: "school",
    title: "SSLC and HSC mark sheets",
    help: "Optional. College degree certificates are attached to each qualification in the College education step.",
    types: ["MARK_SHEET"],
    required: false,
  },
  {
    id: "phd",
    title: "Ph.D. degree / provisional certificate",
    help: "Required when your Ph.D. is awarded.",
    types: ["PHD_CERTIFICATE"],
    required: { key: "phdStatus", in: ["Awarded"] },
  },
  {
    id: "salary",
    title: "Last drawn salary certificate / salary slip",
    help: "Required if you have any work experience.",
    types: ["SALARY_SLIP"],
    required: "hasExperience",
  },
  {
    id: "service",
    title: "Service / experience certificate from your present employer",
    help: "Required if you are currently employed.",
    types: ["SERVICE_CERTIFICATE"],
    required: { key: "currentlyEmployed", in: ["Yes"] },
  },
  {
    id: "appointment",
    title: "Appointment order",
    help: "Upload your present or most recent appointment order, where applicable.",
    types: ["APPOINTMENT_ORDER"],
    required: false,
  },
  {
    id: "noc",
    title: "No objection certificate from present employer",
    help: "If required by the vacancy or available.",
    types: ["NO_OBJECTION_CERTIFICATE"],
    required: false,
  },
  {
    id: "memberships",
    title: "Professional membership certificates",
    help: "Kept separate from general attachments.",
    types: ["MEMBERSHIP_CERTIFICATE"],
    required: false,
  },
  {
    id: "publications",
    title: "Publication proofs",
    help: "First page or acceptance letter of your papers (one combined PDF is fine).",
    types: ["PUBLICATION_PROOF"],
    required: false,
  },
  {
    id: "community",
    title: "Community certificate",
    help: "If applicable.",
    types: ["COMMUNITY_CERTIFICATE"],
    required: false,
  },
  {
    id: "other",
    title: "Other supporting documents",
    help: "Anything else you want the selection committee to see.",
    types: ["OTHER"],
    required: false,
  },
];

const DECLARATION: SectionDef = {
  id: "declaration",
  title: "Place of application",
  pages: [17],
  fields: [
    text("place", "Place", 17, "Place", { requirement: "required", maxLength: 100 }),
    derived("declarationDate", "Date", 17, "Date", "today"),
  ],
};

const DOCUMENTS: SectionDef = {
  id: "documents",
  title: "Documents and uploads",
  pages: [16],
  kind: "uploads",
  description: "Photograph, signature and resume are mandatory. Other uploads are kept in separate groups.",
  fields: [],
};

function build(code: FormCode, title: string, extra: SectionDef[]): FormDefinition {
  return {
    code,
    version: 2,
    title,
    sourceDocument: "PSG College of Technology faculty application 2026-27 (online form)",
    templatePath: "builtin:faculty-v2",
    renderer: "pdf",
    sourcePageCount: 1,
    sections: [...commonSections(), ...extra, DOCUMENTS, DECLARATION],
    uploads: UPLOADS,
    preservedText: [
      {
        id: "declaration",
        page: 17,
        text: "I hereby declare that the information furnished herein above is correct and true to the best of my knowledge.",
        note: "Confirmed by the candidate before submission and printed on the application.",
      },
      {
        id: "endorsement",
        page: 17,
        text: "(Endorsement of the present employer) FORWARDED Place : Date : (Seal) Signature of the present employer",
        note: "Original employer-endorsement block kept on the printed application; never filled by the portal.",
      },
      {
        id: "note",
        page: 17,
        text: "Candidates already employed should send their applications only through their present employer. Applications incomplete in any respect or from candidates who do not fully satisfy the prescribed qualifications are liable to be rejected.",
        note: "Preserved from the official form.",
      },
    ],
  };
}

export const assistantProfessorV2 = build(
  "ASSISTANT_PROFESSOR",
  "APPLICATION for the post of ASSISTANT PROFESSOR",
  [],
);

export const associateProfessorV2 = build(
  "ASSOCIATE_PROFESSOR",
  "APPLICATION for the post of PROFESSOR / ASSOCIATE PROFESSOR",
  seniorSections(),
);
