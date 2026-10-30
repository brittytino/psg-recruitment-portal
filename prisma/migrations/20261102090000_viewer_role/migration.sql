-- Read-only "Viewer" role (granted by the Super Admin or HR – N4 Section from the application).
-- Additive and idempotent: adds one enum value; no existing row is changed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VIEWER';
