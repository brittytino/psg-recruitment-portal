import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES, candidateStatusLabel, STATUS_LABELS } from "~/modules/applications/workflow";

describe("candidateStatusLabel", () => {
  it("never reveals the HOD's (provisional) decision to the candidate", () => {
    expect(candidateStatusLabel("HOD_ACCEPTED")).not.toMatch(/hod/i);
    expect(candidateStatusLabel("HOD_REJECTED")).not.toMatch(/hod|reject/i);
    expect(candidateStatusLabel("HOD_RECOMMENDED_CHANGE")).not.toMatch(/hod|position/i);
    // All three read the same to the candidate: still in process, no outcome implied either way.
    expect(candidateStatusLabel("HOD_ACCEPTED")).toBe(candidateStatusLabel("HOD_REJECTED"));
    expect(candidateStatusLabel("HOD_ACCEPTED")).toBe(candidateStatusLabel("HOD_RECOMMENDED_CHANGE"));
  });

  it("matches the normal staff-facing label for every other status (nothing else is redacted)", () => {
    const redacted = new Set(["HOD_ACCEPTED", "HOD_REJECTED", "HOD_RECOMMENDED_CHANGE"]);
    for (const s of APPLICATION_STATUSES) {
      if (redacted.has(s)) continue;
      expect(candidateStatusLabel(s)).toBe(STATUS_LABELS[s]);
    }
  });
});
