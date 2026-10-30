import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hasPermission, homePath, type RoleName } from "~/modules/auth/permissions";
import { staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { staffListSchema, staffTickets } from "~/modules/helpdesk/service.server";
import { listApplications, listQuerySchema } from "~/modules/reporting/applications.server";
import { assignToDepartmentHods } from "~/modules/reviews/service.server";
import { addViewer, listViewers, removeViewer } from "~/modules/users/viewers.server";

async function makeUser(role: RoleName): Promise<SessionUser> {
  const u = await prisma.user.create({
    data: {
      email: `vw-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@it.example.test`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      roles: { create: { role } },
      profile: { create: { fullName: `VW ${role}`, privacyVersion: "test", privacyAcceptedAt: new Date() } },
    },
  });
  return {
    id: u.id,
    email: u.email,
    emailVerified: true,
    displayName: u.email,
    grants: [{ role, departmentId: null }],
    sessionId: randomUUID(),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("read-only viewer", () => {
  it("can list and read applications, and nothing else", async () => {
    const v = await makeUser("VIEWER");
    expect(hasPermission(v.grants, "application:list")).toBe(true);
    expect(hasPermission(v.grants, "application:read")).toBe(true);
    for (const p of [
      "application:transition",
      "application:assign",
      "application:export",
      "review:record",
      "summary:read",
      "user:manage",
      "settings:manage",
      "helpdesk:handle",
      "viewer:manage",
    ] as const)
      expect(hasPermission(v.grants, p)).toBe(false);
    expect(staffApplicationScope(v)).toEqual({ status: { not: "DRAFT" } });
    expect(homePath(v.grants)).toBe("/staff");
    const list = await listApplications(v, listQuerySchema.parse({}));
    expect(list.rows.every((r) => r.status !== "DRAFT")).toBe(true);
    await expect(assignToDepartmentHods(v, [randomUUID()])).rejects.toThrow();
    await expect(staffTickets(v, staffListSchema.parse({}))).rejects.toThrow();
  });

  it("HR – N4 and the Super Admin add and remove viewers; HOD and Admin cannot", async () => {
    const hr = await makeUser("HR");
    const email = `viewer-${randomUUID().slice(0, 8)}@it.example.test`;
    await addViewer(hr, { email, fullName: "Read Only Person" });
    const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: true } });
    expect(u.roles.map((r) => r.role)).toEqual(["VIEWER"]);
    expect((await listViewers(hr)).some((x) => x.email === email)).toBe(true);
    await expect(addViewer(hr, { email, fullName: "Again" })).rejects.toThrow(/already a viewer/);

    for (const role of ["HOD", "ADMIN"] as const)
      await expect(
        addViewer(await makeUser(role), { email: `x-${randomUUID()}@it.example.test`, fullName: "No" }),
      ).rejects.toThrow();

    await prisma.session.create({
      data: { id: randomUUID(), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    await removeViewer(await makeUser("SUPER_ADMIN"), u.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { roles: true } });
    expect(after.roles).toHaveLength(0);
    expect(after.status).toBe("DISABLED");
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("refuses candidate addresses", async () => {
    const cand = await makeUser("CANDIDATE");
    await expect(addViewer(await makeUser("HR"), { email: cand.email, fullName: "Cand" })).rejects.toThrow(
      /candidate/,
    );
  });
});
