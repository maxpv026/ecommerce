"use server";

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import { answerLanguage } from "@/lib/answerLanguage";

/**
 * gpt-4o, not the mini tier. Asked about a "Daikin FTXM50R wall split",
 * mini answered — in the wrong language — that the gas is unsuitable for
 * car air-conditioning. It cannot hold this much domain nuance at once.
 */
const COMPAT_MODEL = process.env.COMPAT_MODEL?.trim() || "gpt-4o";

/**
 * Strips control characters from model output before it reaches the DOM.
 *
 * Not hypothetical: every chip came back with a trailing U+007F (DEL) — the
 * model reaching for the "✓" the schema's example shows and emitting a
 * control byte instead. Invisible in a terminal, a tofu box in some fonts.
 */
function clean(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/\s+/g, " ").trim();
}

const QueryInput = z.object({
  sku: z.string().min(1).max(64),
  system: z.string().trim().min(3).max(200),
  /** UI locale, used only as a tiebreak when the question is too short to
   *  identify a language. What the customer actually typed wins. */
  locale: z.string().trim().max(8).optional(),
});

const VerdictSchema = z.object({
  verdict: z.enum(["compatible", "incompatible", "unknown"]),
  summary: z
    .string()
    .describe("One or two sentences: why it fits or not — oil type, pressure class, charge estimate, cylinder count."),
  checks: z
    .array(z.string().max(28))
    .max(4)
    .describe(
      'Up to 4 short chips in the customer\'s language. Plain words only, no ticks, emoji or symbols. For "compatible" they confirm ("POE oil", "A2L rated"); for "incompatible" they name the blockers ("Cars use R-1234yf", "Pressure far too high").'
    ),
});

export type CompatibilityResult =
  | { ok: true; verdict: "compatible" | "incompatible" | "unknown"; summary: string; checks: string[] }
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Real AI compatibility check for the PDP widget: judges whether this
 * product suits the customer's stated HVAC system. Failures degrade to
 * UNAVAILABLE — never an invented verdict.
 */
export async function checkCompatibility(rawInput: {
  sku: string;
  system: string;
  /** UI locale; the language the customer typed in still wins. */
  locale?: string;
}): Promise<CompatibilityResult> {
  const parsed = QueryInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    const product = await prisma.product.findUnique({ where: { sku: parsed.data.sku } });
    if (!product) return { ok: false, code: "INVALID_INPUT" };

    const language = answerLanguage(parsed.data.system, parsed.data.locale);

    const { object } = await generateObject({
      model: openai(COMPAT_MODEL),
      schema: VerdictSchema,
      prompt: `Write your entire response in ${language}. Every word of the summary and every chip must be in ${language}, whatever language these instructions or the product data happen to be in.

You are a refrigerant applications expert covering both stationary HVAC/R and automotive mobile air-conditioning (MAC).

PRODUCT: ${product.name} (${product.sku}) · category ${product.category} · ${product.weight} · safety class ${product.gwpClass}${product.gwp ? ` · GWP ${product.gwp}` : ""}${product.purity ? ` · purity ${product.purity}%` : ""}.

CUSTOMER'S QUESTION: "${parsed.data.system}"

DOMAIN RULES:

This product is a stationary refrigerant. Fixed residential, commercial and industrial refrigeration, air-conditioning and heat pumps are its NORMAL, EXPECTED use — judge those on their merits in the usual way (designed refrigerant, oil, pressure class, capacity, A2L handling).

One exception, and it only applies when the customer's question actually names a vehicle — a car, van, lorry, bus, tractor, boat, or a vehicle cab. Vehicle air-conditioning uses R-134a (broadly pre-2017) or R-1234yf (broadly 2017 onward, mandatory on new EU type approvals under Directive 2006/40/EC); a 2020 passenger car is R-1234yf. Charging a stationary refrigerant into one is "incompatible" and you say so with certainty: the system is built for R-1234yf/R-134a pressures, this refrigerant runs far higher and would endanger the compressor, hoses and seals; the service fittings are deliberately different sizes; and it is a flammable in a system with no provision for it. If no vehicle is mentioned, this paragraph does not apply at all — do not raise vehicles.

WHEN TO ANSWER "unknown": only when the application is a plausible one and you are missing a specific fact — an unfamiliar unit model, an unstated capacity. Never use "unknown" to avoid committing. A fundamentally wrong application is "incompatible", not "unknown": do not ask about oil type (POE/PAG/mineral), compressor model or charge size when the application itself is wrong.

Keep the summary to at most three sentences, and lead with the verdict rather than building up to it. Remember: the response must be written in ${language}.`,
    });

    return {
      ok: true,
      verdict: object.verdict,
      summary: clean(object.summary),
      checks: object.checks.map(clean).filter((chip) => chip.length > 0),
    };
  } catch (error) {
    console.error("checkCompatibility failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}
