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
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, type Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";

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
];

const STAFF: { email: string; name: string; role: Role }[] = [
  { email: "dean.admn@psgtech.ac.in", name: "Dr. S. Saravanan (Dean)", role: "ADMIN" },
  { email: "principal@psgtech.ac.in", name: "Principal", role: "ADMIN" },
  { email: "admin.n4@psgtech.ac.in", name: "HR – N4 Section", role: "HR" },
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
  // New vacancies use the latest version; v1 stays registered so existing applications still render.
  await prisma.formTemplate.updateMany({ where: { version: 1 }, data: { active: false } });
}

async function ensureStaff() {
  const origin = process.env.APP_ORIGIN ?? "";
  for (const s of STAFF) {
    const existing = await prisma.user.findUnique({ where: { email: s.email }, include: { roles: true } });
    if (existing) {
      if (!existing.roles.some((r) => r.role === s.role))
        await prisma.userRole.create({ data: { userId: existing.id, role: s.role } });
      continue;
    }
    const token = randomBytes(32).toString("base64url");
    const passwordHash = await hash(randomBytes(32).toString("base64url"), {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const link = `${origin}/reset-password?token=${token}`;
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: s.email,
          passwordHash,
          emailVerifiedAt: new Date(),
          roles: { create: { role: s.role } },
          profile: { create: { fullName: s.name, privacyVersion: "staff", privacyAcceptedAt: new Date() } },
          tokens: {
            create: {
              type: "PASSWORD_RESET",
              tokenHash: sha(token),
              expiresAt: new Date(Date.now() + 72 * 3600_000),
            },
          },
        },
      });
      const n = await tx.notification.create({
        data: {
          userId: user.id,
          type: "account.staff_invite",
          subject: "Your PSG Tech recruitment portal account",
          body: `An account has been created for you on the PSG College of Technology Staff Recruitment Portal.\n\nSet your password within 72 hours:\n${link}\n\nAfter setting the password, sign in with your e-mail address. A one-time code is sent to this mailbox at every sign-in.`,
        },
      });
      await tx.outboxEvent.create({ data: { type: "email.send", payload: { notificationId: n.id } } });
      await tx.auditEvent.create({
        data: { action: "user.seeded", entityType: "user", entityId: user.id, metadata: { role: s.role } },
      });
    });
    console.log(`created ${s.role} ${s.email} — set-password link (72 h, shown once): ${link}`);
  }
}

async function main() {
  await registerTemplates();
  await ensureStaff();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
