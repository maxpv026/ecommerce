-- Favorites (wishlist) + price-drop alert bookkeeping.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-10-25_add_favorites.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand and is deliberately left out. Safe to re-run.

CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lastAlertPrice" DECIMAL(12,2),
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Favorite_productId_idx" ON "Favorite"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_productId_key" ON "Favorite"("userId", "productId");

DO $$ BEGIN
  ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
