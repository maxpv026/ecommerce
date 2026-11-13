"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { GAS_MARKS } from "@/lib/gasMarks";
import { PUBLIC_AI_RULE, withinActionLimit } from "@/lib/actionRateLimit";
import { normaliseInput, withAiCache } from "@/lib/ai/cache";
import { logAiUsage, model, usageOf } from "@/lib/ai/budget";
import type { SystemKind } from "@/lib/systemCompat";
import { tallyFor, type VoteChoice, type VoteTally, VOTES } from "@/lib/hubVotes";

/**
 * The market hub's writes: target price alerts, the per-story sentiment poll,
 * bookmarks — all for a signed-in buyer — and the comparator's one model call,
 * which only classifies a system description the local rules didn't know.
 */

type Fail = { ok: false; code: "UNAUTHENTICATED" | "INVALID_INPUT" | "RATE_LIMITED" | "UNAVAILABLE" };

async function userId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// ── Target price alerts ──

const AlertInput = z.object({ mark: z.enum(GAS_MARKS), targetPerKg: z.number().positive().max(10_000) });

export async function savePriceAlert(input: { mark: string; targetPerKg: number }): Promise<{ ok: true; mark: string; targetPerKg: number } | Fail> {
  const id = await userId();
  if (!id) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = AlertInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const targetPerKg = Math.round(parsed.data.targetPerKg * 100) / 100;
  // A new target re-arms the alert.
  await prisma.priceAlert.upsert({
    where: { userId_mark: { userId: id, mark: parsed.data.mark } },
    create: { userId: id, mark: parsed.data.mark, targetPerKg },
    update: { targetPerKg, triggeredAt: null },
  });
  return { ok: true, mark: parsed.data.mark, targetPerKg };
}

export async function deletePriceAlert(mark: string): Promise<{ ok: true } | Fail> {
  const id = await userId();
  if (!id) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = z.enum(GAS_MARKS).safeParse(mark);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  await prisma.priceAlert.deleteMany({ where: { userId: id, mark: parsed.data } });
  return { ok: true };
}

// ── Sentiment poll ──

const InsightId = z.string().trim().min(1).max(200);

export async function voteInsight(insightId: string, choice: VoteChoice): Promise<{ ok: true; tally: VoteTally; choice: VoteChoice } | Fail> {
  const id = await userId();
  if (!id) return { ok: false, code: "UNAUTHENTICATED" };
  const parsedId = InsightId.safeParse(insightId);
  const parsedChoice = z.enum(VOTES).safeParse(choice);
  if (!parsedId.success || !parsedChoice.success) return { ok: false, code: "INVALID_INPUT" };
  await prisma.insightVote.upsert({
    where: { insightId_userId: { insightId: parsedId.data, userId: id } },
    create: { insightId: parsedId.data, userId: id, choice: parsedChoice.data },
    update: { choice: parsedChoice.data },
  });
  const tally = (await tallyFor([parsedId.data]))[parsedId.data] ?? { UP: 0, DOWN: 0, FLAT: 0 };
  return { ok: true, tally, choice: parsedChoice.data };
}

// ── Bookmarks ──

const BookmarkInput = z.object({
  insightId: InsightId,
  title: z.string().trim().min(1).max(400),
  link: z.string().trim().url().max(1000).optional(),
  source: z.string().trim().max(120).optional(),
});

export async function toggleBookmark(input: { insightId: string; title: string; link?: string; source?: string }): Promise<{ ok: true; saved: boolean } | Fail> {
  const id = await userId();
  if (!id) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = BookmarkInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const removed = await prisma.insightBookmark.deleteMany({ where: { userId: id, insightId: parsed.data.insightId } });
  if (removed.count > 0) return { ok: true, saved: false };
  await prisma.insightBookmark.create({ data: { userId: id, ...parsed.data } });
  return { ok: true, saved: true };
}

// ── System classification (model fallback) ──

const KINDS = ["car", "split", "heatpump", "chiller", "coldroom", "unknown"] as const;
const ClassSchema = z.object({
  kind: z.enum(KINDS),
  /** The factory refrigerant, only if the model is sure ("R-1234yf"); null otherwise. */
  refrigerant: z.string().max(16).nullable(),
  year: z.number().int().min(1980).max(2035).nullable(),
});
export type SystemClassification = { kind: SystemKind; refrigerant: string | null; year: number | null };

const SYSTEM = `You classify a refrigeration or air-conditioning system from a short description (any language).
Return:
- kind: "car" (any road vehicle A/C), "split" (room air conditioner / split / VRF), "heatpump" (air-to-water, monobloc), "chiller", "coldroom" (commercial refrigeration, cold room, display case, freezer), or "unknown" if it is not a refrigeration system.
- refrigerant: the factory refrigerant designation (like "R-1234yf", "R-134a", "R-32", "R-410A", "R-404A", "R-290", "R-407C") ONLY if the model is well known to use it; otherwise null. Never guess.
- year: the model year if the text states it or the model designation pins it; otherwise null.`;

const ClassifyInput = z.string().trim().min(2).max(160);

/**
 * Only reached when lib/systemCompat's rules returned null. The model
 * classifies; the verdicts are still the rules. Cached 30 days by text.
 */
export async function classifySystem(text: string): Promise<{ ok: true; value: SystemClassification | null } | Fail> {
  const parsed = ClassifyInput.safeParse(text);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  if (!(await withinActionLimit("hub-classify", PUBLIC_AI_RULE))) return { ok: false, code: "RATE_LIMITED" };
  if (!process.env.OPENAI_API_KEY?.trim()) return { ok: false, code: "UNAVAILABLE" };
  const llm = model(process.env.HUB_CLASSIFY_MODEL);
  try {
    const { value } = await withAiCache<z.infer<typeof ClassSchema>>(
      { feature: "hub-classify", version: 1, parts: [llm, normaliseInput(parsed.data).toLowerCase()], ttlSeconds: 30 * 86_400 },
      async () => {
        const result = await generateText({
          model: openai(llm),
          system: SYSTEM,
          prompt: parsed.data,
          output: Output.object({ schema: ClassSchema }),
          temperature: 0,
          maxOutputTokens: 80,
          abortSignal: AbortSignal.timeout(15_000),
          maxRetries: 1,
        });
        logAiUsage({ feature: "hub-classify", model: llm, source: "model", ...usageOf(result) });
        return { value: result.output, cacheable: true };
      }
    );
    return { ok: true, value: value.kind === "unknown" ? null : { kind: value.kind, refrigerant: value.refrigerant, year: value.year } };
  } catch (error) {
    console.error("[hub-classify] failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
