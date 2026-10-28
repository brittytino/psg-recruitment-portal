-- AlterTable
ALTER TABLE "qualifications" ADD COLUMN IF NOT EXISTS "class" TEXT;
ALTER TABLE "qualifications" ADD COLUMN IF NOT EXISTS "cgpaOrMarks" TEXT;
