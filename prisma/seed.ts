/**
 * Seed script.
 *  1. Always: registers the official form templates (immutable; checksum verified).
 *  2. Only with SEED_DEMO=true outside production: clearly marked demo data for local development
 *     (example.test accounts, "(demo)" departments, placeholder eligibility text).
 *
 * Usage: npm run db:seed            (templates only)
 *        SEED_DEMO=true npm run db:seed
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, type Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

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
    const sha256 = createHash("sha256").update(readFileSync(t.templatePath)).digest("hex");
    const existing = await prisma.formTemplate.findUnique({
      where: { code_version: { code: t.code, version: t.version } },
    });
    if (existing) {
      if (existing.sha256 !== sha256)
        throw new Error(
          `Template ${t.code} v${t.version} on disk differs from the registered checksum. Templates are immutable: add a new version instead.`,
        );
      continue;
    }
    await prisma.formTemplate.create({ data: { ...t, sha256 } });
    console.log(`registered template ${t.code} v${t.version} (${sha256.slice(0, 12)}…)`);
  }
}

async function demo() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10)
    throw new Error("Set SEED_DEMO_PASSWORD (10+ characters) to seed demo accounts");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const cse = await prisma.department.upsert({
    where: { code: "DEMO-CSE" },
    update: {},
    create: {
      code: "DEMO-CSE",
      name: "Computer Science and Engineering (demo)",
      disciplines: { create: [{ name: "Artificial Intelligence (demo)" }, { name: "Systems (demo)" }] },
    },
    include: { disciplines: true },
  });
  const ece = await prisma.department.upsert({
    where: { code: "DEMO-ECE" },
    update: {},
    create: {
      code: "DEMO-ECE",
      name: "Electronics and Communication Engineering (demo)",
      disciplines: { create: [{ name: "VLSI Design (demo)" }] },
    },
    include: { disciplines: true },
  });

  const users: { email: string; name: string; roles: { role: Role; departmentId?: string }[] }[] = [
    {
      email: "dean.admn@psgtech.ac.in",
      name: "Dr. S. Saravanan (Dean Administration)",
      roles: [{ role: "SUPER_ADMIN" }],
    },
    {
      email: "principal@psgtech.ac.in",
      name: "Dr. K. Prakasan (Principal)",
      roles: [{ role: "SUPER_ADMIN" }],
    },
    { email: "superadmin@example.test", name: "Demo Super Admin", roles: [{ role: "SUPER_ADMIN" }] },
    {
      email: "admin.n4@psgtech.ac.in",
      name: "Admin N4 Section (HR)",
      roles: [{ role: "HR_OFFICER" }, { role: "RECRUITMENT_ADMIN" }],
    },
    { email: "admin@example.test", name: "Demo Recruitment Admin", roles: [{ role: "RECRUITMENT_ADMIN" }] },
    {
      email: "hr@example.test",
      name: "Demo HR Officer",
      roles: [{ role: "HR_OFFICER" }, { role: "RECRUITMENT_ADMIN" }],
    },
    {
      email: "hod.cse@psgtech.ac.in",
      name: "Dr. R. Venkatesan (HOD CSE)",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: cse.id }],
    },
    {
      email: "reviewer.cse@example.test",
      name: "Demo CSE Reviewer",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: cse.id }],
    },
    {
      email: "reviewer.ece@example.test",
      name: "Demo ECE Reviewer",
      roles: [{ role: "DEPARTMENT_REVIEWER", departmentId: ece.id }],
    },
    { email: "candidate@example.test", name: "Demo Candidate", roles: [{ role: "CANDIDATE" }] },
    { email: "candidate2@example.test", name: "Second Demo Candidate", roles: [{ role: "CANDIDATE" }] },
  ];
  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.profile.updateMany({
        where: { userId: existing.id },
        data: { fullName: u.name },
      });
      continue;
    }
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: u.roles.map((r) => ({ role: r.role, departmentId: r.departmentId ?? null })) },
        profile: { create: { fullName: u.name, privacyVersion: "demo", privacyAcceptedAt: new Date() } },
      },
    });
  }

  const now = Date.now();
  const cycle = await prisma.recruitmentCycle.upsert({
    where: { code: "DEMO-2026" },
    update: {},
    create: {
      code: "DEMO-2026",
      title: "Faculty Recruitment 2026 (demo)",
      description:
        "Demonstration recruitment cycle for local development. Not an official recruitment notice.",
      opensAt: new Date(now - 86400_000),
      closesAt: new Date(now + 90 * 86400_000),
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const ap = await prisma.formTemplate.findUniqueOrThrow({
    where: { code_version: { code: "ASSISTANT_PROFESSOR", version: 1 } },
  });
  const asp = await prisma.formTemplate.findUniqueOrThrow({
    where: { code_version: { code: "ASSOCIATE_PROFESSOR", version: 1 } },
  });
  const placeholder = "[Demo placeholder — not an official eligibility criterion]";
  const vacancies = [
    {
      code: "DEMO-CSE-AP",
      departmentId: cse.id,
      disciplineId: cse.disciplines[0]!.id,
      position: "ASSISTANT_PROFESSOR" as const,
      formTemplateId: ap.id,
      title: "Assistant Professor — Computer Science and Engineering (demo)",
    },
    {
      code: "DEMO-ECE-ASP",
      departmentId: ece.id,
      disciplineId: ece.disciplines[0]!.id,
      position: "ASSOCIATE_PROFESSOR" as const,
      formTemplateId: asp.id,
      title: "Associate Professor — Electronics and Communication Engineering (demo)",
    },
  ];
  for (const v of vacancies) {
    if (await prisma.vacancy.findUnique({ where: { code: v.code } })) continue;
    await prisma.vacancy.create({
      data: {
        ...v,
        cycleId: cycle.id,
        description:
          "Demonstration vacancy for local development and testing. Replace with approved content before any real use.",
        numberOfPosts: 2,
        opensAt: cycle.opensAt,
        closesAt: cycle.closesAt,
        status: "PUBLISHED",
        publishedAt: new Date(),
        eligibility: { create: [{ description: placeholder, sortOrder: 0 }] },
        requiredDocuments: {
          create: [
            {
              documentType: "DEGREE_CERTIFICATE",
              label: "Degree certificates (attested copies)",
              sortOrder: 0,
            },
            {
              documentType: "EXPERIENCE_CERTIFICATE",
              label: "Experience certificates / testimonials",
              sortOrder: 1,
              required: false,
            },
          ],
        },
      },
    });
  }
  console.log("demo data ready (accounts @example.test, password from SEED_DEMO_PASSWORD)");
}

/**
 * First Super Admin bootstrap (BOOTSTRAP_ADMIN_EMAIL). Runs only while no Super Admin exists.
 * The account gets an unusable random password; a one-time setup link (72 h) is printed once.
 */
async function bootstrapAdmin(email: string) {
  if (await prisma.userRole.count({ where: { role: "SUPER_ADMIN" } })) return;
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const passwordHash = await hash(randomBytes(32).toString("base64url"), {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash,
      emailVerifiedAt: new Date(),
      roles: { create: { role: "SUPER_ADMIN" } },
      profile: {
        create: { fullName: "Super Admin", privacyVersion: "staff", privacyAcceptedAt: new Date() },
      },
      tokens: {
        create: {
          type: "PASSWORD_RESET",
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 72 * 3600_000),
        },
      },
    },
  });
  await prisma.auditEvent.create({
    data: { action: "user.bootstrap_super_admin", entityType: "user", entityId: user.id },
  });
  console.log(
    `bootstrap super admin created. Set the password within 72 h: ${process.env.APP_ORIGIN ?? ""}/reset-password?token=${token}`,
  );
}

async function main() {
  await registerTemplates();
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) await bootstrapAdmin(process.env.BOOTSTRAP_ADMIN_EMAIL);
  if (process.env.SEED_DEMO === "true") await demo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
