-- Brute-force throttles for sign-in (lib/loginThrottle) and emailed codes (lib/otp).
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-11-11_auth_throttles.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand and is deliberately left out. Safe to re-run.
-- Additive with defaults: a deployment built before this file keeps working.

ALTER TABLE "OtpCode" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginLockedUntil" TIMESTAMP(3);
