import { countSearchProducts, searchProducts } from "@/lib/data";
import {
  SEARCH_MIN_LENGTH,
  SEARCH_SUGGESTION_LIMIT,
  isSearchable,
  normalizeSearchTerm,
} from "@/lib/search";

/**
 * Live product search for the header dropdown.
 *
 *   GET /api/search?q=134a
 *   200 { ok: true, query, total, results: [{ id, name, sku, … , href }] }
 *
 * Public on purpose — this is the catalog, the same rows anyone can browse
 * at /products. It stays cheap by construction: the term is trimmed and
 * capped before it reaches Prisma, anything shorter than SEARCH_MIN_LENGTH
 * short-circuits without a query, and at most SEARCH_SUGGESTION_LIMIT rows
 * come back. `total` lets the dropdown offer "see all N" without a second
 * request.
 *
 * The filter itself lives in lib/search.ts and is the very same one
 * /products?search= applies, so the dropdown can never promise a product the
 * full results page then hides.
 */

// Catalog rows change when the CRM pushes stock; never serve a stale hit.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const term = normalizeSearchTerm(new URL(request.url).searchParams.get("q"));

  if (!isSearchable(term)) {
    return Response.json({
      ok: true,
      query: term,
      total: 0,
      results: [],
      note: `Type at least ${SEARCH_MIN_LENGTH} characters`,
    });
  }

  try {
    const [matches, total] = await Promise.all([
      searchProducts(term, SEARCH_SUGGESTION_LIMIT),
      countSearchProducts(term),
    ]);

    return Response.json({
      ok: true,
      query: term,
      total,
      results: matches.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        /** Refrigerant mark, shown next to the SKU. */
        type: product.type,
        weightLabel: product.weightLabel,
        pricePerKg: product.pricePerKg,
        cylinderPrice: product.cylinderPrice,
        pricedPerKg: product.pricedPerKg,
        inStock: product.inStock && product.stockQuantity > 0,
        // Locale-less on purpose: the client renders it through the
        // next-intl <Link>, which prefixes the active locale.
        href: `/products/${product.id}`,
      })),
    });
  } catch (error) {
    console.error("search failed:", error);
    return Response.json({ ok: false, error: "Search failed" }, { status: 500 });
  }
}
