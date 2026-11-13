import "server-only";

import prisma from "@/lib/prisma";
import { getCylinderLedger } from "@/lib/invoicing";
import { getUserQuotes, type QuoteView } from "@/lib/quotes";
import { getFavoriteProducts, type StoreProduct } from "@/lib/data";
import { listDeviceSessions } from "@/lib/deviceSessions";
import { pickupDefaults } from "@/lib/shipping/resolve";
import type { AvatarTone, FulfilmentPref, UnitPref } from "@/lib/profilePrefs";
import { isAvatarTone, FULFILMENT_PREFS, UNIT_PREFS } from "@/lib/profilePrefs";
import { SDS_ASSET_DIR, SDS_DOCUMENTS } from "@/lib/sds";
import { gasMarkForProduct } from "@/lib/productMedia";
import { normalizeMark } from "@/lib/gasMarks";

/**
 * Everything the /profile hub shows beyond the account row and the orders —
 * one read per module, all scoped to the signed-in user by the caller.
 */

export interface ProfilePreferences {
  avatarTone: AvatarTone | null;
  avatarInitials: string | null;
  billingEmail: string | null;
  depositIban: string | null;
  preferredFulfilment: FulfilmentPref | null;
  preferredUnits: UnitPref;
}

export interface CylinderReturnView {
  id: string;
  quantity: number;
  method: "PICKUP" | "DROP_OFF";
  addressText: string | null;
  preferredDate: string | null;
  status: string;
  createdAt: string;
}

export interface CylinderFleet {
  /** Held now: BORROWED − RETURNED in the ledger (lib/invoicing). */
  inPossession: number;
  borrowed: number;
  returned: number;
  /** Deposit per cylinder when every charged deposit was the same; null when they differ. */
  depositEach: number | null;
  /** Refundable deposit on the cylinders held: exact when depositEach is set, else the average. */
  refundable: number;
  refundableIsEstimate: boolean;
  /** Cylinders issued per product, from the orders that issued them (returns aren't per type). */
  issuedByType: Array<{ sku: string; name: string; variant: string; quantity: number }>;
  requests: CylinderReturnView[];
}

export interface SecuritySummary {
  twoFactor: boolean;
  /** SEED_12 · CUSTOM_PHRASE · LEGACY (a phrase from before types) · null (none). */
  phraseMode: "SEED_12" | "CUSTOM_PHRASE" | "LEGACY" | null;
  devices: number;
  passwordChangedAt: string | null;
}

export interface InvoiceDoc {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  status: string;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
}

export interface SdsDoc {
  name: string;
  gas: string;
  version: string;
  category: string;
  /** Public file under /sds. */
  href: string;
  /** The buyer has ordered this gas / saved a product of it. */
  purchased: boolean;
  saved: boolean;
}

export interface DocumentCenter {
  invoices: InvoiceDoc[];
  /** Ordered and saved gases first, then the rest of the library. */
  sds: SdsDoc[];
}

export interface ProfileHubData {
  preferences: ProfilePreferences;
  fleet: CylinderFleet;
  quotes: QuoteView[];
  favorites: StoreProduct[];
  security: SecuritySummary;
  pickup: { location: string | null; hours: string | null };
  documents: DocumentCenter;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getProfileHub(userId: string): Promise<ProfileHubData> {
  const [user, ledger, quotes, favorites, devices, requests, invoices, boughtProducts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarTone: true,
        avatarInitials: true,
        billingEmail: true,
        depositIban: true,
        preferredFulfilment: true,
        preferredUnits: true,
        isTwoFactorEnabled: true,
        recoveryPhraseHash: true,
        recoveryPhraseType: true,
        recoveryPhraseSalt: true,
        passwordChangedAt: true,
      },
    }),
    getCylinderLedger(userId),
    getUserQuotes(userId, 6),
    getFavoriteProducts(userId),
    listDeviceSessions(userId, null),
    prisma.cylinderReturnRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.invoice.findMany({
      where: { order: { userId } },
      orderBy: { issuedAt: "desc" },
      select: { id: true, invoiceNumber: true, issuedAt: true, status: true, order: { select: { id: true, orderNumber: true, totalAmount: true, paymentStatus: true, status: true } } },
    }),
    prisma.orderItem.findMany({ where: { order: { userId } }, select: { product: { select: { name: true, sku: true } } } }),
  ]);

  // SDS: which gases this buyer has bought or saved, matched on the mark ("R-410A" ↔ R410A).
  const markKey = (s: string) => normalizeMark(s);
  const bought = new Set(boughtProducts.map((i) => gasMarkForProduct(i.product)).filter(Boolean).map((m) => markKey(m!)));
  const saved = new Set(favorites.map((p) => gasMarkForProduct(p)).filter(Boolean).map((m) => markKey(m!)));
  const sds = SDS_DOCUMENTS.map((d) => ({
    name: d.name,
    gas: d.gas,
    version: d.doc,
    category: d.category,
    href: `${SDS_ASSET_DIR}/${d.file}`,
    purchased: bought.has(markKey(d.gas)),
    saved: saved.has(markKey(d.gas)),
  })).sort((a, b) => Number(b.purchased) - Number(a.purchased) || Number(b.saved) - Number(a.saved));

  // Per-type breakdown and the deposit actually charged, from the orders whose
  // ledger rows issued cylinders.
  const issuingOrders = [...new Set(ledger.entries.filter((e) => e.type === "BORROWED" && e.orderId).map((e) => e.orderId!))];
  const items = issuingOrders.length
    ? await prisma.orderItem.findMany({
        where: { orderId: { in: issuingOrders }, depositAtPurchase: { gt: 0 } },
        select: { quantity: true, depositAtPurchase: true, product: { select: { sku: true, name: true, weight: true } } },
      })
    : [];
  const byType = new Map<string, { sku: string; name: string; variant: string; quantity: number }>();
  let charged = 0;
  let chargedUnits = 0;
  const deposits = new Set<number>();
  for (const item of items) {
    const key = item.product.sku;
    const row = byType.get(key) ?? { sku: key, name: item.product.name, variant: item.product.weight, quantity: 0 };
    row.quantity += item.quantity;
    byType.set(key, row);
    const d = Number(item.depositAtPurchase);
    deposits.add(d);
    charged += d * item.quantity;
    chargedUnits += item.quantity;
  }
  const depositEach = deposits.size === 1 ? [...deposits][0]! : null;
  const average = chargedUnits > 0 ? charged / chargedUnits : 0;

  const phraseMode = !user?.recoveryPhraseHash && !user?.recoveryPhraseSalt
    ? null
    : user?.recoveryPhraseType === "SEED_12" || user?.recoveryPhraseType === "CUSTOM_PHRASE"
      ? user.recoveryPhraseType
      : "LEGACY";

  return {
    preferences: {
      avatarTone: isAvatarTone(user?.avatarTone) ? user.avatarTone : null,
      avatarInitials: user?.avatarInitials ?? null,
      billingEmail: user?.billingEmail ?? null,
      depositIban: user?.depositIban ?? null,
      preferredFulfilment: (FULFILMENT_PREFS as readonly string[]).includes(user?.preferredFulfilment ?? "") ? (user!.preferredFulfilment as FulfilmentPref) : null,
      preferredUnits: (UNIT_PREFS as readonly string[]).includes(user?.preferredUnits ?? "") ? (user!.preferredUnits as UnitPref) : "metric",
    },
    fleet: {
      inPossession: ledger.inPossession,
      borrowed: ledger.borrowed,
      returned: ledger.returned,
      depositEach,
      refundable: round2(ledger.inPossession * (depositEach ?? average)),
      refundableIsEstimate: depositEach === null && ledger.inPossession > 0,
      issuedByType: [...byType.values()].sort((a, b) => b.quantity - a.quantity),
      requests: requests.map((r) => ({
        id: r.id,
        quantity: r.quantity,
        method: r.method === "DROP_OFF" ? "DROP_OFF" : "PICKUP",
        addressText: r.addressText,
        preferredDate: r.preferredDate?.toISOString() ?? null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    quotes,
    favorites: favorites.slice(0, 6),
    security: {
      twoFactor: Boolean(user?.isTwoFactorEnabled),
      phraseMode,
      devices: devices.length,
      passwordChangedAt: user?.passwordChangedAt?.toISOString() ?? null,
    },
    pickup: pickupDefaults(),
    documents: {
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issuedAt: i.issuedAt.toISOString(),
        status: i.status,
        orderId: i.order.id,
        orderNumber: i.order.orderNumber,
        totalAmount: Number(i.order.totalAmount),
        paymentStatus: i.order.paymentStatus,
        orderStatus: i.order.status,
      })),
      sds,
    },
  };
}
