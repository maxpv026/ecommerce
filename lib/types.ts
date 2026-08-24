export interface Product {
  id: number;
  name: string;
  spec: string;
  price: string;
  was: string;
  tag: string;
}

export interface WeightOption {
  id: string;
  label: string;
  price: number;
}

export interface KeySpec {
  label: string;
  value: string;
}

export interface SpecRow {
  key: string;
  value: string;
}

export interface ProductDetail {
  id: number;
  category: string;
  breadcrumbLabel: string;
  name: string;
  description: string;
  compareAtPrice: number;
  discountLabel: string;
  availability: string;
  certificationBadge: string;
  keySpecs: KeySpec[];
  weights: WeightOption[];
  defaultWeightId: string;
  baseSpecs: SpecRow[];
  complianceNote: string;
  /** Path (under /public) to this product's 3D cylinder model. Falls back to the generic model when omitted. */
  modelPath?: string;
}

export interface CartItem {
  id: number;
  name: string;
  variant: string;
  stock: string;
  unit: number;
  qty: number;
}

export interface CatalogEntry {
  id: number;
  name: string;
  type: string;
  weight: number;
  price: number;
  sku: string;
  tag: string;
  note: string;
  /** Canonical PDP id and weight tier this card links to. */
  productId: number;
  weightId: string;
  /** Prisma Product.sku this listing entry sells — what goes in the cart. */
  dbSku: string;
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

export type QuickActionIconKey = "refresh" | "package-search" | "file-text" | "scan-barcode";

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

export interface MobileFilterOption {
  id: string;
  label: string;
}
