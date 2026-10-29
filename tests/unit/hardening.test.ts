import { describe, expect, it } from "vitest";
import { todayIst } from "~/lib/dates";
import { jsonLd } from "~/lib/json-ld";
import { ConflictError, ForbiddenError, NotFoundError } from "~/modules/core/errors";
import { getFormDefinition } from "~/modules/forms/registry";
import type { FormCode } from "~/modules/forms/types";
import { validateAnswers } from "~/modules/forms/validation";

describe("hardening", () => {
  it("domain errors render as error responses with their real status", () => {
    for (const [err, status] of [
      [new NotFoundError("Vacancy"), 404],
      [new ForbiddenError(), 403],
      [new ConflictError("busy"), 409],
    ] as const) {
      const e = err as unknown as { type: string; data: unknown; init: { status: number } };
      expect(e.type).toBe("DataWithResponseInit");
      expect(e.init.status).toBe(status);
      expect(e.data).toBe(err.message);
      // Not enumerable: never leaks into logs or JSON.
      expect(Object.keys(err)).not.toContain("type");
    }
  });

  it("JSON-LD cannot close its script tag", () => {
    const out = jsonLd({ description: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).description).toBe("</script><script>alert(1)</script>");
  });

  it("declaration date is the IST calendar date", () => {
    expect(todayIst(new Date("2026-10-29T19:00:00Z"))).toBe("2026-10-30"); // 00:30 IST
    expect(todayIst(new Date("2026-10-29T18:00:00Z"))).toBe("2026-10-29"); // 23:30 IST
  });

  describe("form input abuse", () => {
    const def = getFormDefinition("ASSISTANT_PROFESSOR" as FormCode, 2);
    const msgs = (a: Record<string, unknown>) =>
      validateAnswers(def, a, "draft").map((i) => `${i.path}: ${i.message}`);

    it("rejects oversized text, wrong types and unknown fields", () => {
      expect(msgs({ name: "A".repeat(20_000) }).join()).toMatch(/at most/);
      expect(msgs({ name: { $ne: 1 } }).join()).toMatch(/must be text/);
      expect(msgs({ injected: "x" }).join()).toMatch(/Unknown field/);
    });

    it("rejects impossible dates and bad mobile numbers", () => {
      expect(msgs({ dateOfBirth: "2099-01-01" }).join()).toMatch(/in the past/);
      expect(msgs({ dateOfBirth: "2023-02-30" }).join()).toMatch(/valid date/);
      expect(msgs({ mobile: "12345" }).join()).toMatch(/mobile/i);
    });

    it("caps repeatable tables", () => {
      expect(msgs({ experience: Array.from({ length: 5000 }, () => ({})) }).join()).toMatch(/at most/);
    });

    it("asks the thesis title only for an awarded Ph.D.", () => {
      const at = (phdStatus: string) =>
        validateAnswers(def, { phdStatus }, "submit").map((i) => i.path);
      expect(at("Pursuing")).not.toContain("phdTitle");
      expect(at("Pursuing")).toContain("phdSpecialisation");
      expect(at("Awarded")).toContain("phdTitle");
    });
  });
});
