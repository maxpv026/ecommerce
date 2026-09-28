export interface Product {
  id: number;
  name: string;
  spec: string;
  price: string;
  was: string;
  tag: string;
}

// `ProductDetail`, `WeightOption`, `KeySpec` and `SpecRow` used to live here:
// the shape of the hardcoded lib/productDetails.ts catalogue behind the old
// /product/[id] page. That route, its view and its mock data are deleted, and
// the PDP now takes `StoreProduct` from lib/data.ts — a real row, with a real
// sku, pricePerKg, weightKg and cylinderDeposit. The types are gone rather
// than left unused so nothing gets built against the mock shape again.

export interface CartItem {
  id: number;
  name: string;
  variant: string;
  stock: string;
  unit: number;
  qty: number;
}

export interface AccountField {
  key: "name" | "email" | "company" | "address";
  value: string;
}

export interface EpaCertification {
  type: string;
  expiresLabel: string;
  onFileSinceYear: number;
  verified: boolean;
}

export interface AccountProfile {
  name: string;
  companyLabel: string;
  customerSinceYear: number;
  orderCount: number;
  fields: AccountField[];
  epaCert: EpaCertification;
}

export type AccountOrderStatus = "In Transit" | "Delivered";

export interface AccountOrder {
  id: string;
  date: string;
  status: AccountOrderStatus;
  total: string;
}

export type SdsCategory = "Single component" | "Blend" | "Reclaimed";

export type SdsBadgeLabel =
  | "F-Gas Certified"
  | "A1 Non-flammable"
  | "A2L Mildly Flammable"
  | "Reclaimed";

export interface SdsDocument {
  id: number;
  name: string;
  cas: string;
  category: SdsCategory;
  doc: string;
  badges: SdsBadgeLabel[];
  /** Filename under /public/sds — what the download link actually fetches. */
  file: string;
  /** Refrigerant designation on its own ("R-32"), for the AI assistant. */
  gas: string;
}

export interface CertificationStat {
  value: string;
  label: string;
}

export type CertificationIconKey = "shield-check" | "package-check" | "award";

export interface CertificationStandard {
  id: string;
  icon: CertificationIconKey;
  title: string;
  tag: string;
  body: string;
  audit: string;
}

export interface TrustStat {
  value: string;
  labelKey: string;
}

export type TrustIconKey = "shield-check" | "award";

export interface TrustCard {
  id: string;
  icon: TrustIconKey;
  titleKey: string;
  bodyKey: string;
  tagKey: string;
}

export type QuickActionIconKey = "refresh" | "package-search" | "file-text" | "scan-barcode" | "leaf";

export interface QuickAction {
  id: string;
  icon: QuickActionIconKey;
  label: string;
  note: string;
  /** Omitted for actions that open an in-page modal (e.g. the barcode scanner) instead of navigating. */
  href?: string;
}

export interface FeaturedProduct {
  id: number;
  name: string;
  weight: string;
  /** EUR amount; formatted per-locale at render time via next-intl. */
  price: number;
  tag?: string;
}

export interface ActiveShipment {
  orderId: string;
  summary: string;
  status: string;
  progressPercent: number;
}

export type MobileTabId = "home" | "catalog" | "cart" | "profile";
export type MobileTabIconKey = "home" | "layout-grid" | "shopping-cart" | "user";

export interface MobileTab {
  id: MobileTabId;
  href: string;
  icon: MobileTabIconKey;
}

export interface MobileCatalogEntry {
  id: number;
  name: string;
  type: string;
  weight: number;
  /** EUR amount; formatted per-locale at render time via next-intl. */
  price: number;
  tag?: string;
  /** Canonical PDP id and weight tier this card links to. */
  productId: number;
  weightId: string;
}
