-- Delivery contact number on Address, for in-checkout address entry.
--
-- Generated from the live schema with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--
-- One nullable column. Nothing is dropped or rewritten, so it is safe to run
-- against a populated database — existing addresses simply carry no phone.
--
-- Apply with EITHER of:
--   npx prisma db push                                  # this repo's normal path
--   npx prisma db execute --file prisma/sql/2026-09-09_add_address_phone.sql
--
-- `npx prisma migrate dev` is NOT the path here: this project has no
-- prisma/migrations directory (it has always been db push), so migrate would
-- see the existing tables as drift and offer to RESET the database.
--
-- Safe to re-run.

ALTER TABLE "Address"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
