-- Product sizes: container type + family grouping.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-10-17_add_product_families.sql`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand outside the schema and is deliberately
-- left out. Safe to re-run.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "containerType" TEXT NOT NULL DEFAULT 'Cylinder';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "familyKey" TEXT;

CREATE INDEX IF NOT EXISTS "Product_familyKey_idx" ON "Product"("familyKey");
