import { unstable_cache } from "next/cache";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { OrderStatus } from "@/lib/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface StoreProduct {
  id: string;
  sku: string;
  name: string;
  /** Refrigerant code derived from the leading token of the name, e.g. "R-410A". */
  type: string;
  /** Numeric lb figure parsed out of the free-text `weight` field, when present. */
  weightLb: number | null;
  weightLabel: string;
  price: number;
  inStock: boolean;
  gwpClass: string;
  /** Best-effort link into the existing (pre-Prisma) PDP mock catalog, keyed by refrigerant type. */
  pdpHref: string;
}

// The PDP route (`/product/[id]`) still reads from lib/productDetails.ts, a
// richer mock catalog (descriptions, 3D models, per-weight pricing tiers)
// that wasn't part of this data-binding pass. This lookup keeps "View
// product" links working by routing to the matching mock entry via
// refrigerant type, exactly as the old hardcoded mobile catalog did.
const PDP_LOOKUP: Record<string, { id: number; weightId: string }> = {
  "R-410A": { id: 1, weightId: "25" },
  "R-134a": { id: 2, weightId: "30" },
  "R-32": { id: 3, weightId: "25" },
  "R-404A": { id: 4, weightId: "24" },
};

function deriveRefrigerantType(name: string): string {
  return name.split(" ")[0] ?? name;
}

function toStoreProduct(product: {
  id: string;
  sku: string;
  name: string;
  price: unknown;
  weight: string;
  gwpClass: string;
  inStock: boolean;
}): StoreProduct {
  const type = deriveRefrigerantType(product.name);
  const weightMatch = product.weight.match(/\d+/);
  const pdp = PDP_LOOKUP[type];
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    type,
    weightLb: weightMatch ? Number(weightMatch[0]) : null,
    weightLabel: product.weight,
    price: Number(product.price),
    inStock: product.inStock,
    gwpClass: product.gwpClass,
    pdpHref: pdp ? `/product/${pdp.id}?weight=${pdp.weightId}` : "/cylinders",
  };
}

export async function getProducts(): Promise<StoreProduct[]> {
  const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" } });
  return products.map(toStoreProduct);
}

export async function getFeaturedProducts(limit = 4): Promise<StoreProduct[]> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
  });
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
  locale: string;
  /** F-Gas verification flag (Prisma column keeps its legacy `epaVerified` name). */
  fgasVerified: boolean;
  memberSinceYear: number;
  defaultAddress: string | null;
  defaultAddressTitle: string | null;
  defaultAddressRecipient: string | null;
  certificate: { certType: string; certId: string; issuedYear: number } | null;
}

export async function getUserProfile(userId: string): Promise<UserProfileData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 1 },
      certificates: { orderBy: { issuedAt: "desc" }, take: 1 },
    },
  });
  if (!user) return null;

  const cert = user.certificates[0] ?? null;
  return {
    name: user.name,
    email: user.email,
    companyName: user.companyName,
    locale: user.locale,
    fgasVerified: user.epaVerified,
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
  priceAtPurchase: number;
}

export interface UserOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  estimatedDelivery: string;
  createdAt: string;
  trackingNumber: string | null;
  items: UserOrderItem[];
}

export async function getUserOrders(userId: string): Promise<UserOrder[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    estimatedDelivery: order.estimatedDelivery.toISOString(),
    createdAt: order.createdAt.toISOString(),
    trackingNumber: order.trackingNumber,
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.product.sku,
      productName: item.product.name,
      variant: item.product.weight,
      quantity: item.quantity,
      priceAtPurchase: Number(item.priceAtPurchase),
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
export async function getRecommendedProducts(userId: string, limit = 3): Promise<StoreProduct[]> {
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (orders.length === 0) return getFeaturedProducts(limit);

    const catalog = await prisma.product.findMany();
    if (catalog.length === 0) return [];

    const catalogList = catalog.map((p) => `- ${p.sku}: ${p.name} (${p.gwpClass}, ${p.weight})`).join("\n");
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

    const recommended = await prisma.product.findMany({ where: { sku: { in: object.skus } } });
    const ordered = object.skus
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
// AI-generated market news & alerts
// ---------------------------------------------------------------------------

export interface MarketAlertData {
  id: string;
  tone: "warning" | "success";
  eyebrow: string;
  title: string;
  body: string;
}

const MarketAlertsSchema = z.object({
  alerts: z
    .array(
      z.object({
        tone: z.enum(["warning", "success"]),
        eyebrow: z.string().describe("Short all-caps category label, e.g. \"F-GAS QUOTA\" or \"PRICE TREND\"."),
        title: z.string().describe("Short, specific headline, e.g. a refrigerant name or regulation."),
        body: z.string().describe("One or two sentences of concrete, plausible detail — include a number where natural."),
      })
    )
    .min(2)
    .max(3),
});

async function generateMarketAlerts(): Promise<MarketAlertData[]> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: MarketAlertsSchema,
    prompt:
      "Generate 2-3 realistic, plausible market alerts for European HVAC/refrigeration professionals, dated as of today. Cover things like EU F-Gas regulation quota phasedowns, price trends for common refrigerants (R-32, R-410A, R-454B), or supply/compliance deadlines. Each alert should read like a real trade-press blurb: specific, technical, with a concrete number or date where natural. Mark alerts as tone \"warning\" for price increases/supply risk/compliance deadlines, or \"success\" for price drops/favorable regulatory news.",
  });
  return object.alerts.map((alert, i) => ({ id: `ai-alert-${i}`, ...alert }));
}

// Shared across the /api/market-news route and the Home page's direct
// server-side call, so both hit the same 12-hour cache instead of double-
// spending LLM calls.
const getCachedMarketAlerts = unstable_cache(generateMarketAlerts, ["market-news"], {
  revalidate: 60 * 60 * 12,
});

export async function getMarketAlerts(): Promise<MarketAlertData[]> {
  try {
    return await getCachedMarketAlerts();
  } catch (error) {
    console.error("getMarketAlerts failed:", error);
    return [];
  }
}
