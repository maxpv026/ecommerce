-- Profile preferences on User + cylinder return requests (/profile hub).
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-12_profile_preferences.sql
-- (never `db push`: it would drop the hand-made pgvector index).
--
-- Rollback, if ever needed:
--   DROP TABLE IF EXISTS "CylinderReturnRequest";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarTone", DROP COLUMN IF EXISTS "avatarInitials",
--     DROP COLUMN IF EXISTS "billingEmail", DROP COLUMN IF EXISTS "depositIban",
--     DROP COLUMN IF EXISTS "preferredFulfilment", DROP COLUMN IF EXISTS "preferredUnits";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarTone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarInitials" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "depositIban" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredFulfilment" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredUnits" TEXT;

CREATE TABLE IF NOT EXISTS "CylinderReturnRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "addressText" TEXT,
    "preferredDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CylinderReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CylinderReturnRequest_userId_createdAt_idx" ON "CylinderReturnRequest"("userId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CylinderReturnRequest_userId_fkey') THEN
    ALTER TABLE "CylinderReturnRequest" ADD CONSTRAINT "CylinderReturnRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Address site type (/profile address manager): WAREHOUSE | SITE | OFFICE, or null.
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "siteType" TEXT;
