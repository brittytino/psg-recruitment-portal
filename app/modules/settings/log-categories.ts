/** System-log categories and retention, shared by the server and the logs page. */
export const LOG_CATEGORIES = {
  all: "Everything",
  errors: "Errors only",
  signin: "Sign-in codes and e-mail",
  pdf: "PDFs and documents",
  ratelimit: "Rate limits",
} as const;
export type LogCategory = keyof typeof LOG_CATEGORIES;
export const LOG_RETENTION_DAYS = 14;
