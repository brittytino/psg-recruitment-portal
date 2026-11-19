/**
 * Labels for the advisory recommendation. Kept apart from advisory.server.ts so that route
 * components (which also ship to the browser) can import them without pulling in server code.
 */
export const ADVISORY_RECOMMENDATIONS = ["SHORTLIST", "HOLD", "REJECT"] as const;
export type AdvisoryRecommendation = (typeof ADVISORY_RECOMMENDATIONS)[number];

export const ADVISORY_LABELS: Record<AdvisoryRecommendation, string> = {
  SHORTLIST: "Recommend shortlisting",
  HOLD: "Hold for further consideration",
  REJECT: "Recommend not shortlisting",
};
