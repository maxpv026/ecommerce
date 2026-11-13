-- Market hub: price history, target-price alerts, news sentiment votes and bookmarks.
--
-- Additive only, and safe to re-run. Applied with
--   npx prisma db execute --file prisma/sql/2026-11-13_market_hub.sql
-- (never `db push`: it would drop the hand-made pgvector index).
--
-- Rollback, if ever needed:
--   DROP TABLE IF EXISTS "PriceSnapshot", "PriceAlert", "InsightVote", "InsightBookmark";

CREATE TABLE IF NOT EXISTS "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "mark" TEXT,
    "pricePerKg" DECIMAL(12,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PriceSnapshot_mark_recordedAt_idx" ON "PriceSnapshot"("mark", "recordedAt");
CREATE INDEX IF NOT EXISTS "PriceSnapshot_productId_recordedAt_idx" ON "PriceSnapshot"("productId", "recordedAt");

CREATE TABLE IF NOT EXISTS "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mark" TEXT NOT NULL,
    "targetPerKg" DECIMAL(12,2) NOT NULL,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceAlert_userId_mark_key" ON "PriceAlert"("userId", "mark");
CREATE INDEX IF NOT EXISTS "PriceAlert_mark_triggeredAt_idx" ON "PriceAlert"("mark", "triggeredAt");

CREATE TABLE IF NOT EXISTS "InsightVote" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InsightVote_insightId_userId_key" ON "InsightVote"("insightId", "userId");
CREATE INDEX IF NOT EXISTS "InsightVote_insightId_idx" ON "InsightVote"("insightId");

CREATE TABLE IF NOT EXISTS "InsightBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightBookmark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InsightBookmark_userId_insightId_key" ON "InsightBookmark"("userId", "insightId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceAlert_userId_fkey') THEN
    ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InsightVote_userId_fkey') THEN
    ALTER TABLE "InsightVote" ADD CONSTRAINT "InsightVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InsightBookmark_userId_fkey') THEN
    ALTER TABLE "InsightBookmark" ADD CONSTRAINT "InsightBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
