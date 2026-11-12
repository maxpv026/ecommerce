-- Resolved country on User (lib/userCountry) — for the admin directory's
-- country badge and filter.
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-12_user_country.sql
-- (never `db push`: it would drop the hand-made pgvector index).
-- Existing rows are filled by scripts/backfill-user-country.ts.
--
-- Rollback, if ever needed:
--   DROP INDEX IF EXISTS "User_countryCode_idx";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "countryCode", DROP COLUMN IF EXISTS "countryCity",
--     DROP COLUMN IF EXISTS "countrySource", DROP COLUMN IF EXISTS "countryUpdatedAt";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countryCity" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countrySource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countryUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_countryCode_idx" ON "User"("countryCode");
