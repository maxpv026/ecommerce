import "server-only";

import { revalidateTag } from "next/cache";
import { CATALOG_COUNTS_TAG, PRODUCTS_TAG } from "@/lib/cacheTags";

/**
 * Expire the cached catalog NOW — the next read waits for fresh rows.
 *
 * Called by every write that changes what a buyer sees about a product:
 * stock (orders, cancellations, CRM pushes, admin edits), price, size and
 * family changes. `{ expire: 0 }` rather than the "max" profile: stale-while-
 * revalidate would show one more visitor yesterday's stock or price, and for
 * stock and prices "eventually" is wrong. Works in Server Actions and Route
 * Handlers alike (updateTag is Server-Action-only).
 *
 * Never throws: outside a request (a script) there is no cache to expire,
 * and a cache hint must not undo a committed write.
 */
export function expireCatalog(): void {
  for (const tag of [PRODUCTS_TAG, CATALOG_COUNTS_TAG]) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      return;
    }
  }
}
