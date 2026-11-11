"use server";

import { z } from "zod";
import { generateText, Output } from "ai";
import { aiTimeout } from "@/lib/aiTimeout";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { PUBLIC_AI_RULE, withinActionLimit } from "@/lib/actionRateLimit";
import { LISTED } from "@/lib/productFamily";

const QueryInput = z.string().trim().min(3).max(300);

const MatchSchema = z.object({
  skus: z
    .array(z.string())
    .describe("SKUs from the provided catalog only, best fit first. Empty if nothing fits."),
  reason: z
    .string()
    .describe("One short sentence explaining the match criteria used (load, GWP, safety class...)."),
});

export type SmartMatchResult =
  | { ok: true; skus: string[]; reason: string }
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Real AI product matching for the /products Smart Match widget: ranks the
 * live Prisma catalog against a free-text requirement. No key or an
 * upstream failure degrades to an UNAVAILABLE result the UI surfaces —
 * never a fabricated ranking.
 */
export async function smartMatch(rawQuery: string): Promise<SmartMatchResult> {
  const parsed = QueryInput.safeParse(rawQuery);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  // Callable without signing in, and each call is a paid model request.
  if (!(await withinActionLimit("smartMatch", PUBLIC_AI_RULE))) return { ok: false, code: "UNAVAILABLE" };

  try {
    const catalog = await prisma.product.findMany({ where: LISTED });
    const catalogList = catalog
      .map(
        (p) =>
          `- ${p.sku}: ${p.name} · category ${p.category} · ${p.weight} · safety ${p.gwpClass}` +
          (p.gwp ? ` · GWP ${p.gwp}` : "") +
          (p.purity ? ` · purity ${p.purity}%` : "") +
          ` · €${p.pricePerKg}/kg (${p.weightKg} kg cylinder) · stock ${p.stock}`
      )
      .join("\n");

    const { output: object } = await generateText({
      model: openai("gpt-4o-mini"),
      output: Output.object({ schema: MatchSchema }),
      abortSignal: aiTimeout(),
      prompt: `You match HVAC refrigerant products to a B2B customer's stated requirement.

Requirement: "${parsed.data}"

Catalog:
${catalogList}

Return the SKUs of up to 5 catalog products that genuinely fit the requirement, best first (consider cooling load, refrigerant compatibility, GWP/A2L constraints, and quantity hints). Only use SKUs from the catalog. Also return one short sentence explaining the criteria you matched on.`,
    });

    const validSkus = object.skus.filter((sku) => catalog.some((p) => p.sku === sku)).slice(0, 5);
    return { ok: true, skus: validSkus, reason: object.reason };
  } catch (error) {
    console.error("smartMatch failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
