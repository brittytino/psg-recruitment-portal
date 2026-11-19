import { describe, expect, it } from "vitest";
import {
  grantableRoles,
  homePath,
  hasPermission,
  isAdvisor,
  STAFF_ROLES,
  type RoleGrant,
} from "~/modules/auth/permissions";
import { advisoryApplicationScope, staffApplicationScope } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";

const advisor: RoleGrant[] = [{ role: "ADVISOR", departmentId: null }];
const actor = (grants: RoleGrant[]) => ({ id: "u1", grants }) as unknown as SessionUser;

describe("External advisor role", () => {
  it("can read and record an advisory opinion, and nothing else", () => {
    expect(hasPermission(advisor, "advisory:review")).toBe(true);
    expect(hasPermission(advisor, "application:read")).toBe(true);
    for (const p of [
      "application:list",
      "application:transition",
      "application:assign",
      "application:export",
      "review:record",
      "review:final",
      "summary:read",
      "user:manage",
      "settings:manage",
      "audit:read",
      "helpdesk:handle",
      "viewer:manage",
    ] as const)
      expect(hasPermission(advisor, p), p).toBe(false);
  });

  it("lands on the advisory page and is a staff role", () => {
    expect(isAdvisor(advisor)).toBe(true);
    expect(homePath(advisor)).toBe("/advisory");
    expect(STAFF_ROLES).toContain("ADVISOR");
  });

  it("is scoped to applications whose HOD review is complete, across departments", () => {
    const scope = JSON.stringify(staffApplicationScope(actor(advisor)));
    expect(scope).toContain("HOD_ACCEPTED");
    expect(scope).not.toContain("ASSIGNED_TO_HOD");
    expect(scope).not.toContain("UNDER_HR_REVIEW");
    expect(advisoryApplicationScope()).toEqual({
      status: { in: expect.arrayContaining(["HOD_REJECTED", "APPROVED"]) },
    });
  });

  it("only the Super Admin can grant it", () => {
    expect(grantableRoles([{ role: "MANAGER", departmentId: null }])).not.toContain("ADVISOR");
    expect(grantableRoles([{ role: "SUPER_ADMIN", departmentId: null }])).toContain("ADVISOR");
  });
});

describe("Advisor management and rating", () => {
  it("HR, Admin and Super Admin can add and remove advisors; HOD cannot", () => {
    expect(hasPermission([{ role: "HR", departmentId: null }], "advisor:manage")).toBe(true);
    expect(hasPermission([{ role: "SUPER_ADMIN", departmentId: null }], "advisor:manage")).toBe(true);
    expect(hasPermission([{ role: "MANAGER", departmentId: null }], "advisor:manage")).toBe(true);
    // Account deletion stays Super Admin only.
    expect(hasPermission([{ role: "MANAGER", departmentId: null }], "system:manage")).toBe(false);
    expect(hasPermission([{ role: "HOD", departmentId: "d1" }], "advisor:manage")).toBe(false);
  });
});
