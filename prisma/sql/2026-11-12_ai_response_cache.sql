-- Content-hash cache of AI responses (lib/ai/cache). Purely additive.
--
-- Apply with:
--   npx prisma db execute --file prisma/sql/2026-11-12_ai_response_cache.sql
-- then `npx prisma generate`. Safe to re-run; safe before deploy (nothing
-- reads it until the code that writes it ships).

CREATE TABLE IF NOT EXISTS "AiResponseCache" (
    "key" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiResponseCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "AiResponseCache_expiresAt_idx" ON "AiResponseCache"("expiresAt");
