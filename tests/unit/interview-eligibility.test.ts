import { describe, expect, it } from "vitest";
import { interviewEligible } from "~/modules/applications/interview.server";

const base = {
  recruitmentCategory: "FACULTY",
  finalDecision: null as string | null,
  interviewInvitedAt: null as Date | null,
};

describe("interviewEligible", () => {
  it("allows the normal path: HOD accepted, position change, or faculty under HR review", () => {
    expect(interviewEligible({ ...base, status: "HOD_ACCEPTED" }, false)).toBe(true);
    expect(interviewEligible({ ...base, status: "HOD_RECOMMENDED_CHANGE" }, false)).toBe(true);
    expect(interviewEligible({ ...base, status: "SHORTLISTED" }, false)).toBe(true);
  });

  it("faculty cannot be called straight from HR review without the HOD's decision", () => {
    expect(interviewEligible({ ...base, status: "UNDER_HR_REVIEW" }, false)).toBe(false);
    expect(
      interviewEligible({ ...base, status: "UNDER_HR_REVIEW", recruitmentCategory: "RESEARCH" }, false),
    ).toBe(true);
  });

  it("a plain HOD rejection, with nobody else overruling, blocks the call", () => {
    expect(interviewEligible({ ...base, status: "HOD_REJECTED" }, false)).toBe(false);
  });

  it("the Dean / Principal / Admin accepting on final review overrules a HOD rejection", () => {
    expect(interviewEligible({ ...base, status: "HOD_REJECTED", finalDecision: "ACCEPT" }, false)).toBe(true);
  });

  it("the external advisor recommending shortlisting overrules a HOD rejection", () => {
    expect(interviewEligible({ ...base, status: "HOD_REJECTED" }, true)).toBe(true);
  });

  it("once a call was sent, sending again (to correct a mistake) is always allowed", () => {
    const sentBefore = { ...base, interviewInvitedAt: new Date() };
    expect(interviewEligible({ ...sentBefore, status: "APPROVED" }, false)).toBe(true);
    expect(interviewEligible({ ...sentBefore, status: "REJECTED" }, false)).toBe(true);
    expect(interviewEligible({ ...sentBefore, status: "HOD_REJECTED" }, false)).toBe(true);
  });
});
