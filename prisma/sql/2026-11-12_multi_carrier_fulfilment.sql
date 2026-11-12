-- Multi-carrier fulfilment: carrier, dispatch details, granular stage and
-- checkpoint log on Order (lib/shipping).
--
-- Purely additive: nine nullable columns, nothing dropped or rewritten.
-- Existing orders keep working unchanged — a null shippingCarrier reads as
-- DHL and a null shipmentStage is derived from `status`.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/2026-11-12_multi_carrier_fulfilment.sql
-- then `npx prisma generate` and a restart of `next dev`.
-- (No `db push` / `migrate dev` on this database: see the note in
-- 2026-09-09_add_stripe_payments.sql.)
--
-- Safe to re-run: every statement is guarded. Safe to apply before the code
-- that reads it is deployed: the previous build ignores unknown columns.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "driverName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "driverPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "vehiclePlate" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipmentStage" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipmentEvents" JSONB;
