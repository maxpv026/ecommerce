import { unstable_cache } from "next/cache";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { FGasStatus, OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { KG_PER_LB, cylinderGasPrice, isPricedPerKg } from "@/lib/pricing";
import { GAS_MARKS, gasMarkWhere, productHasGasMark } from "@/lib/gasMarks";
import { NEWS_ITEM_LIMIT, fetchIndustryNews, type MarketAlertData as MarketAlert } from "@/lib/services/newsFetcher";
import { SEARCH_SUGGESTION_LIMIT, combineWhere, productSearchWhere } from "@/lib/search";
import { isPurchasable } from "@/lib/waitlist";
import type { FgasExtraction } from "@/lib/fgas";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface StoreProduct {
  id: string;
  sku: string;
  name: string;
  /** Refrigerant code derived from the leading token of the name, e.g. "R-410A". */
  type: string;
  /** Net weight in lb (rounded), for the legacy lb-based filters; null for per-unit equipment. */
  weightLb: number | null;
  /** Pack label used as the cart line variant, e.g. "10 kg cylinder" or "Set". */
  weightLabel: string;
  /** Gas price per kilogram (EUR). For per-unit equipment this is the unit price (weightKg = 1). */
  pricePerKg: number;
  /** Net gas weight of one cylinder in kg; 1 for per-unit equipment. */
  weightKg: number;
  /** Price of one full cylinder: pricePerKg × weightKg, rounded to cents. */
  cylinderPrice: number;
  /** True for gas (cylinders/blends): UI shows "€/kg" prominently plus the cylinder figure. */
  pricedPerKg: boolean;
  inStock: boolean;
  /** Absolute on-hand count, as last pushed by the CRM (and decremented by orders). */
  stockQuantity: number;
  /** Mandatory refundable deposit per cylinder, charged as its own cart line. 0 for equipment. */
  cylinderDeposit: number;
  gwpClass: string;
  /** Batch purity % (null for equipment/services). */
  purity: number | null;
  /** GWP figure (null where not applicable). */
  gwp: number | null;
  /** Stock badge: "out" whenever the product isn't purchasable, else the facet column. */
  stockLevel: "in" | "low" | "order" | "out";
  /** Catalog category slug: cylinders | blends | equipment | recovery. */
  category: string;
  /** Link to this product's detail page: `/products/<db id>`. */
  pdpHref: string;
}

function deriveRefrigerantType(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** "10 kg cylinder" / "11.34 kg cylinder" — trims float noise, keeps up to 2 decimals. */
function kgLabel(weightKg: number): string {
  return `${Number(weightKg.toFixed(2))} kg cylinder`;
}

function toStoreProduct(product: {
  id: string;
  sku: string;
  name: string;
  pricePerKg: number;
  weightKg: number;
  weight: string;
  gwpClass: string;
  inStock: boolean;
  stockQuantity?: number;
  cylinderDeposit?: unknown;
  purity?: unknown;
  gwp?: number | null;
  stock?: string;
  category?: string;
}): StoreProduct {
  const type = deriveRefrigerantType(product.name);
  const category = product.category ?? "cylinders";
  const pricedPerKg = isPricedPerKg(category);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    type,
    weightLb: pricedPerKg ? Math.round(product.weightKg / KG_PER_LB) : null,
    weightLabel: pricedPerKg ? kgLabel(product.weightKg) : product.weight,
    pricePerKg: product.pricePerKg,
    weightKg: product.weightKg,
    cylinderPrice: cylinderGasPrice(product.pricePerKg, product.weightKg),
    pricedPerKg,
    inStock: product.inStock,
    stockQuantity: product.stockQuantity ?? 0,
    cylinderDeposit: product.cylinderDeposit == null ? 0 : Number(product.cylinderDeposit),
    gwpClass: product.gwpClass,
    purity: product.purity == null ? null : Number(product.purity),
    gwp: product.gwp ?? null,
    // Reconciled with purchasability, not just the inStock flag: a row can
    // sit at inStock:true with stockQuantity:0 (a CRM push that only moved
    // the price, a hand edit, a legacy row), and the badge must not then
    // claim "In Stock" while the buy button refuses. isPurchasable is the
    // one rule; the facet column only adds nuance on top of it.
    stockLevel: !isPurchasable({ inStock: product.inStock, stockQuantity: product.stockQuantity ?? 0 })
      ? "out"
      : product.stock === "low"
        ? "low"
        : product.stock === "order"
          ? "order"
          : "in",
    category,
    // The database id straight through: /products/[id] looks this row up by
    // it. This once pointed at /product/[id], a second PDP built over the
    // hardcoded lib/productDetails.ts catalog whose ids were small integers
    // — so the link only resolved for the four refrigerant types that
    // catalog covered. That route and its mock data are gone; /products/[id]
    // is the only PDP, and every product has a db id, so every card has one.
    pdpHref: `/products/${product.id}`,
  };
}

/**
 * In-stock first, then oldest-listed first. Every listing shares this order
 * so an out-of-stock product can never sit above a purchasable one — the
 * client-side sorts in the browsers re-apply the same rule as their primary
 * key (see sortProducts in lib/productSort.ts).
 */
const IN_STOCK_FIRST = [{ inStock: "desc" as const }, { createdAt: "asc" as const }];

export interface ProductQuery {
  /** Refrigerant marks from `?gasType=`; empty or omitted means no constraint. */
  gasMarks?: readonly string[];
  /** Free-text term from `?search=`; shorter than SEARCH_MIN_LENGTH is ignored. */
  search?: string;
}

export async function getProducts(query: ProductQuery = {}): Promise<StoreProduct[]> {
  const products = await prisma.product.findMany({
    // Marks and free text are ANDed: searching inside a mark selection
    // narrows, it never widens back to the whole catalog.
    where: combineWhere(gasMarkWhere(query.gasMarks ?? []), productSearchWhere(query.search ?? "")),
    orderBy: IN_STOCK_FIRST,
  });
  return products.map(toStoreProduct);
}

/**
 * The header dropdown's suggestions: the same filter the product list uses,
 * capped and in the same in-stock-first order, so the five shown are the
 * five the buyer would see at the top of `/products?search=…`.
 */
export async function searchProducts(
  term: string,
  limit = SEARCH_SUGGESTION_LIMIT
): Promise<StoreProduct[]> {
  const where = productSearchWhere(term);
  // Too short to filter on: return nothing rather than the whole catalog.
  if (!where) return [];
  const products = await prisma.product.findMany({
    where,
    orderBy: IN_STOCK_FIRST,
    take: Math.min(Math.max(1, limit), 25),
  });
  return products.map(toStoreProduct);
}

/** Total matches for a term — powers the dropdown's "see all N results" row. */
export async function countSearchProducts(term: string): Promise<number> {
  const where = productSearchWhere(term);
  if (!where) return 0;
  return prisma.product.count({ where });
}

/**
 * How many products carry each refrigerant mark, counted over the WHOLE
 * catalog. The sidebar needs these unfiltered: if they were counted against
 * an already gas-filtered list, every unselected mark would read 0 and the
 * filter could never be widened.
 */
export async function getGasMarkCounts(): Promise<Record<string, number>> {
  const products = await prisma.product.findMany({ select: { name: true, sku: true } });
  const counts: Record<string, number> = {};
  for (const mark of GAS_MARKS) {
    counts[mark] = products.filter((product) => productHasGasMark(product, mark)).length;
  }
  return counts;
}

export async function getFeaturedProducts(limit = 4): Promise<StoreProduct[]> {
  // Purchasable products first, so a retired legacy tier never headlines
  // the home page while the CRM-listed cylinders are in stock.
  const products = await prisma.product.findMany({ orderBy: IN_STOCK_FIRST, take: limit });
  return products.map(toStoreProduct);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export interface UserAddress {
  id: string;
  title: string;
  recipientName: string;
  fullAddress: string;
  isDefault: boolean;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  /** Delivery contact for the ADR carrier; null on rows saved before checkout asked. */
  phone: string | null;
  kind: "SHIPPING" | "BILLING";
}

export async function getUserAddresses(userId: string): Promise<UserAddress[]> {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return addresses.map((a) => ({
    id: a.id,
    title: a.title,
    recipientName: a.recipientName,
    fullAddress: a.fullAddress,
    isDefault: a.isDefault,
    street: a.street,
    city: a.city,
    postalCode: a.postalCode,
    country: a.country,
    phone: a.phone,
    kind: a.kind === "BILLING" ? "BILLING" : "SHIPPING",
  }));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface UserProfileData {
  name: string | null;
  email: string | null;
  companyName: string | null;
  /** EU VAT id, printed on invoices for cross-border B2B. */
  vatNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
  passwordChangedAt: string | null;
  locale: string;
  /** F-Gas verification flag — true only when fGasStatus is VERIFIED. */
  fgasVerified: boolean;
  /** Where the certificate stands: NONE | PENDING_REVIEW | VERIFIED | REJECTED. */
  fGasStatus: FGasStatus;
  /** Why a reviewer refused it, shown to the buyer when REJECTED. */
  fGasRejectionReason: string | null;
  /** Whether an authenticator app is enrolled. The secret never leaves the server. */
  isTwoFactorEnabled: boolean;
  /**
   * What was actually read off the uploaded certificate. This — not the
   * Certificate table row — is what the compliance card shows: the row
   * carries our own approval timestamp, whereas these are the document's own
   * holder, number and dates.
   */
  fGasExtracted: FgasExtraction | null;
  /**
   * Where the document lives: an app-relative path into the authenticated
   * retrieval route (local storage), or an unguessable blob URL. Null until
   * something has been uploaded. Only ever handed to its owner — see
   * app/api/fgas/document/[key].
   */
  fGasDocumentUrl: string | null;
  memberSinceYear: number;
  defaultAddress: string | null;
  defaultAddressTitle: string | null;
  defaultAddressRecipient: string | null;
  certificate: { certType: string; certId: string; issuedYear: number } | null;
}

export async function getUserProfile(userId: string): Promise<UserProfileData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Explicit, and deliberately so. A bare `include` selects every scalar on
    // User — 38 columns, among them `password`, `twoFactorSecret` and
    // `recoveryCodes`. Those were being read into a page render that has no
    // use for them, which is a needless row width on every profile view and a
    // needless copy of three credentials in server memory. Listing the 13
    // fields this shape actually returns keeps both problems away, and means
    // a future secret added to User is not silently pulled in here.
    select: {
      name: true,
      email: true,
      companyName: true,
      vatNumber: true,
      jobTitle: true,
      phone: true,
      passwordChangedAt: true,
      locale: true,
      fGasStatus: true,
      fGasRejectionReason: true,
      fGasExtractedData: true,
      isTwoFactorEnabled: true,
      fGasDocumentUrl: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { fullAddress: true, title: true, recipientName: true },
      },
      certificates: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: { certType: true, certId: true, issuedAt: true },
      },
    },
  });
  if (!user) return null;

  const cert = user.certificates[0] ?? null;
  return {
    name: user.name,
    email: user.email,
    companyName: user.companyName,
    vatNumber: user.vatNumber,
    jobTitle: user.jobTitle,
    phone: user.phone,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    locale: user.locale,
    fgasVerified: user.fGasStatus === "VERIFIED",
    fGasStatus: user.fGasStatus,
    fGasRejectionReason: user.fGasRejectionReason,
    fGasExtracted: (user.fGasExtractedData as FgasExtraction | null) ?? null,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
    fGasDocumentUrl: user.fGasDocumentUrl,
    memberSinceYear: user.createdAt.getFullYear(),
    defaultAddress: user.addresses[0]?.fullAddress ?? null,
    defaultAddressTitle: user.addresses[0]?.title ?? null,
    defaultAddressRecipient: user.addresses[0]?.recipientName ?? null,
    certificate: cert
      ? { certType: cert.certType, certId: cert.certId, issuedYear: cert.issuedAt.getFullYear() }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface UserOrderItem {
  id: string;
  sku: string;
  productName: string;
  variant: string;
  quantity: number;
  /** Gas price of one cylinder at purchase time (pricePerKg × weightKg then). */
  priceAtPurchase: number;
  /** Per-kg rate behind priceAtPurchase; 0 on lines placed before weight-based pricing. */
  pricePerKgAtPurchase: number;
  /** Net kg behind priceAtPurchase; 1 on legacy lines. */
  weightKgAtPurchase: number;
  /** Per-cylinder deposit charged on this line at purchase time. */
  depositAtPurchase: number;
}

export interface UserOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Settlement, separate from fulfilment — a SEPA transfer clears days later. */
  paymentStatus: PaymentStatus;
  totalAmount: number;
  estimatedDelivery: string;
  createdAt: string;
  trackingNumber: string | null;
  /**
   * Invoice id, when one has been issued for this order — the argument the
   * PDF route takes. Null until issueInvoiceForOrder() has run, which is what
   * makes "finalized" a fact rather than a guess from the status: no invoice
   * row, no download button, instead of a button that 404s.
   */
  invoiceId: string | null;
  items: UserOrderItem[];
}

/**
 * The order shape the profile and home screens render. Nested `include` was
 * pulling every column of every Order, OrderItem and Product — and a Product
 * row per line item, when three of its fields are used. Prisma batches the
 * nested reads (this was never an N+1), so the cost was row width, not round
 * trips; on an order history with many lines that is most of the payload.
 */
const USER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  totalAmount: true,
  estimatedDelivery: true,
  createdAt: true,
  trackingNumber: true,
  invoice: { select: { id: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      priceAtPurchase: true,
      pricePerKgAtPurchase: true,
      weightKgAtPurchase: true,
      depositAtPurchase: true,
      product: { select: { sku: true, name: true, weight: true } },
    },
  },
} as const;

export async function getUserOrders(userId: string): Promise<UserOrder[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    select: USER_ORDER_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: Number(order.totalAmount),
    estimatedDelivery: order.estimatedDelivery.toISOString(),
    createdAt: order.createdAt.toISOString(),
    trackingNumber: order.trackingNumber,
    invoiceId: order.invoice?.id ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.product.sku,
      productName: item.product.name,
      variant: item.product.weight,
      quantity: item.quantity,
      priceAtPurchase: Number(item.priceAtPurchase),
      pricePerKgAtPurchase: item.pricePerKgAtPurchase,
      weightKgAtPurchase: item.weightKgAtPurchase,
      depositAtPurchase: Number(item.depositAtPurchase),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Profile dashboard aggregate stats
// ---------------------------------------------------------------------------

export interface ProfileDashboardData {
  totalOrders: number;
  activeShipments: number;
  addressCount: number;
}

export async function getProfileDashboardData(userId: string): Promise<ProfileDashboardData> {
  const [totalOrders, activeShipments, addressCount] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.count({ where: { userId, status: { in: ["PENDING", "IN_TRANSIT"] } } }),
    prisma.address.count({ where: { userId } }),
  ]);
  return { totalOrders, activeShipments, addressCount };
}

// ---------------------------------------------------------------------------
// AI-powered smart recommendations
// ---------------------------------------------------------------------------

const RecommendationSchema = z.object({
  skus: z
    .array(z.string())
    .describe(
      "SKUs (from the provided catalog only) of the products this HVAC professional is most likely to need next, most relevant first."
    ),
});

/**
 * Analyzes a user's order history with an LLM and returns up to 3 catalog
 * products it predicts they'll need next. Falls back to `getFeaturedProducts`
 * on empty history or on any AI/parsing failure (e.g. missing API key) so a
 * broken or unconfigured OpenAI integration never breaks the Home page.
 */
/**
 * How long a model round-trip may hold up the page before we give up on it.
 *
 * Without this the home page's time-to-first-byte is however long OpenAI
 * takes, with no ceiling — a hung request would hang the render. Recommended
 * products are a nicety; the page is fine with featured ones.
 */
const RECOMMENDATION_TIMEOUT_MS = 2_500;

/** How long a user's recommendations stay good for. Order history moves in days. */
const RECOMMENDATION_TTL_SECONDS = 60 * 60;

/** Cache tag for one user's recommendations, so placing an order can drop them. */
export function recommendationsTag(userId: string): string {
  return `recommendations:${userId}`;
}

/** The SKU list the model picks. Cached; deliberately not the hydrated rows,
 *  so a cached entry can never serve a stale price or stock flag. */
async function computeRecommendedSkus(userId: string, limit: number): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    // Only what the prompt prints.
    select: { items: { select: { quantity: true, product: { select: { sku: true, name: true } } } } },
  });
  if (orders.length === 0) return [];

  const catalog = await prisma.product.findMany({
    select: { sku: true, name: true, gwpClass: true, weight: true, pricePerKg: true },
  });
  if (catalog.length === 0) return [];

  const catalogList = catalog
    .map((p) => `- ${p.sku}: ${p.name} (${p.gwpClass}, ${p.weight}, €${p.pricePerKg}/kg)`)
    .join("\n");
  const historyList = orders
    .flatMap((o) => o.items.map((i) => `${i.quantity}x ${i.product.sku} (${i.product.name})`))
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: RecommendationSchema,
    prompt: `You are recommending HVAC refrigerant products to a B2B customer based on their order history.

Order history (most recent orders):
${historyList}

Full product catalog (SKU: name, GWP class, weight):
${catalogList}

Recommend up to ${limit} SKUs from the catalog above that this customer is most likely to need next — e.g. complementary refrigerants, restocks of what they buy often, or logical next purchases for their apparent buying pattern. Only use SKUs that appear in the catalog list.`,
  });

  return object.skus;
}

/**
 * Analyzes a user's order history with an LLM and returns up to `limit` catalog
 * products it predicts they'll need next. Falls back to `getFeaturedProducts`
 * on empty history, on timeout, or on any AI/parsing failure (e.g. missing API
 * key) so a broken or unconfigured OpenAI integration never breaks the Home
 * page.
 *
 * The model call is cached per user for an hour and raced against a timeout,
 * because this sits in the Home page's critical path: it used to mean every
 * signed-in page load waited on OpenAI before a single byte was sent.
 */
export async function getRecommendedProducts(userId: string, limit = 3): Promise<StoreProduct[]> {
  try {
    const cachedSkus = unstable_cache(
      (id: string, n: number) => computeRecommendedSkus(id, n),
      ["recommended-skus"],
      { revalidate: RECOMMENDATION_TTL_SECONDS, tags: [recommendationsTag(userId)] }
    );

    // Whichever finishes first. The loser is not cancelled — an in-flight
    // model call still populates the cache for the next visitor — but it can
    // no longer delay this response.
    const skus = await Promise.race([
      cachedSkus(userId, limit),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RECOMMENDATION_TIMEOUT_MS)),
    ]);
    if (!skus || skus.length === 0) return getFeaturedProducts(limit);

    // Hydrated fresh every time, so price and stock are never served stale.
    const recommended = await prisma.product.findMany({ where: { sku: { in: skus } } });
    const ordered = skus
      .map((sku) => recommended.find((p) => p.sku === sku))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, limit);

    return ordered.length > 0 ? ordered.map(toStoreProduct) : getFeaturedProducts(limit);
  } catch (error) {
    console.error("getRecommendedProducts failed, falling back to featured products:", error);
    return getFeaturedProducts(limit);
  }
}

// ---------------------------------------------------------------------------
// Market news & alerts — live industry RSS
// ---------------------------------------------------------------------------

// The model that used to write these blurbs is gone: it produced convincing
// trade-press prose that was entirely invented. The widget now carries real
// articles, each linking back to its publisher (lib/services/newsFetcher.ts).
export type { MarketAlertData, MarketAlertTag } from "@/lib/services/newsFetcher";

// One hour, shared by the /api/market-news route and the dashboard widget's
// own server-side call — so a page load never costs the publisher a request
// and both surfaces show the same batch.
const getCachedMarketAlerts = unstable_cache(() => fetchIndustryNews(NEWS_ITEM_LIMIT), ["market-news"], {
  revalidate: 60 * 60,
  tags: ["market-news"],
});

export async function getMarketAlerts(): Promise<MarketAlert[]> {
  try {
    return await getCachedMarketAlerts();
  } catch (error) {
    // A dead feed is not a dead dashboard: the widget renders its empty state.
    console.error("getMarketAlerts failed:", error);
    return [];
  }
}
