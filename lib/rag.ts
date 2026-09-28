import "server-only";

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { Prisma } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";

/**
 * Vector retrieval over the F-Gas knowledge base.
 *
 * Separate from the route so the retrieval half can be exercised against a
 * real database without opening a chat stream — the same split that made the
 * Magic Order matcher testable.
 */

/** 1536 dimensions. Must match the column type and the seeding script. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** How many chunks reach the prompt. */
export const RETRIEVAL_LIMIT = 3;

/**
 * Cosine distance above which a chunk is treated as irrelevant.
 *
 * `<=>` returns 0 for identical and 2 for opposite, so ~1.0 is "unrelated".
 * Without a floor, an off-topic question ("what's the weather") still returns
 * the three least-bad chunks, and a model told to "answer only from context"
 * will dutifully use them. The cutoff is what makes "I don't have that data"
 * reachable at all.
 */
export const MAX_DISTANCE = 0.75;

export interface RetrievedChunk {
  id: string;
  content: string;
  metadata: unknown;
  /** Cosine distance: lower is closer. */
  distance: number;
}

/** pgvector's text input format: "[0.1,0.2,…]". */
function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

/**
 * Top-k chunks for a query embedding.
 *
 * This is the codebase's ONLY raw SQL, and it is unavoidable: the `embedding`
 * column is `Unsupported("vector(1536)")`, which Prisma Client cannot read,
 * write or order by. There is no typed API for `<=>`.
 *
 * Note what is and is not interpolated. `$queryRaw` is a TAGGED TEMPLATE, so
 * every `${}` below is sent as a bound parameter, never spliced into the SQL
 * string — `Prisma.sql` with `$queryRawUnsafe` or string concatenation here
 * would be a genuine injection hole, since the vector is derived from user
 * text. The `::vector` cast is applied to the *parameter*, not to a literal.
 */
export async function retrieveChunks(
  embedding: number[],
  limit = RETRIEVAL_LIMIT,
  maxDistance = MAX_DISTANCE
): Promise<RetrievedChunk[]> {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `retrieveChunks: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`
    );
  }

  const literal = toVectorLiteral(embedding);
  const take = Math.min(Math.max(1, Math.trunc(limit)), 20);

  const rows = await prisma.$queryRaw<
    Array<{ id: string; content: string; metadata: unknown; distance: number }>
  >(Prisma.sql`
    SELECT
      "id",
      "content",
      "metadata",
      ("embedding" <=> ${literal}::vector) AS "distance"
    FROM "KnowledgeChunk"
    WHERE "embedding" IS NOT NULL
      AND ("embedding" <=> ${literal}::vector) < ${maxDistance}
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${take}
  `);

  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}

/** Convenience: embed and retrieve in one call. */
export async function retrieveForQuestion(question: string): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(question);
  return retrieveChunks(embedding);
}

/**
 * Renders chunks for the prompt, numbered so the model can cite them.
 *
 * Returns null when nothing cleared the distance floor — the caller uses that
 * to tell the model there is no context at all, which is a different
 * instruction from "here is some context".
 */
export function formatContext(chunks: RetrievedChunk[]): string | null {
  if (chunks.length === 0) return null;
  return chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join("\n\n");
}
