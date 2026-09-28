import { isPurchasable } from "./waitlist";

// Client-side listing order. The server already returns products in-stock
// first (lib/data.ts), but the product browsers let the buyer re-sort by
// price or GWP — which would otherwise pull an out-of-stock cylinder back up
// among the purchasable ones. Availability stays the primary key here, so
// every sort is really "in stock, then <chosen order>".

type Sortable = { inStock: boolean; stockQuantity: number };

/**
 * Sorts a copy of `products` with out-of-stock items pinned to the bottom,
 * applying `compare` within each group. A stable sort, so an absent or
 * tie-returning `compare` preserves the server's order.
 */
export function sortProducts<T extends Sortable>(products: T[], compare?: (a: T, b: T) => number): T[] {
  return [...products].sort((a, b) => {
    const availability = Number(isPurchasable(b)) - Number(isPurchasable(a));
    if (availability !== 0) return availability;
    return compare ? compare(a, b) : 0;
  });
}
