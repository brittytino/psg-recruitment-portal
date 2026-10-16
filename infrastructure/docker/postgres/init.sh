#!/bin/sh
# Runs once, on first initialisation of the PostgreSQL volume.
# Creates the least-privilege application role used at runtime. Schema changes are applied by
# the owner role (POSTGRES_USER) through `prisma migrate deploy`.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
    CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}';
  END IF;
END
\$\$;
REVOKE ALL ON DATABASE "${POSTGRES_DB}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${APP_DB_USER}";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "${APP_DB_USER}";
-- Tables created later by the owner (migrations) are readable/writable by the app role.
-- The app role cannot create, alter or drop tables, and cannot bypass the append-only triggers.
ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "${APP_DB_USER}";
SQL
