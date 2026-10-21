import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient, type Role, type Position } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@12345";

function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

const TEMPLATES = [
  {
    code: "ASSISTANT_PROFESSOR" as const,
    version: 1,
    title: "APPLICATION for the post of ASSISTANT PROFESSOR",
    templatePath: "templates/assistant-professor/v1.docx",
  },
  {
    code: "ASSOCIATE_PROFESSOR" as const,
    version: 1,
    title: "APPLICATION for the post of PROFESSOR / ASSOCIATE PROFESSOR",
    templatePath: "templates/associate-professor/v1.docx",
  },
];

async function registerTemplates() {
  for (const t of TEMPLATES) {
    if (!existsSync(t.templatePath)) continue;
    const sha256 = createHash("sha256").update(readFileSync(t.templatePath)).digest("hex");
    const existing = await prisma.formTemplate.findUnique({
      where: { code_version: { code: t.code, version: t.version } },
    });
    if (existing) {
      if (existing.sha256 !== sha256) {
        await prisma.formTemplate.update({
          where: { id: existing.id },
          data: { sha256 },
        });
      }
      continue;
    }
    await prisma.formTemplate.create({ data: { ...t, sha256 } });
    console.log(`[TEMPLATE] Registered ${t.code} v${t.version}`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" PSG COLLEGE OF TECHNOLOGY — STAFF RECRUITMENT PORTAL SEEDING");
  console.log("================================================================================");
  console.log(`Universal Account Password: ${PASSWORD}`);
  console.log("--------------------------------------------------------------------------------");

  // 1. Register official form templates
  await registerTemplates();
  const apTemplate = await prisma.formTemplate.findFirst({ where: { code: "ASSISTANT_PROFESSOR" } });
  const aspTemplate = await prisma.formTemplate.findFirst({ where: { code: "ASSOCIATE_PROFESSOR" } });

  // 2. Remove legacy AUDITOR users and entries if any remain
  await prisma.$executeRawUnsafe(`DELETE FROM user_roles WHERE role::text = 'AUDITOR'`).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: "auditor" } } }).catch(() => {});

  // 3. Ensure Academic Departments and Disciplines exist
  const deptDefs = [
    {
      code: "CSE",
      name: "Computer Science and Engineering",
      description: "Department of Computer Science and Engineering, PSG College of Technology",
      disciplines: [
        "Artificial Intelligence & Machine Learning",
        "Data Science & Analytics",
        "Software Engineering & Systems",
        "Cyber Security & Cryptography",
      ],
    },
    {
      code: "MCA",
      name: "Computer Applications (MCA)",
      description: "Department of Computer Applications, PSG College of Technology",
      disciplines: [
        "Full Stack Web & Mobile Development",
        "Cloud Computing & Distributed Systems",
        "Intelligent Systems & Applications",
      ],
    },
    {
      code: "EEE",
      name: "Electrical and Electronics Engineering",
      description: "Department of Electrical and Electronics Engineering, PSG College of Technology",
      disciplines: [
        "Power Electronics and Electric Drives",
        "Renewable Energy Systems & Smart Grid",
        "Embedded Systems and IoT",
      ],
    },
    {
      code: "ECE",
      name: "Electronics and Communication Engineering",
      description: "Department of Electronics and Communication Engineering, PSG College of Technology",
      disciplines: [
        "VLSI Design & Microelectronics",
        "Wireless Communication & Networks",
        "Applied Signal & Image Processing",
      ],
    },
    // Keep demo departments for compatibility with older test references
    {
      code: "DEMO-CSE",
      name: "Computer Science and Engineering (demo)",
      description: "Demo CSE department",
      disciplines: ["Artificial Intelligence (demo)", "Systems (demo)"],
    },
    {
      code: "DEMO-ECE",
      name: "Electronics and Communication Engineering (demo)",
      description: "Demo ECE department",
      disciplines: ["VLSI Design (demo)"],
    },
  ];

  const depts: Record<string, { id: string; disciplines: { id: string; name: string }[] }> = {};

  for (const d of deptDefs) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, description: d.description },
      create: {
        code: d.code,
        name: d.name,
        description: d.description,
        disciplines: {
          create: d.disciplines.map((name) => ({ name })),
        },
      },
      include: { disciplines: true },
    });

    // Ensure disciplines exist
    for (const discName of d.disciplines) {
      if (!dept.disciplines.some((disc) => disc.name === discName)) {
        await prisma.discipline
          .create({
            data: { departmentId: dept.id, name: discName },
          })
          .catch(() => {});
      }
    }

    const updated = await prisma.department.findUniqueOrThrow({
      where: { id: dept.id },
      include: { disciplines: true },
    });
    depts[d.code] = updated;
    console.log(`[DEPT] ${d.code.padEnd(10)}: ${d.name} (${updated.disciplines.length} disciplines)`);
  }

  // 4. Ensure Published Recruitment Cycles exist
  const now = Date.now();
  const mainCycle = await prisma.recruitmentCycle.upsert({
    where: { code: "FAC-2026-27" },
    update: {
      title: "PSG Tech Faculty Recruitment Cycle 2026–2027",
      status: "PUBLISHED",
    },
    create: {
      code: "FAC-2026-27",
      title: "PSG Tech Faculty Recruitment Cycle 2026–2027",
      description:
        "Official faculty recruitment drive for Assistant Professor and Associate Professor vacancies across Engineering, Technology, and Computing departments.",
      opensAt: new Date(now - 30 * 86400_000),
      closesAt: new Date(now + 90 * 86400_000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await prisma.recruitmentCycle.upsert({
    where: { code: "DEMO-2026" },
    update: {},
    create: {
      code: "DEMO-2026",
      title: "Faculty Recruitment 2026 (demo)",
      description: "Demonstration recruitment cycle for local testing.",
      opensAt: new Date(now - 86400_000),
      closesAt: new Date(now + 90 * 86400_000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  // 5. Ensure Vacancies exist
  if (apTemplate && aspTemplate) {
    const vacancyDefs = [
      {
        code: "2026-CSE-AP",
        cycleId: mainCycle.id,
        departmentId: depts["CSE"]!.id,
        disciplineId: depts["CSE"]!.disciplines[0]?.id,
        position: "ASSISTANT_PROFESSOR" as Position,
        formTemplateId: apTemplate.id,
        title: "Assistant Professor — Computer Science and Engineering",
        description:
          "Inviting applications from qualified and research-oriented candidates with Ph.D. in Computer Science & Engineering. Specialization in Artificial Intelligence, Machine Learning, Systems, or Cyber Security.",
        numberOfPosts: 5,
      },
      {
        code: "2026-MCA-AP",
        cycleId: mainCycle.id,
        departmentId: depts["MCA"]!.id,
        disciplineId: depts["MCA"]!.disciplines[0]?.id,
        position: "ASSISTANT_PROFESSOR" as Position,
        formTemplateId: apTemplate.id,
        title: "Assistant Professor — Computer Applications (MCA)",
        description:
          "Applications invited for Assistant Professor in MCA. Candidates should possess Ph.D. / First Class Master's with expertise in Full Stack Development, Cloud Computing, or Intelligent Systems.",
        numberOfPosts: 3,
      },
      {
        code: "2026-EEE-AP",
        cycleId: mainCycle.id,
        departmentId: depts["EEE"]!.id,
        disciplineId: depts["EEE"]!.disciplines[0]?.id,
        position: "ASSISTANT_PROFESSOR" as Position,
        formTemplateId: apTemplate.id,
        title: "Assistant Professor — Electrical and Electronics Engineering",
        description:
          "Applications invited for faculty post in EEE. Candidates must have teaching and research aptitude in Power Electronics, Drives, or Renewable Energy Systems.",
        numberOfPosts: 4,
      },
      {
        code: "2026-ECE-ASP",
        cycleId: mainCycle.id,
        departmentId: depts["ECE"]!.id,
        disciplineId: depts["ECE"]!.disciplines[0]?.id,
        position: "ASSOCIATE_PROFESSOR" as Position,
        formTemplateId: aspTemplate.id,
        title: "Associate Professor — Electronics and Communication Engineering",
        description:
          "Applications invited for Associate Professor in ECE with minimum 8 years of post-PhD teaching/research experience and high-quality Scopus/SCI publications in VLSI or Wireless Communications.",
        numberOfPosts: 2,
      },
      {
        code: "DEMO-CSE-AP",
        cycleId: mainCycle.id,
        departmentId: depts["DEMO-CSE"]!.id,
        disciplineId: depts["DEMO-CSE"]!.disciplines[0]?.id,
        position: "ASSISTANT_PROFESSOR" as Position,
        formTemplateId: apTemplate.id,
        title: "Assistant Professor — Computer Science and Engineering (demo)",
        description: "Demo vacancy for testing CSE application workflow.",
        numberOfPosts: 2,
      },
      {
        code: "DEMO-ECE-ASP",
        cycleId: mainCycle.id,
        departmentId: depts["DEMO-ECE"]!.id,
        disciplineId: depts["DEMO-ECE"]!.disciplines[0]?.id,
        position: "ASSOCIATE_PROFESSOR" as Position,
        formTemplateId: aspTemplate.id,
        title: "Associate Professor — Electronics and Communication Engineering (demo)",
        description: "Demo vacancy for testing ECE application workflow.",
        numberOfPosts: 2,
      },
    ];

    for (const v of vacancyDefs) {
      const existing = await prisma.vacancy.findUnique({ where: { code: v.code } });
      if (!existing) {
        await prisma.vacancy.create({
          data: {
            ...v,
            opensAt: mainCycle.opensAt,
            closesAt: mainCycle.closesAt,
            status: "PUBLISHED",
            publishedAt: new Date(),
            eligibility: {
              create: [
                {
                  description:
                    "Ph.D. with First Class or equivalent in preceding degrees (B.E./B.Tech, M.E./M.Tech, M.C.A.) from a recognized institution.",
                  sortOrder: 0,
                },
                {
                  description:
                    "Demonstrated record of peer-reviewed journal publications and academic research projects.",
                  sortOrder: 1,
                },
              ],
            },
            requiredDocuments: {
              create: [
                {
                  documentType: "PHOTOGRAPH",
                  label: "Passport-size colour photograph",
                  required: true,
                  sortOrder: 0,
                },
                {
                  documentType: "DEGREE_CERTIFICATE",
                  label: "Degree certificates (UG, PG, Ph.D.)",
                  required: true,
                  sortOrder: 1,
                },
                {
                  documentType: "EXPERIENCE_CERTIFICATE",
                  label: "Experience & service certificates",
                  required: false,
                  sortOrder: 2,
                },
                {
                  documentType: "PUBLICATIONS",
                  label: "List of research publications & first pages",
                  required: false,
                  sortOrder: 3,
                },
              ],
            },
          },
        });
        console.log(`[VACANCY] Created: ${v.code} — ${v.title}`);
      }
    }
  }

  // 6. Define All Production & Demo Accounts
  const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  interface AccountSpec {
    email: string;
    name: string;
    roles: { role: Role; departmentId?: string; cycleId?: string }[];
    category: string;
    description: string;
  }

  const accounts: AccountSpec[] = [
    // Super Admins — Highest Authority
    {
      email: "dean.admn@psgtech.ac.in",
      name: "Dr. G. Chandramohan (Dean Administration)",
      roles: [{ role: "SUPER_ADMIN" }],
      category: "SUPER ADMIN",
      description:
        "DEAN Administration: Institutional system access, role grants, security lockout overrides, audit log.",
    },
    {
      email: "principal@psgtech.ac.in",
      name: "Dr. K. Prakasan (Principal)",
      roles: [{ role: "SUPER_ADMIN" }],
      category: "SUPER ADMIN",
      description:
        "PRINCIPAL: Institutional system access, governance, staff role management, full audit oversight.",
    },
    {
      email: "superadmin@example.test",
      name: "Dr. K. Super Administrator (Demo)",
      roles: [{ role: "SUPER_ADMIN" }],
      category: "SUPER ADMIN",
      description: "Demo Super Admin: User management, privilege configuration, system security audit.",
    },

    // HR & Job Profile Entry — Section N4
    {
      email: "admin.n4@psgtech.ac.in",
      name: "Admin N4 Section (HR & Recruitment Office)",
      roles: [{ role: "HR_OFFICER" }, { role: "RECRUITMENT_ADMIN" }],
      category: "HR / RECRUITMENT ADMIN",
      description:
        "HR-N4 SECTION: JOB Profile Entry (vacancies, cycles, departments) & candidate screening, reviewer assignment, CSV export.",
    },
    {
      email: "hr@example.test",
      name: "S. HR Officer (Demo)",
      roles: [{ role: "HR_OFFICER" }, { role: "RECRUITMENT_ADMIN" }],
      category: "HR / RECRUITMENT ADMIN",
      description:
        "Demo HR Officer & Job Profile Entry: Screen applications, assign reviewers, PDF bundles, export CSV.",
    },
    {
      email: "admin@example.test",
      name: "Prof. R. Recruitment Admin (Demo)",
      roles: [{ role: "RECRUITMENT_ADMIN" }],
      category: "RECRUITMENT ADMIN",
      description:
        "Demo Recruitment Administrator: Manage cycles, departments, disciplines, and publish vacancies.",
    },

    // Department Reviewers (HODs) — Department specific
    {
      email: "hod.cse@psgtech.ac.in",
      name: "Dr. R. Venkatesan (HOD - CSE)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["CSE"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description:
        "HOD CSE: Review CSE applicants, evaluate qualifications, score academic criteria, shortlist candidates.",
    },
    {
      email: "hod.mca@psgtech.ac.in",
      name: "Dr. V. Ilango (HOD - MCA)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["MCA"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description:
        "HOD MCA: Review Computer Applications (MCA) applicants, record academic feedback & scores.",
    },
    {
      email: "hod.eee@psgtech.ac.in",
      name: "Dr. M. S. Saravanan (HOD - EEE)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["EEE"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description:
        "HOD EEE: Review Electrical & Electronics Engineering applicants, score technical competencies.",
    },
    {
      email: "hod.ece@psgtech.ac.in",
      name: "Dr. P. T. Vanathi (HOD - ECE)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["ECE"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description:
        "HOD ECE: Review Electronics & Communication Engineering applicants, record scores & feedback.",
    },
    {
      email: "reviewer.cse@example.test",
      name: "Dr. M. CSE Reviewer (Demo)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["CSE"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description: "Demo CSE Reviewer: Review CSE faculty applications.",
    },
    {
      email: "reviewer.ece@example.test",
      name: "Dr. V. ECE Reviewer (Demo)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: depts["ECE"]!.id }],
      category: "HOD / DEPT REVIEWER",
      description: "Demo ECE Reviewer: Review ECE faculty applications.",
    },

    // Candidates / Applicants
    {
      email: "candidate@example.test",
      name: "Dr. R. Sathish Kumar (Applicant)",
      roles: [{ role: "CANDIDATE" }],
      category: "CANDIDATE",
      description:
        "Primary candidate account: Ph.D. in CSE, submits applications, uploads certificates, tracks status.",
    },
    {
      email: "candidate2@example.test",
      name: "Dr. P. Priya (Secondary Applicant)",
      roles: [{ role: "CANDIDATE" }],
      category: "CANDIDATE",
      description:
        "Secondary candidate account: Ph.D. in AI/Data Science, tests concurrent applications & screening queue.",
    },
  ];

  console.log("\n--------------------------------------------------------------------------------");
  console.log(" SEEDING / SYNCHRONIZING USER ACCOUNTS");
  console.log("--------------------------------------------------------------------------------");

  const createdUsers: Record<string, { id: string; email: string }> = {};

  for (const acc of accounts) {
    const existing = await prisma.user.findUnique({
      where: { email: acc.email.toLowerCase() },
      include: { roles: true },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          status: "ACTIVE",
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      // Synchronize role assignments
      for (const r of acc.roles) {
        const hasIt = existing.roles.some(
          (er) => er.role === r.role && (r.departmentId ? er.departmentId === r.departmentId : true),
        );
        if (!hasIt) {
          await prisma.userRole.create({
            data: {
              userId: existing.id,
              role: r.role,
              departmentId: r.departmentId ?? null,
              cycleId: r.cycleId ?? null,
            },
          });
        }
      }

      createdUsers[acc.email] = { id: existing.id, email: acc.email };
      console.log(`[SYNCED] ${acc.category.padEnd(20)} | ${acc.email.padEnd(30)} | Password: ${PASSWORD}`);
    } else {
      const user = await prisma.user.create({
        data: {
          email: acc.email.toLowerCase(),
          passwordHash,
          emailVerifiedAt: new Date(),
          status: "ACTIVE",
          roles: {
            create: acc.roles.map((r) => ({
              role: r.role,
              departmentId: r.departmentId ?? null,
              cycleId: r.cycleId ?? null,
            })),
          },
          profile: {
            create: {
              fullName: acc.name,
              privacyVersion: "v1",
              privacyAcceptedAt: new Date(),
            },
          },
        },
      });

      createdUsers[acc.email] = { id: user.id, email: acc.email };
      console.log(`[CREATED] ${acc.category.padEnd(20)} | ${acc.email.padEnd(30)} | Password: ${PASSWORD}`);
    }
  }

  // 7. Seed Realistic Candidate Applications for End-to-End Demo Flow
  const cand1 = createdUsers["candidate@example.test"];
  const cand2 = createdUsers["candidate2@example.test"];
  const hodCse = createdUsers["hod.cse@psgtech.ac.in"];
  const hrAdmin = createdUsers["admin.n4@psgtech.ac.in"];
  const vacCse = await prisma.vacancy.findUnique({ where: { code: "2026-CSE-AP" } });
  const vacEee = await prisma.vacancy.findUnique({ where: { code: "2026-EEE-AP" } });

  if (cand1 && vacCse && apTemplate && hodCse && hrAdmin) {
    // 7A. Application 1: Submitted and Under Department Review (Assigned to HOD CSE)
    const app1Existing = await prisma.application.findUnique({
      where: { candidateId_vacancyId: { candidateId: cand1.id, vacancyId: vacCse.id } },
      include: { revisions: true, assignments: true },
    });

    const answers1 = {
      salutation: "Dr.",
      name: "R. Sathish Kumar",
      addressType: "Present",
      address: "No. 45, Avinashi Road, Peelamedu\nCoimbatore - 641004\nTamil Nadu, India",
      phone: "+91 94432 10987",
      email: cand1.email,
      dateOfBirth: "1988-06-15",
      gender: "M",
      placeOfBirth: "Coimbatore",
      district: "Coimbatore",
      state: "Tamil Nadu",
      motherTongue: "Tamil",
      nationality: "Indian",
      academicQualifications: [
        {
          degree: "B.E. Computer Science and Engineering",
          university: "Anna University",
          institution: "Government College of Technology, Coimbatore",
          classOrMarks: "First Class with Distinction / 86%",
          monthYearOfPassing: "2010-05",
        },
        {
          degree: "M.E. Computer Science and Engineering",
          university: "Anna University",
          institution: "PSG College of Technology, Coimbatore",
          classOrMarks: "First Class with Distinction / 89%",
          monthYearOfPassing: "2012-06",
        },
        {
          degree: "Ph.D. in Computer Science and Engineering",
          university: "Anna University",
          institution: "PSG College of Technology (Autonomous)",
          classOrMarks: "Highly Commended",
          monthYearOfPassing: "2019-11",
        },
      ],
      experience: [
        {
          post: "Assistant Professor",
          employer: "PSG College of Technology, Coimbatore",
          payScale: "Level 10 (Rs. 57,700 - 1,82,400)",
          from: "2019-12-01",
          to: "2026-09-30",
          years: 6,
          months: 10,
          nature: "Teaching and Research",
        },
        {
          post: "Assistant Professor",
          employer: "Coimbatore Institute of Technology",
          payScale: "Level 10",
          from: "2014-07-01",
          to: "2019-11-30",
          years: 5,
          months: 4,
          nature: "Teaching",
        },
      ],
      specialisation: "Artificial Intelligence, Deep Learning, Cloud Systems",
      joiningTime: "1 Month",
      publications:
        "1. R. Sathish Kumar et al., 'Federated Learning for Edge Healthcare IoT', IEEE Transactions on Services Computing, 2024.\n2. R. Sathish Kumar, 'Energy-Aware Scheduling in Distributed Cloud Platforms', ACM Computing Surveys, 2023.\n3. 8 Scopus indexed journal articles and 4 international conference publications.",
      reference1:
        "Dr. K. Sundar, Professor & Head, Department of CSE, Anna University Regional Campus, Coimbatore",
      reference2: "Dr. M. Shanmugam, Chief Architect, Bosch Global Software Technologies, Coimbatore",
      place: "Coimbatore",
      declarationDate: "2026-10-15",
    };

    const answersJson = canonicalJson(answers1);
    const answersSha = createHash("sha256").update(answersJson).digest("hex");

    let app1Id = app1Existing?.id;

    if (!app1Existing) {
      const app1 = await prisma.application.create({
        data: {
          candidateId: cand1.id,
          vacancyId: vacCse.id,
          formTemplateId: apTemplate.id,
          status: "DRAFT",
          processingStatus: "READY",
          draftAnswers: answers1,
          draftVersion: 1,
          lastSavedAt: new Date(now - 7 * 86400_000),
        },
      });
      app1Id = app1.id;

      const rev1 = await prisma.applicationRevision.create({
        data: {
          applicationId: app1.id,
          revisionNo: 1,
          formCode: "ASSISTANT_PROFESSOR",
          formVersion: 1,
          answers: answers1,
          answersSha256: answersSha,
          attachmentManifest: [],
          candidateName: "Dr. R. Sathish Kumar",
          createdById: cand1.id,
          createdAt: new Date(now - 7 * 86400_000),
        },
      });

      await prisma.application.update({
        where: { id: app1.id },
        data: {
          referenceNo: "PSGTECH-2026-000101",
          status: "UNDER_DEPARTMENT_REVIEW",
          submittedAt: new Date(now - 7 * 86400_000),
          currentRevisionId: rev1.id,
        },
      });

      await prisma.qualification.createMany({
        data: [
          {
            revisionId: rev1.id,
            sortOrder: 0,
            degree: "B.E. Computer Science and Engineering",
            institution: "GCT Coimbatore",
            university: "Anna University",
            passedOn: "2010-05",
          },
          {
            revisionId: rev1.id,
            sortOrder: 1,
            degree: "M.E. Computer Science and Engineering",
            institution: "PSG College of Technology",
            university: "Anna University",
            passedOn: "2012-06",
          },
          {
            revisionId: rev1.id,
            sortOrder: 2,
            degree: "Ph.D. in Computer Science and Engineering",
            institution: "PSG College of Technology",
            university: "Anna University",
            passedOn: "2019-11",
          },
        ],
      });

      await prisma.employmentRecord.createMany({
        data: [
          {
            revisionId: rev1.id,
            sortOrder: 0,
            designation: "Assistant Professor",
            organisation: "PSG College of Technology",
            fromDate: "2019-12-01",
            toDate: "2026-09-30",
            nature: "Teaching and Research",
          },
        ],
      });

      await prisma.applicationStatusHistory.createMany({
        data: [
          { applicationId: app1.id, fromStatus: null, toStatus: "DRAFT", actorId: cand1.id },
          { applicationId: app1.id, fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: cand1.id },
          {
            applicationId: app1.id,
            fromStatus: "SUBMITTED",
            toStatus: "UNDER_HR_REVIEW",
            actorId: hrAdmin.id,
          },
          {
            applicationId: app1.id,
            fromStatus: "UNDER_HR_REVIEW",
            toStatus: "UNDER_DEPARTMENT_REVIEW",
            actorId: hrAdmin.id,
            reason: "Assigned to HOD CSE for department academic screening.",
          },
        ],
      });
    }

    // Ensure Assignment to HOD CSE exists
    if (app1Id) {
      const assignment = await prisma.reviewAssignment.findFirst({
        where: { applicationId: app1Id, reviewerId: hodCse.id, stage: "DEPARTMENT" },
      });
      if (!assignment) {
        await prisma.reviewAssignment.create({
          data: {
            applicationId: app1Id,
            reviewerId: hodCse.id,
            stage: "DEPARTMENT",
            assignedById: hrAdmin.id,
          },
        });
      }
      console.log(
        `[DEMO APP] Candidate 1 (Dr. R. Sathish Kumar) -> 2026-CSE-AP: UNDER_DEPARTMENT_REVIEW (Assigned to hod.cse@psgtech.ac.in)`,
      );
    }

    // 7B. Application 2: Candidate 2 Under HR Review (Pending HR Screening by admin.n4@psgtech.ac.in)
    if (cand2) {
      const app2Existing = await prisma.application.findUnique({
        where: { candidateId_vacancyId: { candidateId: cand2.id, vacancyId: vacCse.id } },
      });

      const answers2 = {
        salutation: "Dr.",
        name: "P. Priya",
        addressType: "Present",
        address: "18, Green Valley Avenue, Race Course\nCoimbatore - 641018\nTamil Nadu, India",
        phone: "+91 98940 54321",
        email: cand2.email,
        dateOfBirth: "1991-03-24",
        gender: "F",
        placeOfBirth: "Erode",
        district: "Erode",
        state: "Tamil Nadu",
        motherTongue: "Tamil",
        nationality: "Indian",
        academicQualifications: [
          {
            degree: "B.Tech. Information Technology",
            university: "Anna University",
            institution: "PSG College of Technology",
            classOrMarks: "First Class / 84%",
            monthYearOfPassing: "2013-05",
          },
          {
            degree: "M.Tech. Data Science",
            university: "Anna University",
            institution: "PSG College of Technology",
            classOrMarks: "First Class with Distinction / 91%",
            monthYearOfPassing: "2015-06",
          },
          {
            degree: "Ph.D. in Information and Communication Engineering",
            university: "Anna University",
            institution: "Anna University Regional Campus, Coimbatore",
            classOrMarks: "Commended",
            monthYearOfPassing: "2022-04",
          },
        ],
        experience: [
          {
            post: "Assistant Professor",
            employer: "Sri Krishna College of Engineering and Technology",
            payScale: "Level 10",
            from: "2022-05-01",
            to: "2026-10-01",
            years: 4,
            months: 5,
            nature: "Teaching and Research",
          },
        ],
        specialisation: "Data Science, Machine Learning, Computer Vision",
        joiningTime: "Immediate",
        publications: "6 IEEE/Springer journal papers and 3 patents published.",
        reference1: "Dr. S. Karthikeyan, Professor, PSG Tech",
        reference2: "Dr. N. Rajesh, Associate Professor, IIT Madras",
        place: "Coimbatore",
        declarationDate: "2026-10-18",
      };

      const answers2Json = canonicalJson(answers2);
      const answers2Sha = createHash("sha256").update(answers2Json).digest("hex");

      if (!app2Existing) {
        const app2 = await prisma.application.create({
          data: {
            candidateId: cand2.id,
            vacancyId: vacCse.id,
            formTemplateId: apTemplate.id,
            status: "DRAFT",
            processingStatus: "READY",
            draftAnswers: answers2,
            draftVersion: 1,
            lastSavedAt: new Date(now - 3 * 86400_000),
          },
        });

        const rev2 = await prisma.applicationRevision.create({
          data: {
            applicationId: app2.id,
            revisionNo: 1,
            formCode: "ASSISTANT_PROFESSOR",
            formVersion: 1,
            answers: answers2,
            answersSha256: answers2Sha,
            attachmentManifest: [],
            candidateName: "Dr. P. Priya",
            createdById: cand2.id,
            createdAt: new Date(now - 3 * 86400_000),
          },
        });

        await prisma.application.update({
          where: { id: app2.id },
          data: {
            referenceNo: "PSGTECH-2026-000102",
            status: "UNDER_HR_REVIEW",
            submittedAt: new Date(now - 3 * 86400_000),
            currentRevisionId: rev2.id,
          },
        });

        await prisma.qualification.createMany({
          data: [
            {
              revisionId: rev2.id,
              sortOrder: 0,
              degree: "B.Tech. Information Technology",
              institution: "PSG College of Technology",
              university: "Anna University",
              passedOn: "2013-05",
            },
            {
              revisionId: rev2.id,
              sortOrder: 1,
              degree: "M.Tech. Data Science",
              institution: "PSG College of Technology",
              university: "Anna University",
              passedOn: "2015-06",
            },
            {
              revisionId: rev2.id,
              sortOrder: 2,
              degree: "Ph.D. in ICE",
              institution: "Anna University Regional Campus",
              university: "Anna University",
              passedOn: "2022-04",
            },
          ],
        });

        await prisma.applicationStatusHistory.createMany({
          data: [
            { applicationId: app2.id, fromStatus: null, toStatus: "DRAFT", actorId: cand2.id },
            { applicationId: app2.id, fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: cand2.id },
            {
              applicationId: app2.id,
              fromStatus: "SUBMITTED",
              toStatus: "UNDER_HR_REVIEW",
              actorId: hrAdmin.id,
              reason: "Initial screening in progress by HR Section N4.",
            },
          ],
        });
        console.log(
          `[DEMO APP] Candidate 2 (Dr. P. Priya) -> 2026-CSE-AP: UNDER_HR_REVIEW (Ready for HR screening)`,
        );
      }
    }

    // 7C. Application 3: Candidate 1 Draft Application on 2026-EEE-AP
    if (vacEee) {
      const app3Existing = await prisma.application.findUnique({
        where: { candidateId_vacancyId: { candidateId: cand1.id, vacancyId: vacEee.id } },
      });
      if (!app3Existing) {
        await prisma.application.create({
          data: {
            candidateId: cand1.id,
            vacancyId: vacEee.id,
            formTemplateId: apTemplate.id,
            status: "DRAFT",
            processingStatus: "NOT_STARTED",
            draftAnswers: {
              salutation: "Dr.",
              name: "R. Sathish Kumar",
              phone: "+91 94432 10987",
              email: cand1.email,
              specialisation: "Embedded Systems and Interdisciplinary Computing",
            },
            draftVersion: 1,
            lastSavedAt: new Date(),
          },
        });
        console.log(`[DEMO APP] Candidate 1 Draft Application -> 2026-EEE-AP: DRAFT (Saved in progress)`);
      }
    }
  }

  console.log("\n================================================================================");
  console.log(" PORTAL SEEDING COMPLETE — ALL ROLES READY FOR TESTING");
  console.log("================================================================================");
  console.log("Universal Password:  Demo@12345");
  console.log("Web Application URL: http://localhost:6969");
  console.log("Sign In Page URL:    http://localhost:6969/login");
  console.log("Database Viewer:     http://localhost:6981 (Adminer: db / srportal / srp_owner)");
  console.log("Mailpit Inbox:       http://localhost:6980");
  console.log("--------------------------------------------------------------------------------");
  console.log("CREDENTIALS BY ROLE FOR LIVE DEMO:");
  console.log("1. DEAN (Super Admin)        : dean.admn@psgtech.ac.in      | Demo@12345");
  console.log("2. PRINCIPAL (Super Admin)   : principal@psgtech.ac.in      | Demo@12345");
  console.log("3. HR-N4 Section             : admin.n4@psgtech.ac.in       | Demo@12345");
  console.log("4. HOD CSE                   : hod.cse@psgtech.ac.in        | Demo@12345");
  console.log("5. HOD MCA                   : hod.mca@psgtech.ac.in        | Demo@12345");
  console.log("6. HOD EEE                   : hod.eee@psgtech.ac.in        | Demo@12345");
  console.log("7. HOD ECE                   : hod.ece@psgtech.ac.in        | Demo@12345");
  console.log("8. Demo Candidate 1          : candidate@example.test       | Demo@12345");
  console.log("9. Demo Candidate 2          : candidate2@example.test      | Demo@12345");
  console.log("10. Demo Super Admin         : superadmin@example.test      | Demo@12345");
  console.log("11. Demo HR Officer          : hr@example.test              | Demo@12345");
  console.log("================================================================================\n");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
