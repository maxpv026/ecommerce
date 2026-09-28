-- One-off migration: per-cylinder `Product.price` → weight-based pricing
-- (`pricePerKg` × `weightKg`). For databases that already hold rows.
--
-- Run it BEFORE `npx prisma db push` so the old cylinder prices survive:
--
--   npx prisma db execute --file prisma/sql/2026-09-08_price_per_kg.sql
--   npx prisma db push          # schema is now in sync, nothing left to drop
--   npx prisma db seed          # (re)applies the CRM inventory at €/kg
--
-- Running `db push` first instead would drop `price` outright (Prisma asks
-- for --accept-data-loss) and leave every pricePerKg at 0.
--
-- Safe to re-run: every statement is idempotent.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pricePerKg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightKg"   DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Gas rows were labelled "<n> lb cylinder": derive the net kg from that
-- label. Equipment keeps weightKg = 1 (priced per unit).
UPDATE "Product"
SET "weightKg" = ROUND((substring("weight" from '^\d+'))::numeric * 0.45359237, 2)
WHERE "category" IN ('cylinders', 'blends')
  AND "weight" ~ '^\d+'
  AND "weightKg" = 1;

-- Split the old per-cylinder price into a per-kg rate (only where the old
-- column still exists and nothing has been backfilled yet).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'price'
  ) THEN
    UPDATE "Product"
    SET "pricePerKg" = ROUND(("price" / "weightKg")::numeric, 2)
    WHERE "pricePerKg" = 0 AND "weightKg" > 0;

    ALTER TABLE "Product" DROP COLUMN "price";
  END IF;
END $$;

-- Order-line snapshots of the rate/weight behind priceAtPurchase. Lines
-- placed before this change keep 0 / 1 — the UI hides the breakdown then
-- and still shows the (unchanged) per-cylinder figure.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "pricePerKgAtPurchase" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "weightKgAtPurchase"   DOUBLE PRECISION NOT NULL DEFAULT 1;
