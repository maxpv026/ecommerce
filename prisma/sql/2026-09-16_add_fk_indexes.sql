-- Foreign-key and hot-path indexes.
--
-- Postgres creates an index for a PRIMARY KEY but NOT for a FOREIGN KEY, so
-- every one of these columns was being sequentially scanned. Nine of the ten
-- foreign keys in the schema had no index at all, including the four on the
-- home and profile critical path (Order.userId, OrderItem.orderId,
-- Address.userId, Certificate.userId).
--
-- Generated with:
--   npx prisma migrate diff --from-schema <pre-change schema> \
--     --to-schema prisma/schema.prisma --script
--
-- (The usual --from-config-datasource form needs to reach the live database;
-- it was generated from the pre-change schema file instead, which produces
-- the identical statements as long as the live database matches the schema
-- it was last pushed from.)
--
-- ───────────────────────────────────────────────────────────────────────
-- WHICH VERSION TO RUN
--
-- Section A is what Prisma emits. Plain CREATE INDEX takes an ACCESS
-- EXCLUSIVE lock for the duration of the build, which blocks reads AND
-- writes on that table. On small tables that is milliseconds; on a grown
-- Order/OrderItem table it is a checkout outage.
--
-- Section B is the same set written CONCURRENTLY, which builds without
-- blocking writers. Prefer B on a live shop. Its constraints:
--   * cannot run inside a transaction block, so run it with psql, NOT with
--     `prisma db execute` (which wraps the file in one)
--   * on failure it leaves an INVALID index behind; drop and retry
--   * takes roughly twice as long
--
-- Run ONE of the two sections, then `npx prisma db push` to record that the
-- schema and database agree (it will report nothing left to change).
-- ───────────────────────────────────────────────────────────────────────


-- ══ SECTION A — exactly what `prisma migrate diff` produced ══
-- Use on an empty/small database, or during a maintenance window.
--   npx prisma db execute --file prisma/sql/2026-09-16_add_fk_indexes.sql

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "StockSubscription_userId_idx" ON "StockSubscription"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_addressId_idx" ON "Order"("addressId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Certificate_userId_issuedAt_idx" ON "Certificate"("userId", "issuedAt" DESC);


-- ══ SECTION B — non-blocking equivalent, for a live database ══
-- Index names are identical, so Prisma sees the same schema either way.
-- Run with psql (not prisma db execute — CONCURRENTLY cannot be in a
-- transaction), e.g.:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/2026-09-16_add_fk_indexes.sql
-- after commenting out Section A.
--
-- IF NOT EXISTS makes it safe to re-run after a partial failure.
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "StockSubscription_userId_idx" ON "StockSubscription"("userId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_userId_status_idx" ON "Order"("userId", "status");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_addressId_idx" ON "Order"("addressId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "Certificate_userId_issuedAt_idx" ON "Certificate"("userId", "issuedAt" DESC);


-- ══ VERIFY ══
-- After running, confirm all ten exist and none is invalid:
--
--   SELECT i.indexrelid::regclass AS index, i.indisvalid
--   FROM pg_index i
--   WHERE i.indexrelid::regclass::text IN (
--     'Account_userId_idx','Session_userId_idx','StockSubscription_userId_idx',
--     'Address_userId_isDefault_idx','Order_userId_createdAt_idx',
--     'Order_userId_status_idx','Order_addressId_idx','OrderItem_orderId_idx',
--     'OrderItem_productId_idx','Certificate_userId_issuedAt_idx');
--
-- Any row with indisvalid = false is a failed CONCURRENTLY build: DROP it and
-- re-run that one statement.
