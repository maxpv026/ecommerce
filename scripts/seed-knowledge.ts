/**
 * Seeds the F-Gas knowledge base.
 *
 *   npx tsx scripts/seed-knowledge.ts            # insert missing chunks
 *   npx tsx scripts/seed-knowledge.ts --reset    # wipe and re-embed everything
 *
 * Requires prisma/sql/2026-09-16_pgvector.sql to have been run first — the
 * table and the HNSW index are created there, not by `db push`.
 *
 * Idempotent by content: a fact already present is skipped rather than
 * duplicated, so re-running after adding facts costs one embedding call per
 * NEW fact instead of re-embedding the whole set.
 */
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { PrismaClient, Prisma } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const EMBEDDING_MODEL = "text-embedding-3-small";

interface Fact {
  content: string;
  metadata: { topic: string; source: string };
}

/**
 * The knowledge base.
 *
 * Each entry is written to stand alone, because retrieval returns single
 * chunks with no surrounding document: a fact that only makes sense next to
 * its neighbour will be quoted out of context. Figures are stated explicitly
 * so the model never has to supply one from memory.
 */
const FACTS: Fact[] = [
  {
    content:
      "R-404A has a GWP of 3922 and is subject to strict F-Gas quota reductions in the EU. Since 1 January 2020 it has been banned for servicing refrigeration equipment with a charge of 40 tonnes CO2-equivalent or more, except where reclaimed or recycled gas is used. The recommended drop-in replacements for existing systems are R-448A and R-449A.",
    metadata: { topic: "R-404A", source: "EU F-Gas Regulation 517/2014, Art. 13" },
  },
  {
    content:
      "R-449A has a GWP of 1397 and is a non-flammable (A1) HFO blend designed as a direct replacement for R-404A and R-507A in both medium and low temperature refrigeration. It is compatible with existing POE lubricants, so a retrofit does not usually require an oil change. It exhibits temperature glide of approximately 5 K, so it must be charged as a liquid.",
    metadata: { topic: "R-449A", source: "Retrofit guidance" },
  },
  {
    content:
      "R-448A has a GWP of 1387 and is an A1 HFO blend used to replace R-404A and R-22 in supermarket and commercial refrigeration. Like R-449A it works with POE oil and has a glide of roughly 5 K. Expect a modest capacity reduction at low evaporating temperatures compared with R-404A.",
    metadata: { topic: "R-448A", source: "Retrofit guidance" },
  },
  {
    content:
      "R-410A has a GWP of 2088 and is an A1 blend widely used in split air conditioning and heat pumps. It operates at significantly higher pressures than R-22 and is not a drop-in for it. Under the EU F-Gas quota phase-down its availability is tightening; R-32 is the common lower-GWP alternative for new equipment.",
    metadata: { topic: "R-410A", source: "EU F-Gas Regulation 517/2014" },
  },
  {
    content:
      "R-32 has a GWP of 675 and is classified A2L, meaning mildly flammable. It is used in new split air conditioning and heat pump equipment and offers higher volumetric capacity than R-410A, allowing smaller charge sizes. A2L classification imposes additional requirements on charge limits, room size and equipment design; it is not a retrofit for R-410A systems not designed for flammable refrigerant.",
    metadata: { topic: "R-32", source: "EN 378 / ISO 817 safety classification" },
  },
  {
    content:
      "R-134a has a GWP of 1430 and is an A1 single-component HFC used in medium temperature refrigeration, chillers and automotive air conditioning. In the EU it has been banned in new domestic refrigerators and freezers since 2015. R-513A (GWP 631) and R-450A (GWP 605) are the usual lower-GWP replacements for stationary equipment.",
    metadata: { topic: "R-134a", source: "EU F-Gas Regulation 517/2014, Annex III" },
  },
  {
    content:
      "R-22 is an HCFC with an ozone depletion potential of 0.055 and has been fully banned in the EU since 1 January 2015, including for servicing with reclaimed gas. Existing R-22 systems must be retrofitted or replaced. Common retrofit routes are R-407C for direct expansion systems and R-422D for simple service replacement, though both usually require an oil change to POE.",
    metadata: { topic: "R-22", source: "EU Ozone Regulation 1005/2009" },
  },
  {
    content:
      "Under EU F-Gas Regulation 517/2014, operators of stationary refrigeration, air conditioning and heat pump equipment must carry out leak checks at intervals determined by charge size in CO2-equivalent: at least every 12 months for 5 tonnes CO2e or more, every 6 months for 50 tonnes or more, and every 3 months for 500 tonnes or more. Intervals double where a correctly functioning leak detection system is installed.",
    metadata: { topic: "Leak checking", source: "EU F-Gas Regulation 517/2014, Art. 4" },
  },
  {
    content:
      "Temperature glide is the difference between the bubble point and dew point of a zeotropic blend at constant pressure. Blends with significant glide, such as R-448A, R-449A and R-407C, must always be charged into the system as a liquid. Charging as a vapour draws off the more volatile components first and permanently shifts the composition of the remaining cylinder contents.",
    metadata: { topic: "Charging practice", source: "Engineering practice" },
  },
  {
    content:
      "Any person carrying out installation, servicing, maintenance, repair or decommissioning of stationary equipment containing fluorinated greenhouse gases in the EU must hold a valid F-Gas certificate of the appropriate category. Companies must also hold a company certificate to buy fluorinated gases. Category I permits all activities on any charge size.",
    metadata: { topic: "Certification", source: "EU Regulation 2015/2067" },
  },

  // ── Automotive / mobile air conditioning ──────────────────────────────
  //
  // Everything above concerns STATIONARY equipment under Regulation
  // 517/2014. Vehicles are governed by a different instrument — the MAC
  // Directive 2006/40/EC — with its own dates and its own GWP ceiling, so
  // these entries name it explicitly. Without them the assistant correctly
  // refused every automotive question, which is safe but not useful.
  {
    content:
      "R-134a has been the standard refrigerant for automotive air conditioning since it replaced R-12 in the mid-1990s, and it is what essentially every car built before the EU MAC Directive phase-in carries. Directive 2006/40/EC caps the refrigerant used in a mobile air conditioning system at a GWP of 150; this applied to new vehicle type approvals from 1 January 2011 and to all new vehicles registered in the EU from 1 January 2017. R-134a has a GWP of 1430, so vehicles from 2017 onwards are not filled with it. Servicing an existing R-134a vehicle with R-134a remains permitted.",
    metadata: { topic: "Automotive R-134a", source: "EU MAC Directive 2006/40/EC" },
  },
  {
    content:
      "New cars sold in the EU use R-1234yf in their air conditioning, because Directive 2006/40/EC caps mobile air conditioning refrigerant at a GWP of 150 and R-1234yf is the gas the industry adopted to meet that limit. The requirement applied to new type approvals from 1 January 2011 and to all new vehicles registered from 1 January 2017, so a car built from roughly 2017 onwards — including modern BMW models such as the G20 3 Series and its 330e variant — leaves the factory with R-1234yf rather than R-134a. The refrigerant label under the bonnet states the gas and the exact charge weight for that specific vehicle and is what should be confirmed before any work.",
    metadata: { topic: "Automotive R-1234yf", source: "EU MAC Directive 2006/40/EC" },
  },
  {
    content:
      "R-32 must never be charged into a vehicle air conditioning system. It is a stationary air conditioning refrigerant: it operates at substantially higher pressures than R-134a or R-1234yf, and it is used with POE lubricants that are incompatible with the PAG oils in automotive compressors. Charging it into a car risks destroying the compressor and over-pressurising components not rated for it. It is also not lawful for mobile air conditioning — its GWP of 675 is far above the 150 limit set by Directive 2006/40/EC, and no vehicle is type-approved to run on it.",
    metadata: { topic: "R-32 in vehicles", source: "EU MAC Directive 2006/40/EC, EN 378" },
  },
  {
    content:
      "R-1234yf is an HFO whose GWP is far below the 150 ceiling that applies to mobile air conditioning: the EU F-Gas Regulation lists it as 4, and more recent atmospheric assessments put it under 1. It is classified A2L — mildly flammable — which brings handling, equipment and charge requirements that A1 R-134a does not have. Thermodynamically it is close to R-134a and it is the gas that replaced R-134a in new vehicles, but it is not a field retrofit: R-1234yf systems use different service port fittings and OEM-specified lubricant, and vehicle manufacturers do not approve simply cross-filling an R-134a car with it.",
    metadata: { topic: "R-1234yf properties", source: "EU F-Gas Regulation 517/2014, ISO 817" },
  },
];

/** Stable id from the content, so re-running never duplicates a fact. */
function factId(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

async function main() {
  const reset = process.argv.includes("--reset");

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL.");
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required to generate embeddings.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    // Fail with a useful message rather than a raw SQL error if the manual
    // migration has not been run.
    const [{ exists }] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'KnowledgeChunk'
      ) AS "exists"
    `;
    if (!exists) {
      throw new Error(
        'KnowledgeChunk does not exist. Run prisma/sql/2026-09-16_pgvector.sql first.'
      );
    }

    // `prisma db push` drops the HNSW index silently — see
    // scripts/ensure-vector-index.ts. Warn rather than throw: seeding without
    // the index works perfectly, it is just a sequential scan on every query,
    // which is exactly the kind of failure nobody notices.
    const hnsw = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relname = 'KnowledgeChunk'
        AND c.relname = 'KnowledgeChunk_embedding_hnsw_idx'
    `;
    if (hnsw.length === 0) {
      console.warn(
        "\n⚠  KnowledgeChunk_embedding_hnsw_idx is MISSING — retrieval will use a sequential scan.\n" +
          "   `prisma db push` drops it. Restore it with:\n" +
          "       npx tsx scripts/ensure-vector-index.ts\n"
      );
    }

    if (reset) {
      await prisma.$executeRaw`TRUNCATE TABLE "KnowledgeChunk"`;
      console.log("reset: table truncated");
    }

    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "KnowledgeChunk"
    `;
    const have = new Set(existing.map((r) => r.id));
    const todo = FACTS.filter((f) => !have.has(factId(f.content)));

    if (todo.length === 0) {
      console.log(`nothing to do — all ${FACTS.length} facts are already embedded`);
      return;
    }

    console.log(`embedding ${todo.length} of ${FACTS.length} facts…`);
    // One batched call rather than N: same result, a fraction of the latency.
    const { embeddings } = await embedMany({
      model: openai.textEmbeddingModel(EMBEDDING_MODEL),
      values: todo.map((f) => f.content),
    });

    for (const [i, fact] of todo.entries()) {
      const id = factId(fact.content);
      const literal = `[${embeddings[i].join(",")}]`;
      // Raw because `embedding` is Unsupported() — Prisma Client cannot write
      // it. Tagged template, so every value is a bound parameter.
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "KnowledgeChunk" ("id", "content", "embedding", "metadata", "createdAt", "updatedAt")
        VALUES (
          ${id},
          ${fact.content},
          ${literal}::vector,
          ${JSON.stringify(fact.metadata)}::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT ("id") DO UPDATE
          SET "content" = EXCLUDED."content",
              "embedding" = EXCLUDED."embedding",
              "metadata" = EXCLUDED."metadata",
              "updatedAt" = NOW()
      `);
      console.log(`  ✓ ${fact.metadata.topic}`);
    }

    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS "count" FROM "KnowledgeChunk" WHERE "embedding" IS NOT NULL
    `;
    console.log(`\nknowledge base: ${Number(count)} embedded chunks`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
