import type { Prisma } from "./generated/prisma/client";
import { gasMarkWhere, parseGasMarks } from "./gasMarks";

// Free-text product search, shared by the header's live dropdown
// (/api/search) and the product list's `?search=` filter — one definition so
// pressing Enter can never show a different set than the dropdown promised.

/** Below this, a query is too broad to be worth a round trip. */
export const SEARCH_MIN_LENGTH = 2;
/** Nothing longer than this reaches the database. */
export const SEARCH_MAX_LENGTH = 64;
/** How many suggestions the header dropdown shows. */
export const SEARCH_SUGGESTION_LIMIT = 5;

/** Reads a raw `?search=` param or query string into a safe, trimmed term. */
export function normalizeSearchTerm(raw: string | string[] | null | undefined): string {
  const value = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  return value.trim().slice(0, SEARCH_MAX_LENGTH);
}

export function isSearchable(term: string): boolean {
  return term.trim().length >= SEARCH_MIN_LENGTH;
}

/**
 * Prisma `where` fragment for a free-text term, case-insensitive across the
 * two fields a buyer actually types: the product name ("R-134a Premium") and
 * the SKU ("R134A", "HC-R134A-25").
 *
 * A bare fragment like "134a" matches both directly. A punctuated mark
 * ("R-134a") would miss the SKU and a bare one ("r134a") would miss the
 * name, so when the term resolves to a known refrigerant mark its
 * spelling-tolerant clauses are OR'd in as well (lib/gasMarks.ts).
 *
 * Returns undefined for a term too short to filter on — callers treat that
 * as "no constraint" rather than "no results".
 */
export function productSearchWhere(term: string): Prisma.ProductWhereInput | undefined {
  const q = normalizeSearchTerm(term);
  if (!isSearchable(q)) return undefined;

  const clauses: Prisma.ProductWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { sku: { contains: q, mode: "insensitive" } },
  ];

  const markClause = gasMarkWhere(parseGasMarks(q));
  if (markClause?.OR) clauses.push(...(markClause.OR as Prisma.ProductWhereInput[]));

  return { OR: clauses };
}

/** ANDs together the filters that are actually set; undefined means "no filter". */
export function combineWhere(
  ...parts: Array<Prisma.ProductWhereInput | undefined>
): Prisma.ProductWhereInput | undefined {
  const active = parts.filter((part): part is Prisma.ProductWhereInput => part !== undefined);
  if (active.length === 0) return undefined;
  return active.length === 1 ? active[0] : { AND: active };
}
