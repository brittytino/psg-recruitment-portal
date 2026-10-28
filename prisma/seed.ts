/**
 * Seed script (idempotent; safe to run repeatedly, including in production).
 *  1. Registers the application form templates (immutable; checksum verified).
 *  2. Creates the institutional staff accounts if they do not exist yet:
 *       dean.admn@psgtech.ac.in  — Admin (Dean)
 *       principal@psgtech.ac.in  — Admin (Principal)
 *       admin.n4@psgtech.ac.in   — HR – N4 Section
 *     New accounts get an unusable random password and a one-time set-password link (72 hours),
 *     which is e-mailed through the outbox and printed once to the console.
 *
 * No demo accounts, departments or HODs are created: Admin adds departments and HODs in the portal.
 *
 * Usage: npm run db:seed   (production image: npm run db:seed:prod)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

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
  // Version 2 forms are drawn directly to PDF; the "template" is the built-in renderer.
  {
    code: "ASSISTANT_PROFESSOR" as const,
    version: 2,
    title: "APPLICATION for the post of ASSISTANT PROFESSOR (2026-27)",
    templatePath: "builtin:faculty-v2",
  },
  {
    code: "ASSOCIATE_PROFESSOR" as const,
    version: 2,
    title: "APPLICATION for the post of PROFESSOR / ASSOCIATE PROFESSOR (2026-27)",
    templatePath: "builtin:faculty-v2",
  },
  // Research Assistant / Associate form drawn directly to PDF
  {
    code: "RESEARCH_APPLICATION" as const,
    version: 1,
    title: "Application for Research Position",
    templatePath: "builtin:research-v1",
  },
];

const INITIAL_SPECIALISATIONS = [
  {
    name: "Artificial Intelligence & Machine Learning",
    description: "Deep learning, NLP, computer vision, genAI",
  },
  {
    name: "Electric Mobility & Smart Energy Systems",
    description: "EV powertrains, BMS, charging infrastructure",
  },
  {
    name: "Advanced Materials & Nanotechnology",
    description: "Smart polymers, functional coatings, nanomaterials",
  },
  { name: "Robotics & Automation", description: "Autonomous systems, industrial robotics, control systems" },
  { name: "Internet of Things & Embedded Systems", description: "Edge computing, sensor networks, firmware" },
  {
    name: "Biomedical Devices & Healthcare Technologies",
    description: "Medical instrumentation, biosensors, imaging",
  },
  { name: "VLSI & Semiconductor Technologies", description: "IC design, ASIC/FPGA, microelectronics" },
  {
    name: "Cyber Security & Cloud Computing",
    description: "Network security, cryptography, distributed systems",
  },
  {
    name: "Sustainable Manufacturing & Industry 4.0",
    description: "Additive manufacturing, digital twins, smart factory",
  },
  { name: "Renewable Energy & Battery Storage", description: "Solar PV, green hydrogen, supercapacitors" },
];

const STAFF: { email: string; name: string; role: Role; departmentCode?: string }[] = [
  { email: "brittytino08@gmail.com", name: "Tino", role: "SUPER_ADMIN" },
  { email: "dean.admn@psgtech.ac.in", name: "Dr. S. Saravanan (Dean)", role: "ADMIN" },
  { email: "principal@psgtech.ac.in", name: "Dr. G. Thilagavathi (Principal)", role: "ADMIN" },
  { email: "admin.n4@psgtech.ac.in", name: "HR – N4 Section", role: "HR" },
  {
    email: "hod.cse@psgtech.ac.in",
    name: "HOD Computer Science and Engineering",
    role: "HOD",
    departmentCode: "CSE",
  },
];

async function registerTemplates() {
  for (const t of TEMPLATES) {
    const sha256 = t.templatePath.startsWith("builtin:")
      ? sha(t.templatePath)
      : sha(readFileSync(t.templatePath));
    const existing = await prisma.formTemplate.findUnique({
      where: { code_version: { code: t.code, version: t.version } },
    });
    if (existing) {
      if (existing.sha256 !== sha256)
        throw new Error(
          `Template ${t.code} v${t.version} differs from the registered checksum. Templates are immutable: add a new version instead.`,
        );
      continue;
    }
    await prisma.formTemplate.create({ data: { ...t, sha256 } });
    console.log(`registered template ${t.code} v${t.version}`);
  }
  // New faculty vacancies use v2; v1 stays registered so existing applications still render.
  await prisma.formTemplate.updateMany({
    where: { version: 1, code: { in: ["ASSISTANT_PROFESSOR", "ASSOCIATE_PROFESSOR"] } },
    data: { active: false },
  });
}

async function ensureSpecialisations() {
  for (let i = 0; i < INITIAL_SPECIALISATIONS.length; i++) {
    const s = INITIAL_SPECIALISATIONS[i]!;
    await prisma.researchSpecialisation.upsert({
      where: { name: s.name },
      update: { description: s.description, sortOrder: i + 1, active: true },
      create: { name: s.name, description: s.description, sortOrder: i + 1, active: true },
    });
  }
  console.log(`ensured ${INITIAL_SPECIALISATIONS.length} research specialisations`);
}

async function ensureDepartments() {
  const cse = await prisma.department.upsert({
    where: { code: "CSE" },
    update: { name: "Computer Science and Engineering", active: true },
    create: {
      code: "CSE",
      name: "Computer Science and Engineering",
      description: "Department of Computer Science and Engineering",
      active: true,
    },
  });
  console.log(`ensured department CSE (${cse.id})`);
  return cse;
}

async function ensureStaff() {
  const cseDept = await ensureDepartments();
  for (const s of STAFF) {
    const existing = await prisma.user.findUnique({
      where: { email: s.email },
      include: { roles: true, profile: true },
    });
    const departmentId = s.departmentCode === "CSE" ? cseDept.id : null;

    if (existing) {
      // Ensure the correct role is assigned
      const hasRole = existing.roles.some((r) => r.role === s.role && r.departmentId === departmentId);
      if (!hasRole) {
        await prisma.userRole.create({
          data: { userId: existing.id, role: s.role, departmentId },
        });
      }
      if (existing.profile?.fullName !== s.name) {
        await prisma.candidateProfile.upsert({
          where: { userId: existing.id },
          create: {
            userId: existing.id,
            fullName: s.name,
            privacyVersion: "staff",
            privacyAcceptedAt: new Date(),
          },
          update: { fullName: s.name },
        });
      }
      console.log(`verified ${s.role} ${s.email}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: s.email,
          emailVerifiedAt: new Date(),
          status: "ACTIVE",
          roles: { create: { role: s.role, departmentId } },
          profile: { create: { fullName: s.name, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "user.seeded",
          entityType: "user",
          entityId: user.id,
          metadata: { role: s.role, departmentCode: s.departmentCode },
        },
      });
    });
    console.log(`created ${s.role} ${s.email} (${s.name}) — passwordless OTP sign-in ready`);
  }
}

async function main() {
  await registerTemplates();
  await ensureSpecialisations();
  await ensureStaff();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
