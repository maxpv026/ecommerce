-- Real device sessions (UserSession) + recovery phrase on User.
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-12_device_sessions_recovery_phrase.sql
-- (never `db push`: it would drop the hand-made pgvector index).
--
-- Rollback, if ever needed:
--   DROP TABLE IF EXISTS "UserSession";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "recoveryPhraseHash",
--     DROP COLUMN IF EXISTS "recoveryPhraseHint", DROP COLUMN IF EXISTS "recoveryPhraseSetAt";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhraseHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhraseHint" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhraseSetAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "deviceType" TEXT,
    "ipAddress" TEXT,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionTokenId_key" ON "UserSession"("sessionTokenId");
CREATE INDEX IF NOT EXISTS "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");

DO $$ BEGIN
  ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
