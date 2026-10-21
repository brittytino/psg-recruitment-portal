-- Remove any user_roles rows with AUDITOR role
DELETE FROM "user_roles" WHERE role::text = 'AUDITOR';

-- Recreate Role enum without AUDITOR
CREATE TYPE "Role_new" AS ENUM ('CANDIDATE', 'HR_OFFICER', 'DEPARTMENT_REVIEWER', 'RECRUITMENT_ADMIN', 'SUPER_ADMIN');
ALTER TABLE "user_roles" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
