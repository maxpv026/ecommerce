import { GAS_MARKS, normalizeMark } from "@/lib/gasMarks";
import { isPurchasable } from "@/lib/waitlist";

/**
 * Resolving what a technician asked for against the real catalogue.
 *
 * Deliberately NOT in the "use server" action file. Two reasons: a server
 * action module may only export async functions, so the matcher could not be
 * exported for testing at all; and this is the security-critical half of
 * Magic Order, which means it needs to be checkable against the real product
 * list without spending a model call to get there.
 *
 * No `server-only` guard, on purpose. These are pure functions over a plain
 * array — no Prisma, no secrets, nothing that would be unsafe in a browser
 * bundle. Marking it server-only bought nothing and made the matching
 * impossible to exercise from a test script, which for the half of this
 * feature that decides what ends up in a customer's cart is the wrong trade.
 */

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export interface ResolvedItem {
  /** Real database row. Never model output. */
  productId: string;
  sku: string;
  name: string;
  variant: string;
  pricePerKg: number;
  weightKg: number;
  deposit: number;
  /** Price of one unit, from the database. */
  unitPrice: number;
  quantity: number;
  /** What the model read, kept so the UI can show the trail. */
  matchedFrom: string;
  /** How the row was identified — surfaced so a weak match is visible. */
  confidence: "sku" | "name" | "mark" | "contains";
  inStock: boolean;
  stockQuantity: number;
}

export interface AmbiguousItem {
  searchQuery: string;
  quantity: number;
  /**
   * Every purchasable row that matched. The buyer picks.
   *
   * Carries the full pricing shape, not just a display price: whichever
   * option they choose has to become a cart line, and a line needs
   * pricePerKg/weightKg/deposit. Sending only `unitPrice` would have left the
   * UI able to show the choice but unable to act on it.
   */
  options: Array<{
    productId: string;
    sku: string;
    name: string;
    variant: string;
    unitPrice: number;
    pricePerKg: number;
    weightKg: number;
    deposit: number;
  }>;
}

export interface UnresolvedItem {
  searchQuery: string;
  quantity: number;
  /** Why nothing was returned, so the message can be specific. */
  reason: "NO_MATCH" | "OUT_OF_STOCK" | "NO_PRICE";
}

export type MagicOrderResult =
  | {
      ok: true;
      resolvedItems: ResolvedItem[];
      ambiguousItems: AmbiguousItem[];
      unresolvedQueries: UnresolvedItem[];
    }
  | { ok: false; code: "INVALID_INPUT" | "NOT_CONFIGURED" | "UNAVAILABLE" | "NOTHING_FOUND" };

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type CatalogRow = {
  id: string;
  sku: string;
  name: string;
  weight: string;
  pricePerKg: number;
  weightKg: number;
  cylinderDeposit: unknown;
  inStock: boolean;
  stockQuantity: number;
};

/**
 * Finds every catalogue row a query could mean, most confident first.
 *
 * Ordered deliberately. An exact SKU or name is unambiguous and wins outright.
 * A canonical gas mark is the domain-correct path and is what turns "134a"
 * into the R-134a family. Loose substring matching is LAST and is the one
 * that needs the ambiguity guard — "R-40" would otherwise substring-match
 * both R-404A and R-407C, two different refrigerants.
 */
/**
 * The shape of a refrigerant designation on the normalised form: R, two to
 * four digits, optional trailing letter. R32, R134A, R410A, R507, R40.
 */
const REFRIGERANT_DESIGNATION = /^R\d{2,4}[A-Z]?$/;

interface CandidateTier {
  rows: CatalogRow[];
  confidence: ResolvedItem["confidence"];
}

/**
 * Every tier a query could match, most confident first.
 *
 * Returns ALL tiers rather than stopping at the first hit, because "most
 * confident" and "sellable" are different questions. A buyer asking for
 * R-410A exact-matches the SKU `R410A`; if that one pack is out of stock,
 * stopping there reports "out of stock" while three other purchasable R-410A
 * packs sit on the shelf. The caller walks these in order and takes the first
 * tier that actually has something orderable in it.
 */
function candidateTiers(query: string, catalog: CatalogRow[]): CandidateTier[] {
  const needle = normalizeMark(query);
  if (!needle) return [];

  const tiers: CandidateTier[] = [];

  const bySku = catalog.filter((p) => normalizeMark(p.sku) === needle);
  if (bySku.length > 0) tiers.push({ rows: bySku, confidence: "sku" });

  const byName = catalog.filter((p) => normalizeMark(p.name) === needle);
  if (byName.length > 0) tiers.push({ rows: byName, confidence: "name" });

  // Canonical mark: "R-134a" / "134a" / "r134" all normalise to R134A, and
  // only an EXACT mark match counts here. Without that equality check "R40"
  // would collapse into R404A.
  const mark = GAS_MARKS.find((m) => normalizeMark(m) === needle);
  if (mark) {
    const m = normalizeMark(mark);
    const byMark = catalog.filter((p) => {
      const n = normalizeMark(p.name);
      const sk = normalizeMark(p.sku);
      // Anchored at the start so R134A never matches a row that merely
      // contains those characters somewhere in the middle.
      return n.startsWith(m) || sk === m || sk.endsWith(m);
    });
    if (byMark.length > 0) tiers.push({ rows: byMark, confidence: "mark" });
  }

  // A refrigerant DESIGNATION must match exactly — never by substring.
  //
  // This guard is not hypothetical. "R-40" (methyl chloride, a real and very
  // different refrigerant) normalises to "R40", which is a substring of
  // "R404A". Without it, a technician asking for R-40 would have been handed
  // R-404A: right-looking, wrong gas, wrong price. It escaped notice in
  // testing only because R-404A happened to be out of stock at the time.
  //
  // Free text ("manifold", "recovery cylinder") still falls through to
  // substring matching, because there is no designation to get wrong.
  if (!REFRIGERANT_DESIGNATION.test(needle)) {
    const loose = catalog.filter(
      (p) => normalizeMark(p.name).includes(needle) || normalizeMark(p.sku).includes(needle)
    );
    if (loose.length > 0) tiers.push({ rows: loose, confidence: "contains" });
  }

  return tiers;
}

function toResolved(
  row: CatalogRow,
  quantity: number,
  matchedFrom: string,
  confidence: ResolvedItem["confidence"]
): ResolvedItem {
  const deposit = row.cylinderDeposit == null ? 0 : Number(row.cylinderDeposit);
  return {
    productId: row.id,
    sku: row.sku,
    name: row.name,
    variant: row.weight,
    pricePerKg: row.pricePerKg,
    weightKg: row.weightKg,
    deposit,
    // Straight from the row. The model never sees a price, let alone sets one.
    unitPrice: Math.round(row.pricePerKg * row.weightKg * 100) / 100,
    quantity,
    matchedFrom,
    confidence,
    inStock: row.inStock,
    stockQuantity: row.stockQuantity,
  };
}

export interface ResolveOutcome {
  resolvedItems: ResolvedItem[];
  ambiguousItems: AmbiguousItem[];
  unresolvedQueries: UnresolvedItem[];
}

/**
 * Turns the model's extracted queries into real products.
 *
 * The model's output reaches this function and goes no further: nothing it
 * said about a product survives except the search string itself, which is
 * kept only so the UI can show what was matched from what.
 */
export function resolveAgainstCatalog(
  items: Array<{ searchQuery: string; quantity: number }>,
  catalog: CatalogRow[]
): ResolveOutcome {
  const resolvedItems: ResolvedItem[] = [];
  const ambiguousItems: AmbiguousItem[] = [];
  const unresolvedQueries: UnresolvedItem[] = [];

  for (const item of items) {
    const tiers = candidateTiers(item.searchQuery, catalog);

    if (tiers.length === 0) {
      unresolvedQueries.push({ ...item, reason: "NO_MATCH" });
      continue;
    }

    // Walk from most to least confident and take the first tier with
    // something we can actually sell.
    let picked: { rows: CatalogRow[]; confidence: ResolvedItem["confidence"] } | null = null;
    let sawInStock = false;

    for (const tier of tiers) {
      const inStock = tier.rows.filter((r) =>
        isPurchasable({ inStock: r.inStock, stockQuantity: r.stockQuantity })
      );
      if (inStock.length > 0) sawInStock = true;

      // A row with no price is a catalogue data gap, not a product. Quoting a
      // B2B buyer EUR 0 is worse than saying "not available": placeOrder
      // re-reads prices from the database, so a zero here becomes a real
      // order for free refrigerant.
      const sellable = inStock.filter((r) => r.pricePerKg > 0);
      if (sellable.length > 0) {
        picked = { rows: sellable, confidence: tier.confidence };
        break;
      }
    }

    if (!picked) {
      unresolvedQueries.push({ ...item, reason: sawInStock ? "NO_PRICE" : "OUT_OF_STOCK" });
      continue;
    }

    if (picked.rows.length === 1) {
      resolvedItems.push(toResolved(picked.rows[0], item.quantity, item.searchQuery, picked.confidence));
      continue;
    }

    // More than one real product fits. Picking one would mean choosing a pack
    // size and a price on the buyer's behalf — so it goes back to them.
    ambiguousItems.push({
      searchQuery: item.searchQuery,
      quantity: item.quantity,
      options: picked.rows.slice(0, 6).map((r) => ({
        productId: r.id,
        sku: r.sku,
        name: r.name,
        variant: r.weight,
        unitPrice: Math.round(r.pricePerKg * r.weightKg * 100) / 100,
        pricePerKg: r.pricePerKg,
        weightKg: r.weightKg,
        deposit: r.cylinderDeposit == null ? 0 : Number(r.cylinderDeposit),
      })),
    });
  }

  return { resolvedItems, ambiguousItems, unresolvedQueries };
}
