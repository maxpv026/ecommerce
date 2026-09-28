/**
 * Cache tags shared between the things that read cached data and the things
 * that invalidate it.
 *
 * Kept in their own module so a writer can call `revalidateTag` without
 * importing a page, and so a tag is never spelled slightly differently in two
 * places — a typo'd tag fails silently, leaving stale data with no error.
 */

/**
 * Per-category product counts (the /categories cards).
 *
 * Covers how many products exist in a category, NOT their stock levels —
 * so it needs revalidating when the catalogue gains or retires a product,
 * which is what the CRM inventory webhook does when it flips a row's
 * availability.
 */
export const CATALOG_COUNTS_TAG = "catalog-counts";

/**
 * Admin analytics aggregations (revenue series, cylinder debt, top products,
 * quick stats).
 *
 * Everything on that dashboard is derived from orders, invoices and the
 * cylinder ledger, so the three writers that move those numbers — checkout,
 * the CRM inventory push and the admin inventory screen — should drop this
 * tag rather than wait out the TTL. A ten-minute-stale revenue figure is
 * fine; a figure that never moves after a big order is not.
 */
export const ADMIN_ANALYTICS_TAG = "admin-analytics";
