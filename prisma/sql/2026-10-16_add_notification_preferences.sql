-- Email notification preferences (Settings → Notifications).
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- Three booleans with defaults; nothing is dropped or rewritten. Existing
-- users get back-in-stock ON (they asked for those, product by product) and
-- the two marketing-type mails OFF until they opt in.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/2026-10-16_add_notification_preferences.sql
--
-- NOT with `npx prisma db push`: the diff also carries
--   DROP INDEX "KnowledgeChunk_embedding_hnsw_idx";
-- (the hand-made pgvector index, see 2026-09-16_pgvector.sql), which db push
-- would silently delete.
--
-- Safe to re-run.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyBackInStock" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyPriceDrops" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notifyRegulatoryUpdates" BOOLEAN NOT NULL DEFAULT false;
