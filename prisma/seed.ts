/**
 * Seed script (idempotent; safe to run repeatedly, including in production).
 *  1. Registers the application form templates (immutable; checksum verified).
 *  2. Adds the initial research specialisations, only when none exist yet (HR manages them after).
 *  3. On a brand-new database only: the first department, and the first owner account from
 *     BOOTSTRAP_OWNER_EMAIL (server-only setting; no e-mail address lives in this repository).
 *     Existing users and roles are never created, changed or removed by the seed: everyone else is
 *     added in the application (Users & roles). Staff sign in with an e-mailed one-time code.
 *
 * No demo candidates, vacancies or applications are created.
 *
 * Usage: npm run db:seed   (production image: npm run db:seed:prod)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

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
  // Only on a fresh database: afterwards HR – N4 Section owns the list (edits are never overwritten).
  if ((await prisma.researchSpecialisation.count()) > 0) return;
  await prisma.researchSpecialisation.createMany({
    data: INITIAL_SPECIALISATIONS.map((s, i) => ({ ...s, sortOrder: i + 1, active: true })),
    skipDuplicates: true,
  });
  console.log(`added ${INITIAL_SPECIALISATIONS.length} initial research specialisations`);
}

/** A starting department on a brand-new database only; afterwards departments are managed in the app. */
async function ensureFirstDepartment() {
  if ((await prisma.department.count()) > 0) return;
  await prisma.department.create({
    data: {
      code: "CSE",
      name: "Computer Science and Engineering",
      description: "Department of Computer Science and Engineering",
      active: true,
    },
  });
  console.log("added the first department (CSE)");
}

/**
 * First owner account on a new server. No e-mail address is stored in this repository: it is read from
 * BOOTSTRAP_OWNER_EMAIL (server-only, secrets/override.env). When an active owner account already
 * exists — every running installation — nothing is created or changed: staff accounts and roles are
 * managed in the application (Users & roles), and the seed never touches existing users.
 */
async function ensureFirstSuperAdmin() {
  const active = await prisma.userRole.count({ where: { role: "SUPER_ADMIN", user: { status: "ACTIVE" } } });
  if (active > 0) {
    console.log("Owner account present: staff accounts are managed in the application");
    return;
  }
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.warn(
      "No owner account yet. Put BOOTSTRAP_OWNER_EMAIL=you@example.org in secrets/override.env and run ./prod.sh seed",
    );
    return;
  }
  const name = process.env.BOOTSTRAP_OWNER_NAME?.trim() || "System Administrator";
  const existing = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  await prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          status: "ACTIVE",
          profile: { create: { fullName: name, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
        },
      }));
    if (existing && existing.status !== "ACTIVE")
      await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    if (!existing?.roles.some((r) => r.role === "SUPER_ADMIN"))
      await tx.userRole.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
    await tx.auditEvent.create({
      data: {
        action: "user.seeded",
        entityType: "user",
        entityId: user.id,
        metadata: { role: "SUPER_ADMIN" },
      },
    });
  });
  console.log("created the first owner account (sign in with an e-mail code)");
}

/** Test/demo staff accounts (reserved .test domain) must never have access in a real deployment. */
async function disableTestAccounts() {
  const r = await prisma.user.updateMany({
    where: {
      email: { endsWith: ".test" },
      status: "ACTIVE",
      roles: { some: { role: { not: "CANDIDATE" } } },
    },
    data: { status: "DISABLED" },
  });
  if (r.count) {
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: ".test" }, status: "DISABLED" } },
    });
    console.log(`disabled ${r.count} test staff account(s)`);
  }
}

async function main() {
  await registerTemplates();
  await ensureSpecialisations();
  await ensureFirstDepartment();
  await ensureFirstSuperAdmin();
  await disableTestAccounts();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
