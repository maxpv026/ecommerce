-- pgvector: extension, KnowledgeChunk table, and the HNSW index.
--
-- ⚠ RUN THIS **AFTER** `npx prisma db push` — AND AFTER EVERY db push, FOREVER.
--
-- `prisma db push` DROPS the HNSW index. Verified, not theorised: create the
-- index, run db push, and it is gone. Prisma has no syntax for an index
-- operator class, so the index cannot be declared in schema.prisma; db push's
-- job is to make the database match the schema, so an index it does not know
-- about is drift and gets removed. It does this SILENTLY — the output is the
-- usual "Your database is now in sync with your Prisma schema", with no
-- mention of a dropped index.
--
-- What that costs you: nothing visible. Every similarity search still returns
-- the correct rows, by sequential scan over the whole table, quietly getting
-- slower with every chunk added. There is no error to notice, which is why
-- this warning is at the top of the file rather than in a commit message.
--
-- The repeatable way to restore it:
--
--     npx tsx scripts/ensure-vector-index.ts
--
-- which is just section 3 below, made idempotent and safe to run any time.
-- Put it after db push in whatever deploy step you use.
--
-- Why by hand at all: Prisma's own diff emits exactly sections 1 and 2 below
-- and stops there. Section 3 is the part that only exists if you run it.
--
-- ───────────────────────────────────────────────────────────────────────

-- ══ 1. Extension ══
-- On Supabase, `vector` is normally installed into the dedicated `extensions`
-- schema, which is already on the default search_path. If your project has it
-- elsewhere, the type below resolves through search_path either way.
CREATE EXTENSION IF NOT EXISTS "vector";


-- ══ 2. Table ══
-- Identical to what `prisma migrate diff` emits, so running this first leaves
-- `db push` with nothing to do for this model.
CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id"        TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_createdAt_idx"
    ON "KnowledgeChunk" ("createdAt");


-- ══ 3. HNSW index — the part Prisma cannot generate ══
--
-- `vector_cosine_ops` must match the operator the query uses. The retrieval
-- route orders by `<=>` (cosine distance); an index built with
-- `vector_l2_ops` (`<->`) or `vector_ip_ops` (`<#>`) would be ignored by the
-- planner and the scan would go sequential without any error to notice.
--
-- HNSW over IVFFlat on purpose: IVFFlat needs representative data present
-- before it can build meaningful lists, so building it on an empty table
-- gives poor recall forever. HNSW can be built before a single row exists,
-- which is exactly the situation here.
--
-- m = 16, ef_construction = 64 are pgvector's defaults and are right for a
-- knowledge base of hundreds to low thousands of chunks. Raise ef_construction
-- for better recall at the cost of build time.
--
-- Building the index needs memory; the default 64MB will spill to disk and
-- crawl on a larger set. Safe to run as-is on a small table.
SET maintenance_work_mem = '256MB';

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw_idx"
    ON "KnowledgeChunk"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- If this table is ever rebuilt while the site is serving traffic, use the
-- non-blocking form instead — a plain CREATE INDEX takes an ACCESS EXCLUSIVE
-- lock for the whole build:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "KnowledgeChunk_embedding_hnsw_idx"
--       ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops)
--       WITH (m = 16, ef_construction = 64);
--
-- CONCURRENTLY cannot run inside a transaction block, so it must go through
-- psql rather than `prisma db execute`.


-- ══ 4. Verify ══
--
-- (a) the index exists and is valid:
--
--   SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
--   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--   WHERE c.relname = 'KnowledgeChunk_embedding_hnsw_idx';
--
-- (b) the planner actually USES it — this is the check that matters, because
--     a wrong operator class fails silently. Expect "Index Scan using
--     KnowledgeChunk_embedding_hnsw_idx", not "Seq Scan":
--
--   SET hnsw.ef_search = 40;
--   EXPLAIN ANALYZE
--   SELECT id FROM "KnowledgeChunk"
--   WHERE embedding IS NOT NULL
--   ORDER BY embedding <=> (SELECT embedding FROM "KnowledgeChunk" LIMIT 1)
--   LIMIT 3;
--
--     Note: on a table of only a few rows the planner will legitimately
--     prefer a sequential scan because it is genuinely cheaper. Seed the
--     knowledge base first, then run this.
