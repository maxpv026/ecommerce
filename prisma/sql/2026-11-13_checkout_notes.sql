-- Checkout redesign: the buyer's delivery / PO note, and the "payment sent"
-- report from /checkout/success. Additive, nullable; safe to re-run.
--
--   npx prisma db execute --file prisma/sql/2026-11-13_checkout_notes.sql
--   npx prisma generate
--
-- Reversal, if ever needed:
--   ALTER TABLE "Order" DROP COLUMN IF EXISTS "customerNote",
--     DROP COLUMN IF EXISTS "paymentReportedAt", DROP COLUMN IF EXISTS "paymentReportedRef";

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerNote" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentReportedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentReportedRef" TEXT;
