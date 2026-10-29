-- Separate "open positions" PDFs for Faculty and Research. Existing notices are Faculty notices.
-- Additive and idempotent: no existing row is changed except for the new column's default.
ALTER TABLE public_notices ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'FACULTY';

DO $$ BEGIN
  ALTER TABLE public_notices ADD CONSTRAINT public_notices_category_check CHECK (category IN ('FACULTY', 'RESEARCH'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS "public_notices_active_uploadedAt_idx";
CREATE INDEX IF NOT EXISTS "public_notices_category_active_uploadedAt_idx" ON public_notices (category, active, "uploadedAt");
