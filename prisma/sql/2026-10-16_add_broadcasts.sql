-- Admin broadcasts (regulatory updates) and their per-recipient work queue.
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- Two new tables and two enums. Nothing existing is altered.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/2026-10-16_add_broadcasts.sql
--
-- NOT with `npx prisma db push`: the diff also carries
--   DROP INDEX "KnowledgeChunk_embedding_hnsw_idx";
-- (the hand-made pgvector index), which db push would silently delete.
--
-- Safe to re-run.

DO $$ BEGIN
  CREATE TYPE "BroadcastStatus" AS ENUM ('SENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Broadcast" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'regulatory',
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'SENDING',
    "authorId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Broadcast_status_createdAt_idx" ON "Broadcast"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");
CREATE INDEX IF NOT EXISTS "BroadcastRecipient_userId_idx" ON "BroadcastRecipient"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_userId_key" ON "BroadcastRecipient"("broadcastId", "userId");

DO $$ BEGIN
  ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
    FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
