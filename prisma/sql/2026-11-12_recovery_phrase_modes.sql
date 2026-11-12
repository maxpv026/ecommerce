-- Recovery phrase modes: SEED_12 (word-by-word challenge) and CUSTOM_PHRASE.
-- Additive, nullable, safe to re-run:
--   npx prisma db execute --file prisma/sql/2026-11-12_recovery_phrase_modes.sql
-- Rollback:
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "recoveryLastChallengeAt", DROP COLUMN IF EXISTS "recoveryPhrasePending",
--     DROP COLUMN IF EXISTS "recoveryPhraseSalt", DROP COLUMN IF EXISTS "recoveryPhraseType", DROP COLUMN IF EXISTS "recoveryWordHashes";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryLastChallengeAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhrasePending" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhraseSalt" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryPhraseType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recoveryWordHashes" JSONB;
