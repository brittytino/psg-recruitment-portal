-- HR – N4 Section calls a candidate for interview after the department review.
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "interviewAt" TIMESTAMPTZ(3);
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "interviewVenue" TEXT;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "interviewNotes" TEXT;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "interviewInvitedAt" TIMESTAMPTZ(3);
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "interviewInvitedById" UUID;
