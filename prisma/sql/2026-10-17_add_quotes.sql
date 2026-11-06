-- Instant B2B quotes + archiving of deleted product sizes.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-10-17_add_quotes.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand outside the schema and is deliberately
-- left out. Safe to re-run.

DO $$ BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Product_archivedAt_idx" ON "Product"("archivedAt");

CREATE TABLE IF NOT EXISTS "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "companyName" TEXT,
    "vatNumber" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "depositTotal" DECIMAL(12,2) NOT NULL,
    "shippingAmount" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
-- For a database that ran an earlier copy of this file without it.
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

CREATE TABLE IF NOT EXISTS "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Quote_quoteNumber_key" ON "Quote"("quoteNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_orderId_key" ON "Quote"("orderId");
CREATE INDEX IF NOT EXISTS "Quote_userId_createdAt_idx" ON "Quote"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");
CREATE INDEX IF NOT EXISTS "QuoteItem_productId_idx" ON "QuoteItem"("productId");

DO $$ BEGIN
  ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Quote" ADD CONSTRAINT "Quote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
