import { describe, expect, it } from "vitest";
import { interviewEligible } from "~/modules/applications/interview.server";

const base = {
  recruitmentCategory: "FACULTY",
  interviewInvitedAt: null as Date | null,
};

describe("interviewEligible", () => {
  it("allows the normal path: HOD accepted, position change, or faculty under HR review", () => {
    expect(interviewEligible({ ...base, status: "HOD_ACCEPTED" })).toBe(true);
    expect(interviewEligible({ ...base, status: "HOD_RECOMMENDED_CHANGE" })).toBe(true);
    expect(interviewEligible({ ...base, status: "SHORTLISTED" })).toBe(true);
  });

  it("faculty cannot be called straight from HR review without the HOD's decision", () => {
    expect(interviewEligible({ ...base, status: "UNDER_HR_REVIEW" })).toBe(false);
    expect(interviewEligible({ ...base, status: "UNDER_HR_REVIEW", recruitmentCategory: "RESEARCH" })).toBe(
      true,
    );
  });

  it("a HOD rejection never blocks the call on its own — Dean / Principal / advisor review is optional every cycle", () => {
    expect(interviewEligible({ ...base, status: "HOD_REJECTED" })).toBe(true);
  });

  it("once a call was sent, sending again (to correct a mistake) is always allowed", () => {
    const sentBefore = { ...base, interviewInvitedAt: new Date() };
    expect(interviewEligible({ ...sentBefore, status: "APPROVED" })).toBe(true);
    expect(interviewEligible({ ...sentBefore, status: "REJECTED" })).toBe(true);
    expect(interviewEligible({ ...sentBefore, status: "HOD_REJECTED" })).toBe(true);
  });
});
