-- Support chat persistence + human handoff.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-10-25_add_chat_sessions.sql`,
-- then `npx prisma generate` and a restart of `next dev`.
-- `prisma migrate diff` also proposes DROP INDEX "KnowledgeChunk_embedding_hnsw_idx" —
-- that pgvector index is maintained by hand and is deliberately left out. Safe to re-run.

DO $$ BEGIN
  CREATE TYPE "ChatSessionStatus" AS ENUM ('AI_ACTIVE', 'ESCALATED_TO_HUMAN', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant', 'human_agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" "ChatSessionStatus" NOT NULL DEFAULT 'AI_ACTIVE',
    "escalationReason" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "startedOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatSession_status_updatedAt_idx" ON "ChatSession"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "ChatSession_userId_idx" ON "ChatSession"("userId");
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
