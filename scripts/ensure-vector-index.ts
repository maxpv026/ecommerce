/**
 * Ensures the HNSW index on KnowledgeChunk.embedding exists.
 *
 *   npx tsx scripts/ensure-vector-index.ts
 *
 * RUN THIS AFTER EVERY `prisma db push`.
 *
 * `db push` drops this index every time. The index uses an operator class
 * (`vector_cosine_ops`), which Prisma has no syntax for, so it cannot live in
 * schema.prisma; db push therefore sees an index it does not recognise, treats
 * it as drift, and removes it — without saying so. Nothing breaks visibly:
 * retrieval still returns the right chunks, by sequential scan, getting slower
 * as the knowledge base grows.
 *
 * Idempotent and cheap — safe to run on every deploy whether or not the index
 * is missing.
 */
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const INDEX = "KnowledgeChunk_embedding_hnsw_idx";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const [table] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'KnowledgeChunk'
      ) AS "exists"
    `;
    if (!table.exists) {
      throw new Error(
        "KnowledgeChunk does not exist. Run prisma/sql/2026-09-16_pgvector.sql (or `prisma db push`) first."
      );
    }

    const before = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relname = 'KnowledgeChunk' AND c.relname = ${INDEX}
    `;

    if (before.length > 0) {
      console.log(`✓ ${INDEX} already present — nothing to do`);
      return;
    }

    console.log(`${INDEX} is missing (db push drops it) — rebuilding…`);

    // The default 64MB spills to disk and crawls on a larger set.
    await prisma.$executeRawUnsafe(`SET maintenance_work_mem = '256MB'`);

    // Must match the operator the retrieval query uses: lib/rag.ts orders by
    // `<=>` (cosine). An index built with vector_l2_ops or vector_ip_ops is
    // simply ignored by the planner, with no error.
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "${INDEX}"
        ON "KnowledgeChunk"
        USING hnsw ("embedding" vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);

    const [{ def }] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_indexdef(i.indexrelid) AS "def"
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = ${INDEX}
    `;
    console.log(`✓ rebuilt: ${def}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
