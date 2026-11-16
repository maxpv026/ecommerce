-- One row per physical browser in "Active sessions" (UserSession.deviceKey).
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-16_user_session_device_key.sql
-- (never `db push`: it would drop the hand-made pgvector index).
--
-- Rollback, if ever needed:
--   DROP INDEX IF EXISTS "UserSession_userId_deviceKey_idx";
--   ALTER TABLE "UserSession" DROP COLUMN IF EXISTS "deviceKey";

ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "deviceKey" TEXT;

CREATE INDEX IF NOT EXISTS "UserSession_userId_deviceKey_idx" ON "UserSession"("userId", "deviceKey");
