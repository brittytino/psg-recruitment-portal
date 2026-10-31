-- Dean / Principal review and 1-5 star screening ratings. Additive only: new enum and nullable columns.
DO $$ BEGIN
  CREATE TYPE "FinalDecision" AS ENUM ('ACCEPT', 'REJECT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "hodRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "finalDecision" "FinalDecision",
  ADD COLUMN IF NOT EXISTS "finalRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "finalRemarks" TEXT,
  ADD COLUMN IF NOT EXISTS "finalDecidedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "finalDecidedById" UUID;

DO $$ BEGIN
  ALTER TABLE "applications" ADD CONSTRAINT "applications_hodRating_range" CHECK ("hodRating" IS NULL OR "hodRating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "applications" ADD CONSTRAINT "applications_finalRating_range" CHECK ("finalRating" IS NULL OR "finalRating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "applications_finalDecision_idx" ON "applications" ("finalDecision");
