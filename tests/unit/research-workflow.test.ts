import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  findTransition,
  type AppStatus,
} from "~/modules/applications/workflow";

describe("Research recruitment workflow state machine", () => {
  describe("Research category transitions", () => {
    it("allows HR to shortlist directly from SUBMITTED", () => {
      const transition = findTransition("SUBMITTED", "SHORTLISTED", "hr", "RESEARCH");
      expect(transition).toBeDefined();
      expect(transition?.to).toBe("SHORTLISTED");
      expect(transition?.category).toBe("RESEARCH");
    });

    it("allows HR to shortlist from UNDER_HR_REVIEW", () => {
      const transition = findTransition("UNDER_HR_REVIEW", "SHORTLISTED", "hr", "RESEARCH");
      expect(transition).toBeDefined();
      expect(transition?.to).toBe("SHORTLISTED");
      expect(transition?.category).toBe("RESEARCH");
    });

    it("does not allow HR to forward research applications to UNDER_DEPARTMENT_REVIEW", () => {
      const transition = findTransition("UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW", "hr", "RESEARCH");
      expect(transition).toBeUndefined();
    });

    it("does not expose HOD-based transitions for research category", () => {
      const acceptShortlist = findTransition("HOD_ACCEPTED", "SHORTLISTED", "hr", "RESEARCH");
      expect(acceptShortlist).toBeUndefined();

      const rejectHod = findTransition("HOD_REJECTED", "REJECTED", "hr", "RESEARCH");
      expect(rejectHod).toBeUndefined();
    });

    it("allows standard terminal transitions (SHORTLISTED -> APPROVED, SHORTLISTED -> REJECTED)", () => {
      const approve = findTransition("SHORTLISTED", "APPROVED", "hr", "RESEARCH");
      expect(approve).toBeDefined();
      expect(approve?.reasonRequired).toBe(true);

      const reject = findTransition("SHORTLISTED", "REJECTED", "hr", "RESEARCH");
      expect(reject).toBeDefined();
      expect(reject?.reasonRequired).toBe(true);
    });

    it("allows candidate submission and withdrawal for research applications", () => {
      const submit = findTransition("DRAFT", "SUBMITTED", "candidate", "RESEARCH");
      expect(submit).toBeDefined();

      const withdraw = findTransition("SUBMITTED", "WITHDRAWN", "candidate", "RESEARCH");
      expect(withdraw).toBeDefined();
      expect(withdraw?.reasonRequired).toBe(true);
    });

    it("lists only valid available transitions for research from UNDER_HR_REVIEW", () => {
      const transitions = availableTransitions("UNDER_HR_REVIEW", "hr", "RESEARCH");
      const targetStatuses = transitions.map((t) => t.to);
      expect(targetStatuses).toContain("SHORTLISTED");
      expect(targetStatuses).toContain("REJECTED");
      expect(targetStatuses).toContain("NEEDS_CLARIFICATION");
      expect(targetStatuses).not.toContain("UNDER_DEPARTMENT_REVIEW");
    });
  });

  describe("Faculty category transitions (isolation and regression check)", () => {
    it("does not allow direct HR shortlisting from SUBMITTED for faculty", () => {
      const transition = findTransition("SUBMITTED", "SHORTLISTED", "hr", "FACULTY");
      expect(transition).toBeUndefined();
    });

    it("does not allow direct HR shortlisting from UNDER_HR_REVIEW for faculty without department review", () => {
      const directShortlist = findTransition("UNDER_HR_REVIEW", "SHORTLISTED", "hr", "FACULTY");
      expect(directShortlist).toBeUndefined();
    });

    it("allows forwarding faculty applications to department review", () => {
      const toDept = findTransition("UNDER_HR_REVIEW", "UNDER_DEPARTMENT_REVIEW", "hr", "FACULTY");
      expect(toDept).toBeDefined();
      expect(toDept?.requires).toBe("documentsReady");
    });

    it("allows HOD transitions for faculty", () => {
      const acceptShortlist = findTransition("HOD_ACCEPTED", "SHORTLISTED", "hr", "FACULTY");
      expect(acceptShortlist).toBeDefined();
    });
  });
});
