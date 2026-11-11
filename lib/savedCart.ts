import "server-only";

import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";

/**
 * Server copy of a signed-in buyer's basket (SavedCart), for the
 * abandoned-cart reminder only.
 *
 * The browser cart (lib/store/cart, localStorage) stays the source of truth
 * for the UI. What is stored here is the bare minimum to remind someone:
 * SKUs and quantities. No prices — the reminder reads today's price and
 * stock at send time, and checkout re-reads them again.
 */

export const MAX_SAVED_LINES = 50;
const MAX_QTY = 99;

export interface SavedCartItem {
  sku: string;
  qty: number;
}

/** Same basket, same string: order-independent, so a re-sync is a no-op. */
const fingerprint = (items: SavedCartItem[]) =>
  JSON.stringify([...items].sort((a, b) => a.sku.localeCompare(b.sku)).map((i) => [i.sku, i.qty]));

export function parseSavedItems(value: unknown): SavedCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (i): i is SavedCartItem =>
      typeof i === "object" && i !== null && typeof (i as SavedCartItem).sku === "string" && Number.isInteger((i as SavedCartItem).qty)
  );
}

export type SaveCartOutcome = "saved" | "unchanged" | "cleared";

/**
 * Stores the basket as the browser last saw it. Lines whose SKU is not a
 * listed product are dropped (a stale or edited localStorage can hold
 * anything); quantities are clamped like the cart's own. An empty result
 * deletes the row — nothing left to remind about.
 *
 * `contentUpdatedAt` only moves when the contents change, so a tab that
 * re-syncs the same basket can neither postpone a due reminder nor re-arm
 * one that was already sent.
 */
export async function saveCartSnapshot(userId: string, raw: SavedCartItem[]): Promise<SaveCartOutcome> {
  const merged = new Map<string, number>();
  for (const line of raw.slice(0, MAX_SAVED_LINES)) {
    const sku = line.sku.trim();
    if (!sku || sku.length > 64 || !(line.qty > 0)) continue;
    merged.set(sku, Math.min(MAX_QTY, (merged.get(sku) ?? 0) + Math.floor(line.qty)));
  }

  const known = merged.size
    ? await prisma.product.findMany({ where: { ...LISTED, sku: { in: [...merged.keys()] } }, select: { sku: true } })
    : [];
  const items = known.map((p) => ({ sku: p.sku, qty: merged.get(p.sku)! }));

  if (items.length === 0) {
    await clearSavedCart(userId);
    return "cleared";
  }

  const existing = await prisma.savedCart.findUnique({ where: { userId }, select: { items: true } });
  if (existing && fingerprint(parseSavedItems(existing.items)) === fingerprint(items)) return "unchanged";

  const now = new Date();
  const itemCount = items.reduce((n, i) => n + i.qty, 0);
  await prisma.savedCart.upsert({
    where: { userId },
    create: { userId, items, itemCount, contentUpdatedAt: now },
    update: { items, itemCount, contentUpdatedAt: now },
  });
  return "saved";
}

/** Emptied basket or a placed order: nothing is pending any more. */
export async function clearSavedCart(userId: string): Promise<void> {
  await prisma.savedCart.deleteMany({ where: { userId } });
}

/**
 * The saved basket as cart lines, at today's catalogue values — used when a
 * reminder link is opened on a device whose own cart is empty. Unlisted
 * products are left out; checkout re-prices everything regardless.
 */
export async function readSavedCartLines(userId: string) {
  const row = await prisma.savedCart.findUnique({ where: { userId }, select: { items: true } });
  const items = parseSavedItems(row?.items);
  if (items.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { ...LISTED, sku: { in: items.map((i) => i.sku) } },
    select: { sku: true, name: true, weight: true, pricePerKg: true, weightKg: true, cylinderDeposit: true },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return items.flatMap((i) => {
    const p = bySku.get(i.sku);
    return p
      ? [{ sku: p.sku, name: p.name, variant: p.weight, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: Number(p.cylinderDeposit), qty: i.qty }]
      : [];
  });
}
