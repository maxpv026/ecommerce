-- Stripe checkout: settlement state on Order, a reusable Customer on User.
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- Purely additive: one new enum, five nullable/defaulted columns, two unique
-- indexes. Nothing is dropped or rewritten, so it is safe to run against a
-- populated database — existing orders land on paymentStatus 'PENDING', which
-- is exactly what an order placed before payments existed was.
--
-- Apply with EITHER of:
--   npx prisma db push                                    # this repo's normal path
--   npx prisma db execute --file prisma/sql/2026-09-09_add_stripe_payments.sql
--
-- `npx prisma migrate dev` is NOT the path here: this project has no
-- prisma/migrations directory (it has always been db push), so migrate would
-- see the existing tables as drift and offer to RESET the database.
--
-- Safe to re-run: every statement is guarded.

DO $$
BEGIN
  -- Settlement state, tracked separately from fulfilment (OrderStatus).
  -- A SEPA bank transfer settles days after checkout, so an order can sit
  -- at PENDING here long after the Checkout Session was completed.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
  END IF;
END $$;

ALTER TABLE "Order"
  -- The Checkout Session that owns this order. Unique so the webhook can look
  -- the order up by session id, and so a replayed event can never settle a
  -- second order.
  ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT,
  -- "card" | "sepa" — kept for support and reporting.
  ADD COLUMN IF NOT EXISTS "paymentMethod"   TEXT,
  ADD COLUMN IF NOT EXISTS "paymentStatus"   "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "paidAt"          TIMESTAMP(3);

-- The buyer's Stripe Customer, reused on every checkout: a SEPA bank transfer
-- credits a customer balance, so it has to land on the same record each time.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
