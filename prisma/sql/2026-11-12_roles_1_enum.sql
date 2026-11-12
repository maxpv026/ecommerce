-- 4-role RBAC, step 1 of 2: the new enum values.
-- Run on its own: Postgres cannot use an enum value in the transaction that
-- adds it, so step 2 (2026-11-12_roles_2_owner.sql) is a separate execute.
--   npx prisma db execute --file prisma/sql/2026-11-12_roles_1_enum.sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
