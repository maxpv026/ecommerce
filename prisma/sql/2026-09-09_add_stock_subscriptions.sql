-- Back-in-stock waitlist: StockSubscription + the in-stock-first sort index.
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- Purely additive: one new table, three indexes, two foreign keys. Nothing is
-- dropped or rewritten, so it is safe to run against a populated database.
--
-- Apply with EITHER of:
--   npx prisma db push                                     # this repo's normal path
--   npx prisma db execute --file prisma/sql/2026-09-09_add_stock_subscriptions.sql
--
-- `npx prisma migrate dev` is NOT the path here: this project has no
-- prisma/migrations directory (it has always been db push), so migrate would
-- see the existing tables as drift and offer to RESET the database. See the
-- note at the bottom for adopting migrations properly if you want them.
--
-- Safe to re-run: every statement is guarded.

CREATE TABLE IF NOT EXISTS "StockSubscription" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSubscription_pkey" PRIMARY KEY ("id")
);

-- One row per address per product; re-subscribing re-arms the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS "StockSubscription_productId_email_key"
    ON "StockSubscription"("productId", "email");

-- The webhook's hot path: everyone still waiting on one product.
CREATE INDEX IF NOT EXISTS "StockSubscription_productId_notified_idx"
    ON "StockSubscription"("productId", "notified");

-- Backs the in-stock-first ordering used by every product listing.
CREATE INDEX IF NOT EXISTS "Product_inStock_createdAt_idx"
    ON "Product"("inStock", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockSubscription_productId_fkey') THEN
    ALTER TABLE "StockSubscription"
      ADD CONSTRAINT "StockSubscription_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Deleting an account keeps the waitlist entry: the address still wants the mail.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockSubscription_userId_fkey') THEN
    ALTER TABLE "StockSubscription"
      ADD CONSTRAINT "StockSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- If you do want Prisma Migrate from here on, baseline first — do NOT run
-- `migrate dev` against the current database without it, or it will offer to
-- drop everything:
--
--   mkdir -p prisma/migrations/0_init
--   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma \
--       --script > prisma/migrations/0_init/migration.sql
--   npx prisma migrate resolve --applied 0_init
--
-- After that the database is migration-managed and `migrate dev` is safe.
-- ---------------------------------------------------------------------------
