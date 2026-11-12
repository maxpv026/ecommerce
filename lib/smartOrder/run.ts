import "server-only";

import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";
import { resolveAgainstCatalog } from "@/lib/magicOrderResolve";
import { MAX_TEXT_CHARS, extractLines, groundLines, sanitiseOrderText, type ExtractionRaw } from "@/lib/smartOrder/extract";
import { parseOrderLocally } from "@/lib/smartOrder/fastPath";
import { logAiUsage } from "@/lib/ai/budget";
import { productLine, solveRefrigerantLine, unsolvedLine, type SolvedLine, type SolverRow } from "@/lib/smartOrder/solver";

/**
 * The whole Smart Bulk Order pipeline over text that is already plain:
 * sanitise → bound → read locally (fastPath) → extract only the rest
 * (model, cached) → ground → solve (deterministic).
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

  // Zero tokens first: every segment the local reader can account for
  // (lib/smartOrder/fastPath). Only what it can't read goes to the model.
  const local = parseOrderLocally(text);
  const lines: Array<{ segment: number; line: ExtractionRaw["lines"][number] }> = [...local.parsed];

  if (local.unparsed.length > 0) {
    // No key: the unreadable part is reported, never replaced by a keyword guess.
    if (!process.env.OPENAI_API_KEY?.trim()) {
      console.error("[SMART-ORDER] OPENAI_API_KEY is not set.");
      return { ok: false, code: "NOT_CONFIGURED" };
    }
    let extracted: ExtractionRaw;
    try {
      extracted = await extractLines(local.unparsed.map((u) => u.text).join("\n"), local.unparsed.length);
    } catch (error) {
      console.error("[SMART-ORDER] extraction failed:", error);
      return { ok: false, code: "UNAVAILABLE" };
    }
    // Keep the buyer's order: each model line goes back to the segment its words came from.
    const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    for (const line of extracted?.lines ?? []) {
      const raw = fold(line.rawText);
      const home = local.unparsed.find((u) => raw && (fold(u.text).includes(raw) || raw.includes(fold(u.text))));
      lines.push({ segment: home?.segment ?? local.unparsed[0].segment, line });
    }
  } else {
    logAiUsage({ feature: "smart-order", source: "fast-path" });
  }
  if (lines.length === 0) return { ok: false, code: "NOTHING_FOUND" };

  const ordered: ExtractionRaw = { lines: lines.sort((a, b) => a.segment - b.segment).map((l) => l.line) };
  const catalog = await loadSolverCatalog();
  return { ok: true, lines: solveAll(groundLines(ordered, text), catalog), removedLines };
}
