import { date, derived, monthYear, num, select, table, text, textarea } from "../builders";
import {
  ACADEMIC_DEGREES,
  ACADEMIC_DISCIPLINES,
  COMPETITIVE_EXAMINATIONS,
  CONFERENCE_INDEXING,
  CONFERENCE_LEVELS,
  EMPLOYMENT_NATURE,
  EMPLOYMENT_TYPES,
  HSC_MAJOR_STREAMS,
  INDIAN_RELIGIONS,
  INDIAN_STATES,
  JOURNAL_PUBLICATION_TYPES,
  MODES_OF_EDUCATION,
  MOTHER_TONGUES,
  NATIONALITIES,
  PATENT_STATUS,
  PHD_STATUS_OPTIONS,
  QUALIFICATION_CLASSES,
  QUALIFICATION_LEVELS,
  REFERENCE_RELATIONSHIPS,
  SCHOOL_BOARDS,
} from "../options";
import type { FormDefinition, ScalarField, SectionDef, UploadGroup } from "../types";

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

const SECTIONS: SectionDef[] = [
  {
    id: "post",
    title: "Position and research area",
    pages: [1],
    description:
      "These details are populated from the research vacancy you are applying for.",
    fields: [
      derived("appliedPost", "Post applied for", 1, "Post", "vacancy.position"),
      derived("specialisation", "Research specialisation / Area", 1, "Specialisation", "vacancy.specialisation"),
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
      }),
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
      select("hscMajor", "HSC — Major subjects (group)", 4, "Major subject", [...HSC_MAJOR_STREAMS], {
        requirement: "required",
        allowOther: true,
        otherOptionValue: "Other",
        otherLabel: "Specify HSC major subjects",
        otherMaxLength: 150,
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
    ],
  },
  {
    id: "college",
    title: "College qualifications & examinations",
    pages: [5],
    description:
      "Add your UG and PG degrees and any other higher education qualifications. Add competitive examinations (GATE, NET, etc.) if applicable.",
    fields: [
      table(
        "collegeQualifications",
        "College qualifications",
        5,
        "UG / PG / Others",
        [
          select(
            "level",
            "Level",
            5,
            "Level",
            [...QUALIFICATION_LEVELS],
            { requirement: "required" },
          ),
          select("degree", "Degree", 5, "Degree", [...ACADEMIC_DEGREES], {
            requirement: "required",
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify degree (e.g. B.Tech., M.Tech., M.Sc.)",
            otherMaxLength: 100,
          }),
          select("specialisation", "Branch / specialisation", 5, "Specialisation", [...ACADEMIC_DISCIPLINES], {
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify branch / specialisation",
            otherMaxLength: 150,
          }),
          text("college", "College / Institute", 5, "College", { requirement: "required", maxLength: 200 }),
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
            otherLabel: "Specify class awarded",
            otherMaxLength: 80,
          }),
          select("mode", "Mode of study", 5, "Mode of study", MODE, { requirement: "required" }),
        ],
        {
          templateRows: 0,
          minRows: 1,
          maxRows: 10,
          itemLabel: "Qualification",
          attachment: {
            required: false,
            label: "Degree certificate / consolidated mark sheet",
            docType: "DEGREE_CERTIFICATE",
            allowedDocTypes: ["DEGREE_CERTIFICATE", "MARK_SHEET"],
            help: "Upload the degree certificate or consolidated mark sheet (PDF, JPEG or PNG up to 10 MB).",
          },
        },
      ),
      select("phdStatus", "Ph.D. status", 5, "Ph.D. status", [...PHD_STATUS_OPTIONS], {
        requirement: "required",
      }),
      text("phdTitle", "Ph.D. thesis title", 5, "Ph.D. title", {
        when: HAS_PHD,
        maxLength: 300,
        wide: true,
      }),
      text("phdUniversity", "Ph.D. university / institution", 5, "Ph.D. university", {
        when: HAS_PHD,
        maxLength: 200,
      }),
      num("phdYear", "Year of award / submission", 5, "Year", {
        when: HAS_PHD,
        ...YEAR,
      }),
      table(
        "competitiveExams",
        "National-level competitive examinations",
        5,
        "Competitive Exam",
        [
          select("exam", "Examination", 5, "Exam", [...COMPETITIVE_EXAMINATIONS], {
            requirement: "required",
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify examination",
            otherMaxLength: 100,
          }),
          text("rollNumber", "Roll / Registration number", 5, "Roll no.", { maxLength: 60 }),
          num("year", "Year qualified", 5, "Year", { requirement: "required", ...YEAR }),
          text("score", "Score / Marks", 5, "Score", { maxLength: 30 }),
          text("rank", "All-India Rank (AIR)", 5, "Rank", { maxLength: 30 }),
          text("validTill", "Valid till", 5, "Validity", { maxLength: 30 }),
        ],
        {
          templateRows: 0,
          maxRows: 10,
          itemLabel: "Examination",
          countLabel: "Total competitive examinations",
          attachment: {
            required: false,
            label: "Score card",
            docType: "COMPETITIVE_EXAM_SCORECARD",
            allowedDocTypes: ["COMPETITIVE_EXAM_SCORECARD"],
            help: "Upload your scorecard or qualification certificate.",
          },
        },
      ),
    ],
  },
  {
    id: "research",
    title: "Research background & skills",
    pages: [6],
    description:
      "Highlight your research interests, hands-on technical proficiencies, and past research project experience.",
    fields: [
      textarea("statementOfPurpose", "Statement of purpose / Research motivation", 6, "Statement of purpose", {
        requirement: "required",
        maxLength: 2500,
        rows: 5,
        wide: true,
        help: "Describe your research background, areas of interest, and why you are applying for this research appointment (up to 2,500 characters).",
      }),
      textarea(
        "technicalSkills",
        "Technical & laboratory skills / Software proficiencies",
        6,
        "Technical skills",
        {
          requirement: "required",
          maxLength: 1500,
          rows: 4,
          wide: true,
          help: "List programming languages, specialised tools (MATLAB, LabVIEW, ROS, ANSYS, PyTorch, etc.), laboratory equipment or characterisation techniques you are proficient with.",
        },
      ),
      table(
        "researchProjects",
        "Research & academic projects",
        6,
        "Research Project",
        [
          text("title", "Project title", 6, "Title", { requirement: "required", maxLength: 300 }),
          text("role", "Role / Responsibilities", 6, "Role", { requirement: "required", maxLength: 150 }),
          text("guide", "Supervisor / Principal Investigator", 6, "Guide", { maxLength: 150 }),
          text("institution", "Institution / Laboratory", 6, "Institution", { maxLength: 200 }),
          text("duration", "Duration (e.g. 6 months, 2024-2025)", 6, "Duration", { maxLength: 80 }),
          textarea("summary", "Brief outcome / Key contribution", 6, "Summary", {
            maxLength: 500,
            rows: 2,
            wide: true,
          }),
        ],
        {
          templateRows: 0,
          maxRows: 20,
          itemLabel: "Project",
          countLabel: "Total research projects",
        },
      ),
    ],
  },
  {
    id: "publications",
    title: "Publications & patents",
    pages: [7],
    description: "Provide details of your published research articles, conference proceedings, and patents.",
    fields: [
      table(
        "journalPapers",
        "Refereed journal papers",
        7,
        "Journal Paper",
        [
          text("authors", "Author name(s)", 7, "Authors", { requirement: "required", maxLength: 300 }),
          text("title", "Paper title", 7, "Title", { requirement: "required", maxLength: 300 }),
          text("journal", "Journal name", 7, "Journal", { requirement: "required", maxLength: 200 }),
          num("year", "Year", 7, "Year", { requirement: "required", ...YEAR }),
          text("volume", "Volume / Issue / Pages", 7, "Volume", { maxLength: 80 }),
          select("publicationType", "Indexing", 7, "Indexing", [...JOURNAL_PUBLICATION_TYPES], {
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify indexing",
            otherMaxLength: 80,
          }),
          text("doi", "DOI / Article URL", 7, "DOI", { maxLength: 300 }),
        ],
        {
          templateRows: 0,
          maxRows: 100,
          itemLabel: "Journal paper",
          countLabel: "Total journal papers",
        },
      ),
      table(
        "conferencePapers",
        "Conference presentations & proceedings",
        7,
        "Conference Paper",
        [
          text("authors", "Author name(s)", 7, "Authors", { requirement: "required", maxLength: 300 }),
          text("title", "Paper title", 7, "Title", { requirement: "required", maxLength: 300 }),
          text("conference", "Conference name", 7, "Conference", {
            requirement: "required",
            maxLength: 300,
          }),
          num("year", "Year", 7, "Year", { requirement: "required", ...YEAR }),
          select("level", "Level", 7, "Level", [...CONFERENCE_LEVELS], { requirement: "required" }),
          select(
            "publicationType",
            "Proceedings indexed in",
            7,
            "Publication Type",
            [...CONFERENCE_INDEXING],
            {
              allowOther: true,
              otherOptionValue: "Other",
              otherLabel: "Specify indexing",
              otherMaxLength: 100,
            },
          ),
          text("doi", "DOI / URL", 7, "DOI", { maxLength: 300 }),
        ],
        {
          templateRows: 0,
          maxRows: 100,
          itemLabel: "Conference paper",
          countLabel: "Total conference papers",
        },
      ),
      table(
        "patents",
        "Patents & intellectual property",
        7,
        "Patent",
        [
          text("title", "Patent title", 7, "Title", { requirement: "required", maxLength: 300 }),
          text("number", "Application / Patent number", 7, "Patent number", { maxLength: 100 }),
          select("status", "Status", 7, "Status", [...PATENT_STATUS], { requirement: "required" }),
          num("year", "Year", 7, "Year", YEAR),
        ],
        {
          templateRows: 0,
          maxRows: 20,
          itemLabel: "Patent",
          countLabel: "Total patents",
        },
      ),
      num("hIndex", "h-index (if available)", 7, "H-index", { integer: true, max: 200 }),
      num("citations", "Total citations (if available)", 7, "Citations", { integer: true, max: 100000 }),
      text("scopusUrl", "Scopus author profile URL", 7, "Scopus URL", { maxLength: 300 }),
      text("googleScholar", "Google Scholar profile URL", 7, "Google Scholar", { maxLength: 300 }),
      text("orcid", "ORCID iD", 7, "ORCID ID", { maxLength: 19 }),
    ],
  },
  {
    id: "experience",
    title: "Experience",
    pages: [8],
    description: "Provide details of your research, project, industry, or academic employment.",
    fields: [
      table(
        "experience",
        "Positions held",
        8,
        "Positions held",
        [
          text("designation", "Designation / Role", 8, "Designation", {
            requirement: "required",
            maxLength: 150,
          }),
          text("organisation", "Organisation / Institute", 8, "Organisation", {
            requirement: "required",
            maxLength: 200,
          }),
          select(
            "nature",
            "Nature of work",
            8,
            "Nature",
            ["Research", "Project Assistantship", "Industry", "Teaching", "Other"],
            { requirement: "required" },
          ),
          select("employmentType", "Employment type", 8, "Type", [...EMPLOYMENT_TYPES], {
            requirement: "required",
          }),
          date("from", "From", 8, "From", { requirement: "required" }),
          select("isCurrent", "Currently working here?", 8, "Current", YES_NO, { requirement: "required" }),
          date("to", "To", 8, "To", { requirement: "required", when: NOT_CURRENT }),
          derived("duration", "Duration", 8, "Duration", "row.duration"),
          text("scaleOfPay", "Stipend / Emoluments (₹ per month)", 8, "Emoluments", { maxLength: 80 }),
          text("reasonForLeaving", "Reason for leaving", 8, "Reason for leaving", {
            maxLength: 300,
            when: NOT_CURRENT,
          }),
        ],
        {
          templateRows: 0,
          maxRows: 20,
          itemLabel: "Position",
          attachment: {
            required: false,
            label: "Experience / testimonial certificate",
            docType: "EXPERIENCE_CERTIFICATE",
            allowedDocTypes: ["EXPERIENCE_CERTIFICATE", "SERVICE_CERTIFICATE"],
            help: "Upload experience certificate or appointment/relieving order if available.",
          },
        },
      ),
      derived("totalExperience", "Total experience", 8, "Total experience", "experience.total"),
      select("currentlyEmployed", "Are you currently employed?", 8, "Currently employed", YES_NO, {
        requirement: "required",
      }),
      text("presentPost", "Present post / role", 8, "Present post", {
        when: EMPLOYED,
        maxLength: 150,
      }),
      num("totalEmoluments", "Current emoluments / stipend (₹ per month)", 8, "Total emoluments", {
        when: EMPLOYED,
      }),
    ],
  },
  {
    id: "references",
    title: "Referees",
    pages: [9],
    description: "Provide at least one academic or professional referee (preferably project guides or faculty).",
    fields: [
      table(
        "references",
        "Referees",
        9,
        "References",
        [
          text("name", "Name of referee", 9, "Name", { requirement: "required", maxLength: 120 }),
          text("designation", "Designation", 9, "Designation", { requirement: "required", maxLength: 120 }),
          text("organisation", "Organisation / University", 9, "Organisation", {
            requirement: "required",
            maxLength: 200,
          }),
          text("address", "Postal address", 9, "Address", { maxLength: 300 }),
          text("mobile", "Mobile number", 9, "Mobile", {
            requirement: "required",
            inputMode: "tel",
            maxLength: 16,
            pattern: MOBILE,
          }),
          text("email", "E-mail address", 9, "Email", {
            requirement: "required",
            inputMode: "email",
            maxLength: 200,
            pattern: EMAIL,
          }),
          select("relationship", "Professional relationship", 9, "Relationship", [...REFERENCE_RELATIONSHIPS], {
            allowOther: true,
            otherOptionValue: "Other",
            otherLabel: "Specify relationship",
            otherMaxLength: 100,
          }),
        ],
        {
          templateRows: 0,
          minRows: 1,
          maxRows: 3,
          itemLabel: "Referee",
          requirement: "required",
        },
      ),
    ],
  },
  {
    id: "documents",
    title: "Documents and uploads",
    pages: [10],
    kind: "uploads",
    description: "Photograph, signature and resume/CV are mandatory. Other proofs support your application.",
    fields: [],
  },
  {
    id: "declaration",
    title: "Declaration",
    pages: [11],
    fields: [
      text("place", "Place", 11, "Place", { requirement: "required", maxLength: 100 }),
      derived("declarationDate", "Date", 11, "Date", "today"),
    ],
  },
];

const UPLOADS: UploadGroup[] = [
  {
    id: "photo",
    title: "Passport-size photograph",
    help: "Clear recent colour passport photo (JPEG or PNG, up to 10 MB). Printed on your application.",
    types: ["PHOTOGRAPH"],
    required: true,
    single: true,
  },
  {
    id: "signature",
    title: "Signature of the candidate",
    help: "Sign on plain white paper, scan or photograph clearly (JPEG or PNG, up to 10 MB).",
    types: ["SIGNATURE"],
    required: true,
    single: true,
  },
  {
    id: "resume",
    title: "Detailed curriculum vitae (CV / Resume)",
    help: "PDF document including your academic background, research work, publications, and projects (up to 10 MB).",
    types: ["RESUME"],
    required: true,
    single: true,
  },
  {
    id: "qualifications",
    title: "Degree certificates and mark sheets",
    help: "Attested copies of UG, PG, and higher qualification degree certificates and mark sheets (PDF, JPEG or PNG).",
    types: ["DEGREE_CERTIFICATE", "MARK_SHEET", "PHD_CERTIFICATE"],
    required: true,
  },
  {
    id: "scorecard",
    title: "GATE / NET / CSIR score card",
    help: "Score card for competitive examinations mentioned in your application.",
    types: ["COMPETITIVE_EXAM_SCORECARD"],
    required: false,
  },
  {
    id: "publications",
    title: "Publication proofs",
    help: "First page or acceptance copy of research papers and patent filings.",
    types: ["PUBLICATION_PROOF", "PUBLICATIONS"],
    required: false,
  },
  {
    id: "experience",
    title: "Experience / Testimonial certificates",
    help: "Experience certificates or appointment letters for previous research/industry appointments.",
    types: ["EXPERIENCE_CERTIFICATE", "SERVICE_CERTIFICATE"],
    required: false,
  },
  {
    id: "community",
    title: "Community certificate",
    help: "If applicable (BC / BCM / MBC / DNC / SC / SCA / ST).",
    types: ["COMMUNITY_CERTIFICATE"],
    required: false,
  },
  {
    id: "other",
    title: "Other supporting documents",
    help: "Any additional documents, awards, project reports, or certifications.",
    types: ["OTHER"],
    required: false,
  },
];

export const researchApplicationV1: FormDefinition = {
  code: "RESEARCH_APPLICATION",
  version: 1,
  title: "Application for Research Position",
  sourceDocument: "PSG College of Technology Research Recruitment (online form)",
  templatePath: "builtin:research-v1",
  renderer: "pdf",
  sourcePageCount: 1,
  sections: SECTIONS,
  uploads: UPLOADS,
  preservedText: [
    {
      id: "declaration",
      page: 11,
      text: "I hereby declare that the information furnished herein above is correct and true to the best of my knowledge and belief.",
      note: "Confirmed by the candidate before submission and rendered onto the PDF.",
    },
    {
      id: "note",
      page: 11,
      text: "Applications incomplete in any respect or from candidates who do not fully satisfy the prescribed eligibility criteria are liable to be rejected.",
      note: "Preserved official declaration.",
    },
  ],
};
