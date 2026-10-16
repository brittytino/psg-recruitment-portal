/**
 * Synthetic application fixtures. All people, institutions and numbers are fictitious.
 * Never replace these with real candidate data.
 */
import { deflateSync } from "node:zlib";
import type { Answers } from "~/modules/forms/types";

const repeat = <T>(n: number, fn: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => fn(i));

export const assistantMinimal: Answers = {
  salutation: "Dr.",
  name: "Test Candidate",
  addressType: "Present",
  address: "12, Example Street\nSample Nagar\nCoimbatore 641004",
  phone: "+91 90000 00000",
  email: "candidate@example.test",
  dateOfBirth: "1990-05-12",
  gender: "F",
  placeOfBirth: "Salem",
  district: "Salem",
  state: "Tamil Nadu",
  motherTongue: "Tamil",
  nationality: "Indian",
  academicQualifications: [
    { degree: "B.E.", university: "Example University", institution: "Example College of Engineering", classOrMarks: "First / 82%", monthYearOfPassing: "2011-05" },
  ],
  specialisation: "Computer Science",
  joiningTime: "One month",
  reference1: "Dr. A. Referee\nProfessor\nExample Institute\nChennai",
  reference2: "Dr. B. Referee\nProfessor\nSample University\nMadurai",
  place: "Coimbatore",
  declarationDate: "2026-10-01",
};

export const assistantFull: Answers = {
  ...assistantMinimal,
  name: "Venkataramanan Subramaniam Krishnaswamy Iyer",
  religion: "Example Religion",
  community: "Example Community",
  academicQualifications: repeat(9, (i) => ({
    degree: ["B.E.", "M.E.", "Ph.D.", "PG Diploma", "M.B.A.", "B.Sc.", "M.Sc.", "M.Phil.", "Diploma"][i]!,
    university: `Example University Number ${i + 1} with a deliberately long name`,
    institution: `Institution of Advanced Technology & Research, Campus ${i + 1} — “Quoted” <special> & chars`,
    classOrMarks: `First Class with Distinction / ${80 + i}%`,
    monthYearOfPassing: `${2005 + i}-0${(i % 9) + 1}`,
  })),
  experience: repeat(11, (i) => ({
    post: `Assistant Professor (Senior Grade) ${i + 1}`,
    employer: `Example Engineering College ${i + 1}, Coimbatore`,
    payScale: "Rs. 57,700 – 1,82,400 (Level 10)",
    from: `${2010 + i}-06-01`,
    to: i === 10 ? null : `${2011 + i}-05-31`,
    years: 1,
    months: 0,
    nature: ["Teaching", "Industrial", "Research"][i % 3]!,
  })),
  memberships: "Life Member, Example Society for Technical Education\nMember, Institute of Example Engineers\nSenior Member, Example Professional Body",
  publications: repeat(40, (i) =>
    `Author A, Author B, "A deliberately long research title number ${i + 1} on scalable distributed systems for heterogeneous environments", Example Journal of Research, Vol. ${i + 1}, pp. ${i * 10}-${i * 10 + 9}, ${2015 + (i % 10)}.`,
  ).join("\n"),
  presentPost: "Assistant Professor",
  basicPay: 68900,
  totalEmoluments: 145000,
  otherInformation: "Special characters: ä ö ü — “quotes” & ampersands < > é அ (Tamil letter A).\nSecond line of other information.",
};

export const associateMinimal: Answers = {
  name: "Test Candidate",
  dateOfBirth: "1982-03-04",
  gender: "M",
  qualificationsSummary: "B.E., M.E., Ph.D.",
  presentDoorNo: "12",
  presentStreet: "Example Street",
  presentCity: "Coimbatore",
  presentDistrict: "Coimbatore",
  presentState: "Tamil Nadu",
  presentPin: "641004",
  permanentDoorNo: "4/56",
  permanentStreet: "Sample Road",
  permanentCity: "Erode",
  permanentDistrict: "Erode",
  permanentState: "Tamil Nadu",
  permanentPin: "638001",
  mobile: "+91 90000 00001",
  email: "associate@example.test",
  maritalStatus: "N",
  joiningTime: "Three months",
  reference1: "Dr. A. Referee, Professor, Example Institute, Chennai",
  reference2: "Dr. B. Referee, Professor, Sample University, Madurai",
  educationalQualifications: [
    { level: "UG", degree: "B.E.", monthYear: "2003-04", college: "Example College", university: "Example University", classPercent: "First, 78%" },
    { level: "PG", degree: "M.E.", monthYear: "2005-06", college: "Sample College", university: "Sample University", classPercent: "First, 85%", specialisation: "VLSI" },
    { level: "RESEARCH", degree: "Ph.D.", monthYear: "2012-09", college: "Example Institute", university: "Example University", thesis: "A study of low-power circuits", specialisation: "VLSI" },
  ],
  jobsHeld: [{ designation: "Assistant Professor", organisation: "Example College", from: "2006-06-01", years: 19, months: 4 }],
  station: "Coimbatore",
  declarationDate: "2026-10-01",
};

export const associateFull: Answers = {
  ...associateMinimal,
  name: "Venkataramanan Subramaniam Krishnaswamy",
  religion: "Example Religion",
  caste: "Example Caste",
  communityCategory: "BC",
  maritalStatus: "Y",
  spouseNameOccupation: "Example Spouse, Software Engineer",
  spouseOfficialAddress: "Example Technologies, 1 Example Park, Coimbatore 641014",
  children: repeat(5, (i) => ({ name: `Child ${i + 1}`, age: 4 + i * 2, status: i % 2 ? "Studying" : "Employed" })),
  jobsHeld: repeat(8, (i) => ({
    designation: `Associate Professor ${i + 1}`,
    scaleOfPay: "Level 13A",
    totalSalary: "Rs. 2,10,000",
    organisation: `Example Institute of Technology ${i + 1}`,
    from: `${2005 + i * 2}-06-01`,
    to: i === 7 ? null : `${2007 + i * 2}-05-31`,
    years: 2,
    months: 0,
    reasonForLeaving: i === 7 ? "" : "Career progression",
  })),
  educationalQualifications: [
    ...(associateMinimal.educationalQualifications as Record<string, string>[]),
    { level: "OTHERS", degree: "PG Diploma in Management", monthYear: "2015-05", college: "Example School of Management", university: "Open University" },
  ],
  subjectsUg: repeat(14, (i) => `UG Subject ${i + 1}: Digital Signal Processing`),
  subjectsPg: repeat(6, (i) => `PG Subject ${i + 1}: Advanced VLSI Design`),
  courseMaterials: repeat(5, (i) => ({ title: `Course material ${i + 1}`, year: String(2020 + i) })),
  labManuals: repeat(2, (i) => ({ title: `Lab manual ${i + 1}`, year: String(2021 + i) })),
  monographs: repeat(1, () => ({ title: "Monograph on example topic", year: "2022" })),
  books: repeat(4, (i) => ({ name: `Book title ${i + 1}`, publisher: "Example Press", year: String(2018 + i) })),
  internationalJournals: repeat(45, (i) =>
    `A. Author, B. Author, "Long international paper title ${i + 1} about energy-efficient architectures", International Journal of Examples, vol. ${i}, no. 2, pp. 1-12, ${2021 + (i % 5)}.`,
  ),
  nationalJournals: repeat(6, (i) => `National paper ${i + 1}, Indian Journal of Examples, ${2022 + (i % 3)}.`),
  consultancy: repeat(5, (i) => ({ job: `Consultancy project ${i + 1}`, organisation: "Example Industries", projectLeader: "Dr. X", revenue: "Rs. 2,00,000" })),
  testing: repeat(2, (i) => ({ job: `Testing job ${i + 1}`, organisation: "Example Labs", testsDone: "12", revenue: "Rs. 50,000" })),
  summerPrograms: repeat(3, (i) => ({ programme: `FDP ${i + 1}`, heldAt: "Example IIT", duration: "1 week" })),
  conferencePapers: repeat(25, (i) => `Conference paper ${i + 1}, Proc. International Conference on Examples, ${2023 + (i % 3)}.`),
  memberships: repeat(3, (i) => ({ body: `Professional body ${i + 1}`, type: "Life", position: i === 0 ? "Secretary" : "Member" })),
  labModels: "Developed a low-cost FPGA trainer kit.\nDevised six new experiments for the embedded systems laboratory.",
  labDevelopment: repeat(5, (i) => ({ equipment: `Equipment ${i + 1}`, cost: "Rs. 4,50,000", whenPurchased: "2024", involvement: "Specification and procurement" })),
  teachingInnovations: "Flipped classroom for VLSI design. Open-book assessments with rubric-based evaluation.",
  ceOrganised: repeat(2, (i) => ({ programme: `Workshop ${i + 1}`, duration: "3 days", period: "Jan 2025", participants: 40, involvement: "Coordinator" })),
  sponsoredResearch: repeat(3, (i) => ({ project: `Funded project ${i + 1}`, sponsor: "Example Agency", period: "2023-2026", grant: "Rs. 25 lakhs", principalInvestigator: "Self" })),
  studentProjectsUg: repeat(9, (i) => `UG project ${i + 1}`),
  studentProjectsPg: repeat(3, (i) => `PG project ${i + 1}`),
  mentorship: repeat(3, (i) => ({ class: `II B.E. ECE Section ${i + 1}`, year: "2024", contribution: "Academic counselling" })),
  tours: repeat(2, (i) => ({ class: "III B.E. ECE", visitTo: `Example Plant ${i + 1}`, duration: "1 day", yearMonth: "2025 / Feb" })),
  awardsPatents: repeat(6, (i) => `Award or patent ${i + 1}: Best Teacher Award, Example Foundation, 2024`),
};

/** A small, valid PNG (solid colour) generated without external tools. */
export function testPhotoPng(width = 120, height = 150): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = 90 + (y % 60);
      raw[o + 1] = 120;
      raw[o + 2] = 170;
    }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
