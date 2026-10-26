/**
 * Centralized, authoritative source of truth for all structured options, dropdown choices,
 * and controlled values across the PSG College of Technology Staff Recruitment Portal.
 *
 * Used consistently across:
 * - Application wizard form definitions and validators
 * - Candidate UI rendering (select, SelectWithOther, datalist/searchable dropdowns)
 * - Filtering and search on HR, Admin, and HOD dashboards
 * - PDF generation and label formatting
 * - CSV export serialization
 */

export const INDIAN_RELIGIONS = [
  { value: "Hindu", label: "Hindu" },
  { value: "Muslim", label: "Muslim" },
  { value: "Christian", label: "Christian" },
  { value: "Sikh", label: "Sikh" },
  { value: "Buddhist", label: "Buddhist" },
  { value: "Jain", label: "Jain" },
  { value: "Parsi", label: "Parsi (Zoroastrian)" },
  { value: "Jewish", label: "Jewish" },
  { value: "Others", label: "Others" },
] as const;

export const INDIAN_STATES = [
  "Tamil Nadu",
  "Kerala",
  "Karnataka",
  "Andhra Pradesh",
  "Telangana",
  "Maharashtra",
  "Delhi",
  "Puducherry",
  "Gujarat",
  "Uttar Pradesh",
  "West Bengal",
  "Rajasthan",
  "Madhya Pradesh",
  "Bihar",
  "Punjab",
  "Haryana",
  "Odisha",
  "Assam",
  "Jharkhand",
  "Chhattisgarh",
  "Uttarakhand",
  "Himachal Pradesh",
  "Goa",
  "Other State / UT",
] as const;

export const MOTHER_TONGUES = [
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Hindi",
  "English",
  "Urdu",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Odia",
  "Punjabi",
  "Other",
] as const;

export const NATIONALITIES = [
  "Indian",
  "Overseas Citizen of India (OCI)",
  "Non-Resident Indian (NRI)",
  "Other",
] as const;

export const SCHOOL_BOARDS = [
  "State Board (Tamil Nadu)",
  "CBSE (Central Board of Secondary Education)",
  "ICSE / ISC (Council for the Indian School Certificate Examinations)",
  "Matriculation (Tamil Nadu)",
  "Anglo-Indian",
  "State Board (Kerala)",
  "State Board (Karnataka)",
  "State Board (Andhra Pradesh / Telangana)",
  "National Institute of Open Schooling (NIOS)",
  "International Baccalaureate (IB)",
  "Cambridge / IGCSE",
  "Other",
] as const;

export const HSC_MAJOR_STREAMS = [
  "Mathematics, Physics, Chemistry, Computer Science",
  "Mathematics, Physics, Chemistry, Biology",
  "Mathematics, Physics, Chemistry, Biotechnology",
  "Physics, Chemistry, Botany, Zoology",
  "Commerce, Accountancy, Economics, Computer Science",
  "Commerce, Accountancy, Economics, Business Mathematics",
  "Vocational / Engineering Group",
  "Other",
] as const;

export const MODES_OF_EDUCATION = [
  "Full-time",
  "Part-time",
  "Distance Education",
] as const;

export const QUALIFICATION_LEVELS = [
  { value: "UG", label: "UG — Under-graduate" },
  { value: "PG", label: "PG — Post-graduate" },
  { value: "MPHIL", label: "M.Phil." },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "OTHER", label: "Other" },
] as const;

export const ACADEMIC_DEGREES = [
  // Undergraduate
  "B.E.",
  "B.Tech.",
  "B.Sc.",
  "B.C.A.",
  "B.Com.",
  "B.B.A.",
  "B.A.",
  "B.Arch.",
  "B.Des.",
  "B.Pharm.",
  // Postgraduate
  "M.E.",
  "M.Tech.",
  "M.S. (by Research)",
  "M.Sc.",
  "M.C.A.",
  "M.B.A.",
  "M.Com.",
  "M.A.",
  "M.Arch.",
  "M.Des.",
  "M.Pharm.",
  // Doctoral & Research
  "Ph.D.",
  "M.Phil.",
  "D.Sc.",
  // Diploma
  "Diploma in Engineering",
  "Post Graduate Diploma",
  "Polytechnic Diploma",
  "Other",
] as const;

export const ACADEMIC_DISCIPLINES = [
  "Computer Science and Engineering",
  "Information Technology",
  "Artificial Intelligence and Data Science",
  "Electrical and Electronics Engineering",
  "Electronics and Communication Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Automobile Engineering",
  "Biomedical Engineering",
  "Biotechnology",
  "Chemical Engineering",
  "Metallurgical Engineering",
  "Production Engineering",
  "Robotics and Automation",
  "Textile Technology",
  "Fashion Technology",
  "Apparel Technology",
  "Applied Mathematics",
  "Physics",
  "Chemistry",
  "English / Humanities",
  "Computer Applications (MCA)",
  "Management Sciences (MBA)",
  "Other",
] as const;

export const QUALIFICATION_CLASSES = [
  "First Class with Distinction / Honours",
  "First Class",
  "Second Class",
  "Other",
] as const;

export const PHD_STATUS_OPTIONS = [
  "Awarded",
  "Thesis submitted",
  "Pursuing",
  "Not applicable",
] as const;

export const DESIGNATIONS = [
  "Assistant Professor",
  "Assistant Professor (Senior Grade)",
  "Assistant Professor (Selection Grade)",
  "Associate Professor",
  "Professor",
  "Professor & Head",
  "Lecturer",
  "Senior Lecturer",
  "Visiting Faculty / Professor",
  "Adjunct Faculty",
  "Research Associate / Scientist",
  "Postdoctoral Fellow",
  "Software Engineer / Developer",
  "Senior Software Engineer",
  "Lead Engineer / Technical Architect",
  "Technical Lead / Project Manager",
  "Research & Development Engineer",
  "Other",
] as const;

export const EMPLOYMENT_NATURE = [
  "Teaching",
  "Industry",
  "Research",
  "Other",
] as const;

export const EMPLOYMENT_TYPES = [
  "Regular",
  "Contract",
  "Ad hoc",
  "Visiting",
  "Temporary",
  "Probationary",
  "Other",
] as const;

export const SERVICE_CERTIFICATE_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
] as const;

export const JOURNAL_PUBLICATION_TYPES = [
  "SCI / SCIE",
  "Scopus",
  "Web of Science",
  "UGC-CARE",
  "Peer Reviewed International Journal",
  "Peer Reviewed National Journal",
  "Other",
] as const;

export const CONFERENCE_LEVELS = [
  "International",
  "National",
] as const;

export const CONFERENCE_INDEXING = [
  "Scopus",
  "Web of Science",
  "IEEE Xplore",
  "Springer",
  "ACM Digital Library",
  "Not indexed",
  "Other",
] as const;

export const BOOK_PUBLISHERS = [
  "Springer",
  "Elsevier",
  "IEEE Press",
  "Wiley",
  "Taylor & Francis / CRC Press",
  "Oxford University Press",
  "Cambridge University Press",
  "McGraw Hill",
  "Pearson",
  "Prentice Hall of India (PHI)",
  "Tata McGraw-Hill",
  "Other",
] as const;

export const PROJECT_ROLES = [
  "Principal Investigator",
  "Co-Investigator",
  "Project Coordinator",
  "Consultant / Lead Researcher",
  "Other",
] as const;

export const PROJECT_STATUS = [
  "Ongoing",
  "Completed",
  "Sanctioned",
] as const;

export const PATENT_STATUS = [
  "Filed",
  "Published",
  "Under Examination",
  "Granted",
  "Commercialized",
  "Other",
] as const;

export const COMPETITIVE_EXAMINATIONS = [
  "GATE",
  "UGC-NET",
  "CSIR-NET",
  "SET",
  "SLET",
  "Other",
] as const;

export const PROFESSIONAL_BODIES = [
  "IEEE",
  "ACM",
  "ISTE",
  "CSI",
  "IEI",
  "IETE",
  "ASME",
  "SAE",
  "Other",
] as const;

export const MEMBERSHIP_TYPES = [
  "Life Member",
  "Senior Member",
  "Fellow",
  "Annual Member",
  "Associate Member",
  "Student Member",
  "Other",
] as const;

export const JOINING_TIME_OPTIONS = [
  "Immediate",
  "15 days",
  "1 month",
  "2 months",
  "3 months",
  "Other",
] as const;

export const VACANCY_SOURCES = [
  "The Hindu newspaper",
  "Naukri.com",
  "College website",
  "LinkedIn",
  "Times of India",
  "Daily Thanthi",
  "Known source",
  "Other",
] as const;

export const RELATIVE_RELATIONSHIPS = [
  "Father",
  "Mother",
  "Spouse",
  "Brother",
  "Sister",
  "Son",
  "Daughter",
  "Uncle",
  "Aunt",
  "Cousin",
  "In-law",
  "Known Person / Colleague",
  "Other",
] as const;

export const REFERENCE_RELATIONSHIPS = [
  "Ph.D. Supervisor",
  "Head of Department",
  "Principal / Director",
  "Dean",
  "Senior Professor",
  "Colleague / Professor",
  "Former Employer / Manager",
  "Industry Guide / Mentor",
  "Other",
] as const;
