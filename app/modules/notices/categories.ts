/** "Open positions" PDFs on the home page: one for Faculty, one for Research. Shared with the browser. */
export const NOTICE_CATEGORIES = ["FACULTY", "RESEARCH"] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];
export const NOTICE_LABELS: Record<NoticeCategory, string> = {
  FACULTY: "Faculty positions",
  RESEARCH: "Research positions",
};
/** Public address of each notice PDF. */
export const NOTICE_PATHS: Record<NoticeCategory, string> = {
  FACULTY: "/open-positions.pdf",
  RESEARCH: "/research-positions.pdf",
};
