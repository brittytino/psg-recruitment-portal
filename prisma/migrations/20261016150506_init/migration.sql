-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CANDIDATE', 'HR_OFFICER', 'DEPARTMENT_REVIEWER', 'RECRUITMENT_ADMIN', 'SUPER_ADMIN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('ASSISTANT_PROFESSOR', 'ASSOCIATE_PROFESSOR', 'PROFESSOR');

-- CreateEnum
CREATE TYPE "FormCode" AS ENUM ('ASSISTANT_PROFESSOR', 'ASSOCIATE_PROFESSOR');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_HR_REVIEW', 'UNDER_DEPARTMENT_REVIEW', 'NEEDS_CLARIFICATION', 'SHORTLISTED', 'REJECTED', 'APPROVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PHOTOGRAPH', 'DEGREE_CERTIFICATE', 'MARK_SHEET', 'PHD_CERTIFICATE', 'EXPERIENCE_CERTIFICATE', 'SALARY_CERTIFICATE', 'COMMUNITY_CERTIFICATE', 'PUBLICATIONS', 'NO_OBJECTION_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "GeneratedKind" AS ENUM ('APPLICATION_PDF', 'CONSOLIDATED_BUNDLE');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('HR', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('SHORTLIST', 'REJECT', 'HOLD', 'NEEDS_CLARIFICATION', 'APPROVE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "departmentId" UUID,
    "cycleId" UUID,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "privacyVersion" TEXT NOT NULL,
    "privacyAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_cycles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recruitment_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" UUID NOT NULL,
    "code" "FormCode" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "templatePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "cycleId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "disciplineId" UUID,
    "position" "Position" NOT NULL,
    "formTemplateId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "numberOfPosts" INTEGER,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "VacancyStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_criteria" (
    "id" UUID NOT NULL,
    "vacancyId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eligibility_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "required_documents" (
    "id" UUID NOT NULL,
    "vacancyId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "required_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "referenceNo" TEXT,
    "candidateId" UUID NOT NULL,
    "vacancyId" UUID NOT NULL,
    "formTemplateId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "draftAnswers" JSONB NOT NULL DEFAULT '{}',
    "draftVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSavedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "currentRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_revisions" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "formCode" "FormCode" NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "answersSha256" TEXT NOT NULL,
    "attachmentManifest" JSONB NOT NULL,
    "candidateName" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifications" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "level" TEXT,
    "degree" TEXT NOT NULL,
    "university" TEXT,
    "institution" TEXT,
    "passedOn" TEXT,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_records" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "fromDate" TEXT,
    "toDate" TEXT,
    "nature" TEXT,

    CONSTRAINT "employment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanDetail" TEXT,
    "scannedAt" TIMESTAMPTZ(3),
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "kind" "GeneratedKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "pageCount" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "report" JSONB,
    "requestedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_assignments" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "stage" "ReviewStage" NOT NULL,
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "review_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "assignmentId" UUID,
    "stage" "ReviewStage" NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "score" INTEGER,
    "comments" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_type_idx" ON "auth_tokens"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_departmentId_name_key" ON "disciplines"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_cycles_code_key" ON "recruitment_cycles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_code_version_key" ON "form_templates"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "vacancies_code_key" ON "vacancies"("code");

-- CreateIndex
CREATE INDEX "vacancies_status_closesAt_idx" ON "vacancies"("status", "closesAt");

-- CreateIndex
CREATE INDEX "vacancies_departmentId_idx" ON "vacancies"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "required_documents_vacancyId_documentType_key" ON "required_documents"("vacancyId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "applications_referenceNo_key" ON "applications"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "applications_currentRevisionId_key" ON "applications"("currentRevisionId");

-- CreateIndex
CREATE INDEX "applications_vacancyId_status_idx" ON "applications"("vacancyId", "status");

-- CreateIndex
CREATE INDEX "applications_status_submittedAt_idx" ON "applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "applications_submittedAt_idx" ON "applications"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidateId_vacancyId_key" ON "applications"("candidateId", "vacancyId");

-- CreateIndex
CREATE INDEX "application_revisions_candidateName_idx" ON "application_revisions"("candidateName");

-- CreateIndex
CREATE UNIQUE INDEX "application_revisions_applicationId_revisionNo_key" ON "application_revisions"("applicationId", "revisionNo");

-- CreateIndex
CREATE INDEX "qualifications_revisionId_idx" ON "qualifications"("revisionId");

-- CreateIndex
CREATE INDEX "qualifications_degree_idx" ON "qualifications"("degree");

-- CreateIndex
CREATE INDEX "employment_records_revisionId_idx" ON "employment_records"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_storageKey_key" ON "application_documents"("storageKey");

-- CreateIndex
CREATE INDEX "application_documents_applicationId_documentType_idx" ON "application_documents"("applicationId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_storageKey_key" ON "generated_documents"("storageKey");

-- CreateIndex
CREATE INDEX "generated_documents_status_idx" ON "generated_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_revisionId_kind_version_key" ON "generated_documents"("revisionId", "kind", "version");

-- CreateIndex
CREATE INDEX "application_status_history_applicationId_createdAt_idx" ON "application_status_history"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "review_assignments_reviewerId_idx" ON "review_assignments"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "review_assignments_applicationId_reviewerId_stage_key" ON "review_assignments"("applicationId", "reviewerId", "stage");

-- CreateIndex
CREATE INDEX "reviews_applicationId_idx" ON "reviews"("applicationId");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_actorId_createdAt_idx" ON "audit_events"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_availableAt_idx" ON "outbox_events"("processedAt", "availableAt");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "recruitment_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "recruitment_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_criteria" ADD CONSTRAINT "eligibility_criteria_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "vacancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_documents" ADD CONSTRAINT "required_documents_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "vacancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "application_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_revisions" ADD CONSTRAINT "application_revisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "application_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_records" ADD CONSTRAINT "employment_records_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "application_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "application_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "review_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
