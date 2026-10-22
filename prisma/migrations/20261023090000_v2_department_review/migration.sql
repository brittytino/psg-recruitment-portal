-- v2: department-wise HOD review, position-change recommendations, summary sheets, e-mail OTP
-- and department-wise reference numbers.

-- Roles: SUPER_ADMIN / RECRUITMENT_ADMIN -> ADMIN, HR_OFFICER -> HR, DEPARTMENT_REVIEWER -> HOD.
-- A RECRUITMENT_ADMIN grant held together with HR_OFFICER was the old way of letting HR manage
-- job profiles; HR now has that permission, so the extra grant is dropped instead of becoming ADMIN.
DELETE FROM "user_roles" r
WHERE r.role::text = 'RECRUITMENT_ADMIN'
  AND EXISTS (SELECT 1 FROM "user_roles" h WHERE h."userId" = r."userId" AND h.role::text = 'HR_OFFICER');

CREATE TYPE "Role_new" AS ENUM ('CANDIDATE', 'HR', 'HOD', 'ADMIN');
ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'SUPER_ADMIN' THEN 'ADMIN'
    WHEN 'RECRUITMENT_ADMIN' THEN 'ADMIN'
    WHEN 'HR_OFFICER' THEN 'HR'
    WHEN 'DEPARTMENT_REVIEWER' THEN 'HOD'
    ELSE "role"::text
  END
)::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Remove grants that became identical after the mapping.
DELETE FROM "user_roles" a USING "user_roles" b
WHERE a.id > b.id
  AND a."userId" = b."userId"
  AND a.role = b.role
  AND a."departmentId" IS NOT DISTINCT FROM b."departmentId"
  AND a."cycleId" IS NOT DISTINCT FROM b."cycleId";
-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('STAFF_LOGIN', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "HodDecision" AS ENUM ('ACCEPT', 'RECOMMEND_CHANGE', 'REJECT');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SummarySheetStatus" AS ENUM ('APPROVED', 'SUPERSEDED');


-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'ASSIGNED_TO_HOD';
ALTER TYPE "ApplicationStatus" ADD VALUE 'HOD_ACCEPTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'HOD_RECOMMENDED_CHANGE';
ALTER TYPE "ApplicationStatus" ADD VALUE 'HOD_REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'SIGNATURE';
ALTER TYPE "DocumentType" ADD VALUE 'RESUME';
ALTER TYPE "DocumentType" ADD VALUE 'APPOINTMENT_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'SALARY_SLIP';
ALTER TYPE "DocumentType" ADD VALUE 'SERVICE_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE 'MEMBERSHIP_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE 'PUBLICATION_PROOF';
ALTER TYPE "DocumentType" ADD VALUE 'COMPETITIVE_EXAM_SCORECARD';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "exportColumns" JSONB;

-- AlterTable
ALTER TABLE "recruitment_cycles" ADD COLUMN     "academicYear" TEXT;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "appliedPosition" "Position",
ADD COLUMN     "assignedAt" TIMESTAMPTZ(3),
ADD COLUMN     "assignedHodId" UUID,
ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "effectivePosition" "Position",
ADD COLUMN     "hodDecidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "hodDecision" "HodDecision",
ADD COLUMN     "hodDecisionReason" TEXT,
ADD COLUMN     "hodRemarks" TEXT;

-- AlterTable
ALTER TABLE "application_revisions" ADD COLUMN     "competitiveExams" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "conferenceCount" INTEGER,
ADD COLUMN     "hIndex" INTEGER,
ADD COLUMN     "hasPhd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "journalCount" INTEGER,
ADD COLUMN     "phdStatus" TEXT,
ADD COLUMN     "totalExperienceMonths" INTEGER;

-- AlterTable
ALTER TABLE "qualifications" ADD COLUMN     "board" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "classAwarded" TEXT,
ADD COLUMN     "modeOfStudy" TEXT,
ADD COLUMN     "score" TEXT,
ADD COLUMN     "specialisation" TEXT;

-- AlterTable
ALTER TABLE "employment_records" ADD COLUMN     "durationMonths" INTEGER,
ADD COLUMN     "grossSalary" TEXT,
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scaleOfPay" TEXT;

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "department_reference_counters" (
    "academicYear" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "department_reference_counters_pkey" PRIMARY KEY ("academicYear","departmentCode")
);

-- CreateTable
CREATE TABLE "position_change_requests" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromPosition" "Position" NOT NULL,
    "toPosition" "Position" NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,

    CONSTRAINT "position_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_sheets" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "academicYear" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SummarySheetStatus" NOT NULL DEFAULT 'APPROVED',
    "rows" JSONB NOT NULL,
    "approvedById" UUID NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_challenges_userId_purpose_createdAt_idx" ON "otp_challenges"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "position_change_requests_applicationId_idx" ON "position_change_requests"("applicationId");

-- CreateIndex
CREATE INDEX "position_change_requests_status_idx" ON "position_change_requests"("status");

-- CreateIndex
CREATE INDEX "summary_sheets_status_idx" ON "summary_sheets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "summary_sheets_departmentId_academicYear_version_key" ON "summary_sheets"("departmentId", "academicYear", "version");

-- CreateIndex
CREATE INDEX "applications_departmentId_status_idx" ON "applications"("departmentId", "status");

-- CreateIndex
CREATE INDEX "applications_assignedHodId_status_idx" ON "applications"("assignedHodId", "status");

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assignedHodId_fkey" FOREIGN KEY ("assignedHodId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_change_requests" ADD CONSTRAINT "position_change_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_sheets" ADD CONSTRAINT "summary_sheets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill department and applied position from the vacancy for existing applications.
UPDATE "applications" a
SET "departmentId" = v."departmentId", "appliedPosition" = v."position"
FROM "vacancies" v
WHERE v.id = a."vacancyId";

-- Default academic year for existing cycles (June–May academic year of the opening date).
UPDATE "recruitment_cycles"
SET "academicYear" = CASE
  WHEN EXTRACT(MONTH FROM "opensAt" AT TIME ZONE 'Asia/Kolkata') >= 6
    THEN EXTRACT(YEAR FROM "opensAt" AT TIME ZONE 'Asia/Kolkata')::int || '-' ||
         LPAD(((EXTRACT(YEAR FROM "opensAt" AT TIME ZONE 'Asia/Kolkata')::int + 1) % 100)::text, 2, '0')
  ELSE (EXTRACT(YEAR FROM "opensAt" AT TIME ZONE 'Asia/Kolkata')::int - 1) || '-' ||
         LPAD((EXTRACT(YEAR FROM "opensAt" AT TIME ZONE 'Asia/Kolkata')::int % 100)::text, 2, '0')
END
WHERE "academicYear" IS NULL;

-- Approved summary sheets are immutable apart from being marked SUPERSEDED.
CREATE OR REPLACE FUNCTION srp_summary_sheets_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'summary_sheets rows cannot be deleted';
  END IF;
  IF NEW.rows IS DISTINCT FROM OLD.rows OR NEW."departmentId" <> OLD."departmentId"
     OR NEW."academicYear" <> OLD."academicYear" OR NEW.version <> OLD.version
     OR NEW."approvedById" <> OLD."approvedById" OR NEW."approvedAt" <> OLD."approvedAt"
     OR (OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED') THEN
    RAISE EXCEPTION 'approved summary sheets are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER summary_sheets_guard
  BEFORE UPDATE OR DELETE ON "summary_sheets"
  FOR EACH ROW EXECUTE FUNCTION srp_summary_sheets_guard();
