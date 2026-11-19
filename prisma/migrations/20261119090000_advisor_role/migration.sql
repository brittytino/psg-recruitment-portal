-- External advisor role (Role.ADVISOR) and advisory review stage (ReviewStage.ADVISORY).
-- Additive: adds enum values only; no existing row is changed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADVISOR';
ALTER TYPE "ReviewStage" ADD VALUE IF NOT EXISTS 'ADVISORY';
