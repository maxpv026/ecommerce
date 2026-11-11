-- Settings command centre: abandoned-cart reminders, restock cadence,
-- F-Gas expiry warnings, "sign out of all other devices".
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-12_account_settings_notifications.sql
-- (never `db push`: it would drop the hand-made pgvector index,
-- see 2026-09-16_pgvector.sql).
--
-- Rollback, if ever needed:
--   DROP TABLE IF EXISTS "SavedCart";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "fGasExpiryWarned30For", DROP COLUMN IF EXISTS "fGasExpiryWarned7For",
--     DROP COLUMN IF EXISTS "notifyAbandonedCart", DROP COLUMN IF EXISTS "notifyFgasExpiry",
--     DROP COLUMN IF EXISTS "reorderReminderDays", DROP COLUMN IF EXISTS "sessionsRevokedAt";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fGasExpiryWarned30For" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fGasExpiryWarned7For" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyAbandonedCart" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyFgasExpiry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reorderReminderDays" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SavedCart" (
    "userId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedCart_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX IF NOT EXISTS "SavedCart_contentUpdatedAt_idx" ON "SavedCart"("contentUpdatedAt");

DO $$ BEGIN
  ALTER TABLE "SavedCart" ADD CONSTRAINT "SavedCart_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
