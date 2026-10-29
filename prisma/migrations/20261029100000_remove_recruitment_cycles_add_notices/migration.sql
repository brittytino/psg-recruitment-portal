-- Recruitment cycles are removed. Each vacancy now carries its own academic year (used in
-- application reference numbers); existing values are copied from the old cycle first.

ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "academicYear" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'vacancies' AND column_name = 'cycleId') THEN
    UPDATE "vacancies" v
       SET "academicYear" = c."academicYear"
      FROM "recruitment_cycles" c
     WHERE v."cycleId" = c."id" AND v."academicYear" IS NULL;
  END IF;
END $$;

ALTER TABLE "vacancies" DROP CONSTRAINT IF EXISTS "vacancies_cycleId_fkey";
ALTER TABLE "vacancies" DROP COLUMN IF EXISTS "cycleId";

ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_cycleId_fkey";
ALTER TABLE "user_roles" DROP COLUMN IF EXISTS "cycleId";

DROP TABLE IF EXISTS "recruitment_cycles";
DROP TYPE IF EXISTS "CycleStatus";

-- Public notices: PDF files uploaded by HR – N4 Section and shown on the landing page
-- ("Open positions" notification). Only the newest active notice is shown.
CREATE TABLE IF NOT EXISTS "public_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_notices_storageKey_key" ON "public_notices"("storageKey");
CREATE INDEX IF NOT EXISTS "public_notices_active_uploadedAt_idx" ON "public_notices"("active", "uploadedAt");
