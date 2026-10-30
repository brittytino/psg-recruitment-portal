import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Public
  index("routes/home.tsx"),
  route("vacancies", "routes/vacancies.tsx"),
  route("vacancies/:code", "routes/vacancy.tsx"),
  route("help", "routes/help.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("open-positions.pdf", "routes/files/notice.ts"),
  route("notifications", "routes/notifications.ts"),
  route("research-positions.pdf", "routes/files/notice.ts", { id: "research-notice" }),

  // Account
  route("register", "routes/auth/register.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("login/verify", "routes/auth/login-verify.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("verify-email", "routes/auth/verify-email.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),

  // Help desk (candidates). Overview and articles are public; tickets need sign-in.
  route("help-desk", "routes/help-desk/index.tsx"),
  route("help-desk/tickets", "routes/help-desk/tickets.tsx"),
  route("help-desk/new", "routes/help-desk/new.tsx"),
  route("help-desk/tickets/:id", "routes/help-desk/ticket.tsx"),
  route("help-desk/articles", "routes/help-desk/articles.tsx"),
  route("help-desk/articles/:slug", "routes/help-desk/article.tsx"),
  route("help-desk/files/:id", "routes/help-desk/file.ts"),

  // Candidate
  route("account", "routes/candidate/account.tsx"),
  route("apply/:code", "routes/candidate/apply.tsx"),
  route("applications/:id", "routes/candidate/application.tsx"),
  route("applications/:id/attachments", "routes/candidate/attachments.ts"),
  route("applications/:id/documents", "routes/candidate/documents.tsx"),
  route("applications/:id/review", "routes/candidate/review.tsx"),
  route("applications/:id/receipt", "routes/candidate/receipt.tsx"),
  route("applications/:id/preview.pdf", "routes/candidate/preview-pdf.ts"),

  // Staff
  route("staff", "routes/staff/index.tsx"),
  route("staff/applications/:id", "routes/staff/application.tsx"),
  route("staff/export.csv", "routes/staff/export.ts"),
  route("staff/search.json", "routes/staff/search.ts"),
  route("staff/review", "routes/staff/review.tsx"),
  route("staff/summary", "routes/staff/summary.tsx"),
  route("staff/summary/:id", "routes/staff/summary-sheet.tsx"),
  route("staff/audit", "routes/staff/audit.tsx"),
  route("staff/help-desk", "routes/staff/help-desk.tsx"),
  route("staff/help-desk/settings", "routes/staff/help-desk-settings.tsx"),
  route("staff/help-desk/:id", "routes/staff/help-desk-ticket.tsx"),

  // Administration
  route("admin", "routes/admin/index.tsx"),
  route("admin/vacancies/new", "routes/admin/vacancy-new.tsx"),
  route("admin/vacancies/:id/edit", "routes/admin/vacancy-edit.tsx"),
  route("admin/departments", "routes/admin/departments.tsx"),
  route("admin/notices", "routes/admin/notices.tsx"),
  route("admin/users", "routes/admin/users.tsx"),
  route("admin/settings", "routes/admin/settings.tsx"),
  route("admin/logs", "routes/admin/logs.tsx"),
  route("admin/logs/download", "routes/admin/logs-download.ts"),

  // Private files (authorised resource routes)
  route("files/documents/:id", "routes/files/document.ts"),
  route("files/bundles/:id", "routes/files/bundle.ts"),

  // Health
  route("healthz/live", "routes/health/live.ts"),
  route("healthz/ready", "routes/health/ready.ts"),
  route("healthz/smtp", "routes/health/smtp.ts"),
] satisfies RouteConfig;
