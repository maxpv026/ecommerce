"use server";

import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import prisma from "@/lib/prisma";
import {
  resolveAgainstCatalog,
  type AmbiguousItem,
  type ResolvedItem,
  type UnresolvedItem,
} from "@/lib/magicOrderResolve";

/**
 * "Magic Order" — turns a messy technician's message into a cart.
 *
 * ── THE SAFETY MODEL ──
 * The model is never allowed to name a product. It does one job: pull
 * quantities and refrigerant strings out of prose. Every product identity,
 * every price and every pack size comes from the database afterwards.
 *
 * That split matters because the failure it prevents is not the obvious one.
 * A model asked to pick SKUs will invent plausible ones. But the subtler
 * failure is OUR resolution guessing: `where: { name: { contains: "R-134a" } }`
 * matches four different products in this catalogue — R-134a (10 kg),
 * R-134a Bulk (50 lb), R-134a Compact (25 lb) and R-134a Standard (30 lb).
 * Taking the first row would put a silently wrong pack size in a B2B cart at
 * a different price. So an ambiguous query is never resolved by guessing; it
 * is handed back for a human to choose.
 */

const MAX_INPUT = 2_000;
/** A pasted message asking for more than this is a spreadsheet, not a note. */
const MAX_ITEMS = 25;
/** Sane order bounds; the model occasionally reads a year as a quantity. */
const MAX_QTY = 999;

const RawInput = z.string().trim().min(3).max(MAX_INPUT);

/** Exactly the shape requested: what to look for, and how many. */
const ParseSchema = z.object({
  items: z.array(
    z.object({
      searchQuery: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
});

const SYSTEM_PROMPT = [
  "You are a refrigeration wholesale expert reading a message from an HVAC technician or buyer.",
  "Extract every orderable item they are asking for, with the quantity requested. That means refrigerants AND equipment — manifolds, gauges, recovery cylinders and similar are orderable products, not context.",
  "Normalise each searchQuery to the standard refrigerant designation: '134a' or 'R134' becomes 'R-134a', '404' becomes 'R-404A', 'four-ten-a' becomes 'R-410A'.",
  "Quantities may be written as words ('two', 'a couple') or digits; return them as integers. If no quantity is stated for an item, use 1.",
  "Do NOT invent product names, brands, pack sizes or SKUs — return only the refrigerant designation the message actually refers to.",
  "If the message names nothing orderable, return an empty items array.",
].join(" ");

/**
 * Types are erased at build time, so a "use server" module may export them —
 * only its runtime exports have to be async functions.
 */
export type MagicOrderResult =
  | {
      ok: true;
      resolvedItems: ResolvedItem[];
      ambiguousItems: AmbiguousItem[];
      unresolvedQueries: UnresolvedItem[];
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_CONFIGURED" | "UNAVAILABLE" | "NOTHING_FOUND" };

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function parseMagicOrder(rawText: string): Promise<MagicOrderResult> {
  const parsed = RawInput.safeParse(rawText);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  // No key, no parsing. Per the standing rule, this reports the gap rather
  // than falling back to a keyword guess dressed up as an AI result.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("[MAGIC-ORDER] OPENAI_API_KEY is not set.");
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  let items: Array<{ searchQuery: string; quantity: number }>;
  try {
    const { object } = await generateObject({
      model: openai(process.env.MAGIC_ORDER_MODEL?.trim() || "gpt-4o-mini"),
      schema: ParseSchema,
      system: SYSTEM_PROMPT,
      prompt: parsed.data,
    });
    items = object.items;
  } catch (error) {
    console.error("[MAGIC-ORDER] parse failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }

  // Bound and clean whatever came back before it touches the database.
  const cleaned = items
    .map((i) => ({
      searchQuery: String(i.searchQuery ?? "").trim().slice(0, 64),
      quantity: Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(i.quantity) || 1))),
    }))
    .filter((i) => i.searchQuery.length > 0)
    .slice(0, MAX_ITEMS);

  if (cleaned.length === 0) return { ok: false, code: "NOTHING_FOUND" };

  // One read for the whole catalogue, then all matching in memory. The
  // alternative — a `contains` query per extracted item — is N round trips
  // AND pushes the fuzzy matching into SQL, where resolveAgainstCatalog's
  // ambiguity guard could not see how many rows a query really matched.
  const catalog = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      weight: true,
      pricePerKg: true,
      weightKg: true,
      cylinderDeposit: true,
      inStock: true,
      stockQuantity: true,
    },
  });

  const outcome = resolveAgainstCatalog(cleaned, catalog);

  return { ok: true, ...outcome };
}
