-- ChatSession(updatedAt): lib/chatRetention purgeExpiredChats deletes on
-- `updatedAt <= cutoff` alone, which the (status, updatedAt) index can't serve.
--
-- Applied with `npx prisma db execute --file prisma/sql/2026-11-11_chat_session_updated_at_index.sql`,
-- then `npx prisma generate`. `prisma migrate diff` also proposes DROP INDEX
-- "KnowledgeChunk_embedding_hnsw_idx" — maintained by hand, deliberately left out. Safe to re-run.
CREATE INDEX IF NOT EXISTS "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");
