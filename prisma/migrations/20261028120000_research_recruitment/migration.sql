-- CreateEnum
CREATE TYPE "RecruitmentCategory" AS ENUM ('FACULTY', 'RESEARCH');

-- AlterEnum
ALTER TYPE "FormCode" ADD VALUE IF NOT EXISTS 'RESEARCH_APPLICATION';

-- AlterTable vacancies
ALTER TABLE "vacancies" ALTER COLUMN "departmentId" DROP NOT NULL;
ALTER TABLE "vacancies" ALTER COLUMN "position" DROP NOT NULL;
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "recruitmentCategory" "RecruitmentCategory" NOT NULL DEFAULT 'FACULTY';
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "researchPositionTitle" TEXT;
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "researchSpecialisationId" UUID;

-- CreateTable research_specialisations
CREATE TABLE IF NOT EXISTS "research_specialisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_specialisations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "research_specialisations_name_key" ON "research_specialisations"("name");
CREATE INDEX IF NOT EXISTS "research_specialisations_active_sortOrder_idx" ON "research_specialisations"("active", "sortOrder");

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_researchSpecialisationId_fkey" FOREIGN KEY ("researchSpecialisationId") REFERENCES "research_specialisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "vacancies_recruitmentCategory_status_idx" ON "vacancies"("recruitmentCategory", "status");

-- AlterTable applications
ALTER TABLE "applications" ALTER COLUMN "appliedPosition" DROP NOT NULL;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "recruitmentCategory" "RecruitmentCategory" NOT NULL DEFAULT 'FACULTY';
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "applications_recruitmentCategory_status_idx" ON "applications"("recruitmentCategory", "status");

-- CreateTable research_reference_counters
CREATE TABLE IF NOT EXISTS "research_reference_counters" (
    "academicYear" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "research_reference_counters_pkey" PRIMARY KEY ("academicYear")
);
