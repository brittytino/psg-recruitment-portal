-- "Admin" role (enum value MANAGER): recruitment and support management below the Super Admin.
-- Additive and idempotent: adds one enum value; no existing row is changed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
