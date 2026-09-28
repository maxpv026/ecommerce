import type { Prisma } from "./generated/prisma/client";

// Refrigerant mark ("марка холодоагенту") filtering — the B2B way buyers
// actually shop: by the gas itself, not by our catalog naming.
//
// There is no dedicated column for it. The mark is carried in two places
// that disagree on punctuation:
//
//   name  "R-410A Premium", "R-410A Bulk"      → always hyphenated
//   sku   "R410A", "HC-R410A-25", "HC-410A-50" → sometimes without the R
//
// So matching normalises both sides (drop every non-alphanumeric, upper-case)
// and asks whether the mark appears as a substring. Verified against the
// seeded catalog: each gas product resolves to exactly one mark, and the
// non-gas rows (blends, manifold, recovery cylinder) resolve to none.

/** Every mark the CRM stocks or lists, in the order the sidebar shows them. */
export const GAS_MARKS = [
  "R32",
  "R410A",
  "R134a",
  "R404A",
  "R407C",
  "R407F",
  "R422D",
  "R125A",
  "R449A",
  "R452A",
  "R507",
  "R513A",
] as const;

export type GasMark = (typeof GAS_MARKS)[number];

/** How many marks the sidebar shows before "show more". */
export const GAS_MARKS_COLLAPSED_COUNT = 6;

const MARK_BY_KEY = new Map(GAS_MARKS.map((mark) => [mark.toUpperCase(), mark]));

/** "R-410A Premium" → "R410APREMIUM"; the comparison form for both sides. */
export function normalizeMark(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/** True when this product carries the given refrigerant mark. */
export function productHasGasMark(product: { name: string; sku: string }, mark: string): boolean {
  const needle = normalizeMark(mark);
  if (!needle) return false;
  return normalizeMark(product.name).includes(needle) || normalizeMark(product.sku).includes(needle);
}

export function productMatchesAnyGasMark(product: { name: string; sku: string }, marks: readonly string[]): boolean {
  // No selection means no constraint.
  return marks.length === 0 || marks.some((mark) => productHasGasMark(product, mark));
}

/**
 * Reads the `?gasType=R134a,R32` search param into canonical marks.
 * Unknown values are dropped rather than passed to the database, and the
 * result is de-duplicated and ordered like GAS_MARKS so the URL is stable.
 */
export function parseGasMarks(param: string | string[] | undefined): GasMark[] {
  if (!param) return [];
  const raw = Array.isArray(param) ? param.join(",") : param;
  const wanted = new Set(
    raw
      .split(",")
      .map((piece) => MARK_BY_KEY.get(normalizeMark(piece)))
      .filter((mark): mark is GasMark => Boolean(mark))
  );
  return GAS_MARKS.filter((mark) => wanted.has(mark));
}

/** Serialises marks back into the `gasType` param; empty means "no filter". */
export function serializeGasMarks(marks: readonly string[]): string {
  return GAS_MARKS.filter((mark) => marks.includes(mark)).join(",");
}

/**
 * Prisma `where` fragment for a set of marks, OR'd together so checking both
 * R32 and R410A returns products for both.
 *
 * `contains` cannot normalise punctuation, so each mark contributes the two
 * spellings that occur in the data: hyphenated for names ("R-410A") and bare
 * for SKUs ("R410A"). A SKU that drops the R ("HC-410A-50") is still caught,
 * because its product name carries the hyphenated mark.
 */
export function gasMarkWhere(marks: readonly string[]): Prisma.ProductWhereInput | undefined {
  if (marks.length === 0) return undefined;

  const clauses = marks.flatMap((mark) => {
    const bare = normalizeMark(mark);
    if (!bare) return [];
    // "R410A" → "R-410A"; marks always start with R in this catalog.
    const hyphenated = bare.startsWith("R") ? `R-${bare.slice(1)}` : bare;
    return [
      { name: { contains: hyphenated, mode: "insensitive" as const } },
      { name: { contains: bare, mode: "insensitive" as const } },
      { sku: { contains: bare, mode: "insensitive" as const } },
    ];
  });

  return clauses.length > 0 ? { OR: clauses } : undefined;
}
