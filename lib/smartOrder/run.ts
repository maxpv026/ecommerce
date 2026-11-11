import "server-only";

import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";
import { resolveAgainstCatalog } from "@/lib/magicOrderResolve";
import { MAX_TEXT_CHARS, extractLines, groundLines, sanitiseOrderText } from "@/lib/smartOrder/extract";
import { productLine, solveRefrigerantLine, unsolvedLine, type SolvedLine, type SolverRow } from "@/lib/smartOrder/solver";

/**
 * The whole Smart Bulk Order pipeline over text that is already plain:
 * sanitise → bound → extract (model) → ground → solve (deterministic).
 */

export type SmartOrderErrorCode =
  | "INVALID_INPUT"
  | "TEXT_TOO_LONG"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE"
  | "FILE_UNREADABLE"
  | "NOTHING_FOUND"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE";

export type SmartOrderResponse =
  | { ok: true; lines: SolvedLine[]; removedLines: number }
  | { ok: false; code: SmartOrderErrorCode };

const SOLVER_SELECT = {
  id: true,
  sku: true,
  name: true,
  weight: true,
  weightKg: true,
  pricePerKg: true,
  cylinderDeposit: true,
  inStock: true,
  stockQuantity: true,
  category: true,
  containerType: true,
  familyKey: true,
  gwp: true,
} as const;

export async function loadSolverCatalog(): Promise<SolverRow[]> {
  return prisma.product.findMany({ where: LISTED, select: SOLVER_SELECT });
}

/** Phase B for already-grounded requests; exported so the suite can run it without a model. */
export function solveAll(grounded: ReturnType<typeof groundLines>, catalog: SolverRow[]): SolvedLine[] {
  return grounded.map(({ request, grounded: ok }, i) => {
    const id = `l${i + 1}`;
    if (!ok) return unsolvedLine(id, request, "NEEDS_REVIEW", "UNGROUNDED");
    if (request.kind === "REFRIGERANT") return solveRefrigerantLine(id, request, catalog);

    if (!request.productQuery) return unsolvedLine(id, request, "UNRECOGNIZED");
    const quantity = request.cylinderCount ?? 1;
    const outcome = resolveAgainstCatalog([{ searchQuery: request.productQuery, quantity }], catalog);
    const resolved = outcome.resolvedItems[0];
    if (resolved) return productLine(id, request, catalog.find((r) => r.id === resolved.productId) ?? null, quantity, "EXACT");
    if (outcome.ambiguousItems[0]) return unsolvedLine(id, request, "NEEDS_REVIEW", "AMBIGUOUS_PRODUCT");
    const reason = outcome.unresolvedQueries[0]?.reason;
    return unsolvedLine(id, request, reason === "NO_MATCH" ? "NOT_CARRIED" : "OUT_OF_STOCK");
  });
}

export async function runSmartOrder(rawText: string): Promise<SmartOrderResponse> {
  const { text, removedLines } = sanitiseOrderText(rawText);
  if (text.length > MAX_TEXT_CHARS) return { ok: false, code: "TEXT_TOO_LONG" };
  if (text.length < 3) return { ok: false, code: removedLines > 0 ? "NOTHING_FOUND" : "INVALID_INPUT" };

  // No key, no parsing — reported, never replaced by a keyword guess.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("[SMART-ORDER] OPENAI_API_KEY is not set.");
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  let extracted;
  try {
    extracted = await extractLines(text);
  } catch (error) {
    console.error("[SMART-ORDER] extraction failed:", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
  if (!extracted?.lines?.length) return { ok: false, code: "NOTHING_FOUND" };

  const catalog = await loadSolverCatalog();
  return { ok: true, lines: solveAll(groundLines(extracted, text), catalog), removedLines };
}
