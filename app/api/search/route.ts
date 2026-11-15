import { auth } from "@/auth";
import prisma from "@/lib/prisma";
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
 *
 * For a signed-in buyer the response also carries `orders`: their own orders
 * whose number or line items match (the /search page; the header ignores it).
 * Scoped by the session's user id — nobody else's order can come back.
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
    const userId = (await auth())?.user?.id ?? null;
    const [matches, total, orders] = await Promise.all([
      searchProducts(term, SEARCH_SUGGESTION_LIMIT),
      countSearchProducts(term),
      userId
        ? prisma.order.findMany({
            where: {
              userId,
              OR: [{ orderNumber: { contains: term, mode: "insensitive" } }, { items: { some: { product: { OR: [{ name: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }] } } } }],
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, orderNumber: true, createdAt: true, totalAmount: true, paymentStatus: true, shipmentStage: true, _count: { select: { items: true } } },
          })
        : null,
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
        weightKg: product.weightKg,
        containerType: product.containerType,
        pricePerKg: product.pricePerKg,
        cylinderPrice: product.cylinderPrice,
        pricedPerKg: product.pricedPerKg,
        inStock: product.inStock && product.stockQuantity > 0,
        // Locale-less on purpose: the client renders it through the
        // next-intl <Link>, which prefixes the active locale.
        href: `/products/${product.id}`,
      })),
      signedIn: userId !== null,
      orders: (orders ?? []).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt.toISOString(),
        total: Number(o.totalAmount),
        paid: o.paymentStatus === "PAID",
        cancelled: o.paymentStatus === "FAILED",
        stage: o.shipmentStage,
        lines: o._count.items,
      })),
    });
  } catch (error) {
    console.error("search failed:", error);
    return Response.json({ ok: false, error: "Search failed" }, { status: 500 });
  }
}
