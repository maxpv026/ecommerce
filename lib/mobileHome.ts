import type { ActiveShipment, FeaturedProduct, QuickAction } from "./types";

// `label`/`note` hold keys into the "Dashboard" messages namespace rather
// than literal display text — translated at render time in MobileAppLayout.
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "reorder",
    icon: "refresh",
    label: "quickReorderLabel",
    note: "quickReorderNote",
    href: "/profile/orders",
  },
  {
    id: "track",
    icon: "package-search",
    label: "trackShipmentLabel",
    note: "trackShipmentNote",
    href: "/profile/orders?tab=active",
  },
  {
    id: "sds",
    icon: "file-text",
    label: "sdsLibraryLabel",
    note: "sdsLibraryNote",
    href: "/profile/docs?tab=sds",
  },
  // No href: opens the in-page camera scanner modal instead of navigating.
  { id: "scan", icon: "scan-barcode", label: "scanBarcodeLabel", note: "scanBarcodeNote" },
];

// EU-facing pricing, matching the "Built for European service teams" mobile
// experience — same catalog as the desktop store, priced for the EU market.
// `price` is a plain EUR amount, formatted per-locale at render time.
export const FEATURED_PRODUCTS: FeaturedProduct[] = [
  { id: 1, name: "R-410A Premium", weight: "25 lb · Virgin", price: 189, tag: "Top" },
  { id: 2, name: "R-32 Low GWP", weight: "25 lb · A2L", price: 212 },
  { id: 3, name: "R-134a Standard", weight: "30 lb · Virgin", price: 164 },
  { id: 4, name: "R-404A Reclaimed", weight: "24 lb · AHRI-700", price: 298 },
];

// Same order id as ACCOUNT_ORDERS[0] in lib/account.ts — the in-transit
// order surfaced there is this same shipment.
export const ACTIVE_SHIPMENT: ActiveShipment = {
  orderId: "#HC-24817",
  summary: "R-410A Premium · 2 cylinders",
  status: "Out for delivery · arrives today by 6pm",
  progressPercent: 68,
};
