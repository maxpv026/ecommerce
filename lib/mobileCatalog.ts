import type { MobileCatalogEntry, MobileFilterOption } from "./types";

// EU-priced mobile catalog. First four entries mirror lib/mobileHome.ts's
// FEATURED_PRODUCTS (same underlying products, same source of truth for the
// mobile/EU experience); this list additionally carries the bulk tiers and
// the productId/weightId pair each card deep-links to on the PDP.
// `price` is a plain EUR amount, formatted per-locale at render time.
export const MOBILE_CATALOG: MobileCatalogEntry[] = [
  { id: 1, name: "R-410A Premium", type: "R-410A", weight: 25, price: 189, tag: "Top", productId: 1, weightId: "25" },
  { id: 2, name: "R-32 Low GWP", type: "R-32", weight: 25, price: 212, tag: "A2L", productId: 3, weightId: "25" },
  { id: 3, name: "R-134a Standard", type: "R-134a", weight: 30, price: 164, productId: 2, weightId: "30" },
  { id: 4, name: "R-404A Reclaimed", type: "R-404A", weight: 24, price: 298, productId: 4, weightId: "24" },
  { id: 5, name: "R-410A Bulk", type: "R-410A", weight: 100, price: 618, productId: 1, weightId: "100" },
  { id: 6, name: "R-32 Bulk", type: "R-32", weight: 100, price: 742, productId: 3, weightId: "100" },
];

export const MOBILE_CATALOG_FILTERS: MobileFilterOption[] = [
  { id: "all", label: "All" },
  { id: "R-410A", label: "R-410A" },
  { id: "R-32", label: "R-32" },
  { id: "25", label: "25 lb" },
  { id: "100", label: "100 lb" },
];

export const REFRIGERANT_FILTER_OPTIONS: MobileFilterOption[] = [
  { id: "all", label: "All" },
  { id: "R-410A", label: "R-410A" },
  { id: "R-32", label: "R-32" },
  { id: "R-134a", label: "R-134a" },
  { id: "R-404A", label: "R-404A" },
];

export const WEIGHT_FILTER_OPTIONS: MobileFilterOption[] = [
  { id: "all", label: "Any weight" },
  { id: "25", label: "25 lb" },
  { id: "100", label: "100 lb" },
];

export function matchesMobileCatalogFilter(
  entry: { type: string; weightLb: number | null },
  filter: string
): boolean {
  if (filter === "all") return true;
  if (filter === "25" || filter === "100") return String(entry.weightLb) === filter;
  return entry.type === filter;
}
