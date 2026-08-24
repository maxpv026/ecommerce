"use server";

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";

const QueryInput = z.object({
  sku: z.string().min(1).max(64),
  system: z.string().trim().min(3).max(200),
});

const VerdictSchema = z.object({
  verdict: z.enum(["compatible", "incompatible", "unknown"]),
  summary: z
    .string()
    .describe("One or two sentences: why it fits or not — oil type, pressure class, charge estimate, cylinder count."),
  checks: z
    .array(z.string().max(28))
    .max(4)
    .describe('Up to 4 short confirmation chips, e.g. "POE oil ✓", "A2L rated ✓".'),
});

export type CompatibilityResult =
  | { ok: true; verdict: "compatible" | "incompatible" | "unknown"; summary: string; checks: string[] }
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Real AI compatibility check for the PDP widget: judges whether this
 * product suits the customer's stated HVAC system. Failures degrade to
 * UNAVAILABLE — never an invented verdict.
 */
export async function checkCompatibility(rawInput: { sku: string; system: string }): Promise<CompatibilityResult> {
  const parsed = QueryInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    const product = await prisma.product.findUnique({ where: { sku: parsed.data.sku } });
    if (!product) return { ok: false, code: "INVALID_INPUT" };

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: VerdictSchema,
      prompt: `You are an HVAC refrigerant compatibility checker for a B2B store.

Product: ${product.name} (${product.sku}) · category ${product.category} · ${product.weight} · safety class ${product.gwpClass}${product.gwp ? ` · GWP ${product.gwp}` : ""}${product.purity ? ` · purity ${product.purity}%` : ""}.

Customer's system: "${parsed.data.system}"

Judge whether this product is appropriate for that system. Consider the refrigerant the system was designed for, oil compatibility (POE/mineral), A2L handling, and rough charge size. If the model is unknown to you or the input is not an HVAC system, answer "unknown" and say what information you'd need. Keep the summary to at most two sentences and provide up to 4 short confirmation chips.`,
    });

    return { ok: true, verdict: object.verdict, summary: object.summary, checks: object.checks };
  } catch (error) {
    console.error("checkCompatibility failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
