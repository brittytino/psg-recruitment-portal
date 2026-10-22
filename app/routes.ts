import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Public
  index("routes/home.tsx"),
  route("vacancies", "routes/vacancies.tsx"),
  route("vacancies/:code", "routes/vacancy.tsx"),
  route("help", "routes/help.tsx"),
  route("privacy", "routes/privacy.tsx"),

  // Account
  route("register", "routes/auth/register.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("verify-email", "routes/auth/verify-email.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),

  // Candidate
  route("account", "routes/candidate/account.tsx"),
  route("apply/:code", "routes/candidate/apply.tsx"),
  route("applications/:id", "routes/candidate/application.tsx"),
  route("applications/:id/attachments", "routes/candidate/attachments.ts"),
  route("applications/:id/documents", "routes/candidate/documents.tsx"),
  route("applications/:id/review", "routes/candidate/review.tsx"),
  route("applications/:id/receipt", "routes/candidate/receipt.tsx"),

  // Staff
  route("staff", "routes/staff/index.tsx"),
  route("staff/applications/:id", "routes/staff/application.tsx"),
  route("staff/export.csv", "routes/staff/export.ts"),
  route("staff/audit", "routes/staff/audit.tsx"),

  // Administration
  route("admin", "routes/admin/index.tsx"),
  route("admin/vacancies/new", "routes/admin/vacancy-new.tsx"),
  route("admin/users", "routes/admin/users.tsx"),

  // Private files (authorised resource routes)
  route("files/documents/:id", "routes/files/document.ts"),
  route("files/bundles/:id", "routes/files/bundle.ts"),

  // Health
  route("healthz/live", "routes/health/live.ts"),
  route("healthz/ready", "routes/health/ready.ts"),
] satisfies RouteConfig;
