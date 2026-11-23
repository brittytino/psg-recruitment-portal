import { describe, expect, it } from "vitest";
import { hasPermission } from "~/modules/auth/permissions";

describe("Interview kit management", () => {
  it("is HR – N4 Section's own job; Super Admin can also fix it; nobody else can", () => {
    expect(hasPermission([{ role: "HR", departmentId: null }], "interview_kit:manage")).toBe(true);
    expect(hasPermission([{ role: "SUPER_ADMIN", departmentId: null }], "interview_kit:manage")).toBe(true);
    for (const role of ["ADMIN", "MANAGER", "HOD", "VIEWER", "ADVISOR"] as const)
      expect(hasPermission([{ role, departmentId: null }], "interview_kit:manage"), role).toBe(false);
  });
});
