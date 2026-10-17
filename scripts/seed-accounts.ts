import { PrismaClient, type Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@12345";

async function main() {
  console.log("Seeding / updating demo accounts for all roles...");
  const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  // 1. Ensure departments exist
  const cse = await prisma.department.upsert({
    where: { code: "DEMO-CSE" },
    update: {},
    create: {
      code: "DEMO-CSE",
      name: "Computer Science and Engineering (demo)",
      disciplines: {
        create: [{ name: "Artificial Intelligence (demo)" }, { name: "Systems (demo)" }],
      },
    },
  });

  const ece = await prisma.department.upsert({
    where: { code: "DEMO-ECE" },
    update: {},
    create: {
      code: "DEMO-ECE",
      name: "Electronics and Communication Engineering (demo)",
      disciplines: {
        create: [{ name: "VLSI Design (demo)" }],
      },
    },
  });

  // 2. Define the accounts for each of the 6 roles
  const accounts: {
    email: string;
    name: string;
    role: Role;
    departmentId?: string;
    description: string;
  }[] = [
    {
      email: "superadmin@example.test",
      name: "Dr. K. Super Administrator",
      role: "SUPER_ADMIN",
      description: "Manage system users, assign roles, and configure system settings.",
    },
    {
      email: "admin@example.test",
      name: "Prof. R. Recruitment Admin",
      role: "RECRUITMENT_ADMIN",
      description: "Manage recruitment cycles, publish vacancies, configure departments & disciplines.",
    },
    {
      email: "hr@example.test",
      name: "S. HR Officer",
      role: "HR_OFFICER",
      description: "Screen applications, assign reviewers, export CSVs, trigger PDF bundling.",
    },
    {
      email: "reviewer.cse@example.test",
      name: "Dr. M. CSE Reviewer",
      role: "DEPARTMENT_REVIEWER",
      departmentId: cse.id,
      description: "Review CSE faculty applications, record academic scores and interview recommendations.",
    },
    {
      email: "reviewer.ece@example.test",
      name: "Dr. V. ECE Reviewer",
      role: "DEPARTMENT_REVIEWER",
      departmentId: ece.id,
      description: "Review ECE faculty applications, record academic scores and interview recommendations.",
    },
    {
      email: "auditor@example.test",
      name: "A. Compliance Auditor",
      role: "AUDITOR",
      description: "Read-only compliance access to all applications and the immutable audit trail.",
    },
    {
      email: "candidate@example.test",
      name: "Dr. A. Candidate",
      role: "CANDIDATE",
      description: "Browse vacancies, submit official online forms, upload certificates, track status.",
    },
    {
      email: "candidate2@example.test",
      name: "Dr. B. Second Candidate",
      role: "CANDIDATE",
      description: "Alternative candidate account with separate draft applications.",
    },
  ];

  console.log("\n=======================================================");
  console.log(" ROLE ACCOUNTS STATUS");
  console.log("=======================================================");

  for (const acc of accounts) {
    const existing = await prisma.user.findUnique({
      where: { email: acc.email },
      include: { roles: true },
    });

    if (existing) {
      // Update password, reset lockout and ensure verified
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

      // Ensure role is assigned
      const hasRole = existing.roles.some(
        (r) => r.role === acc.role && (acc.departmentId ? r.departmentId === acc.departmentId : true),
      );

      if (!hasRole) {
        await prisma.userRole.create({
          data: {
            userId: existing.id,
            role: acc.role,
            departmentId: acc.departmentId ?? null,
          },
        });
      }

      console.log(`[UPDATED] ${acc.role.padEnd(20)} | ${acc.email.padEnd(28)} | Password: ${PASSWORD}`);
    } else {
      // Create new user
      await prisma.user.create({
        data: {
          email: acc.email,
          passwordHash,
          emailVerifiedAt: new Date(),
          status: "ACTIVE",
          roles: {
            create: [
              {
                role: acc.role,
                departmentId: acc.departmentId ?? null,
              },
            ],
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

      console.log(`[CREATED] ${acc.role.padEnd(20)} | ${acc.email.padEnd(28)} | Password: ${PASSWORD}`);
    }
  }

  console.log("=======================================================\n");
  console.log("All demo accounts are ready for testing!");
}

main()
  .catch((e) => {
    console.error("Error seeding accounts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
