-- Predictive replenishment: opt-out + one reminder per purchase cycle.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-10-17_restock_reminders.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand and is deliberately left out. Safe to re-run.
--
-- Existing RestockAlert rows keep cycleStart NULL (Postgres allows any number of
-- NULLs in a unique index). lib/smartRestock treats an alert created after the
-- customer's last purchase as belonging to the current cycle, so those rows still
-- suppress a repeat — no backfill needed.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyRestockReminders" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "RestockAlert" ADD COLUMN IF NOT EXISTS "cycleStart" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "RestockAlert_userId_productId_cycleStart_key"
  ON "RestockAlert"("userId", "productId", "cycleStart");
