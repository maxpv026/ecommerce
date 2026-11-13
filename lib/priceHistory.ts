import "server-only";

import prisma from "@/lib/prisma";
import { LISTED, sizeLabel } from "@/lib/productFamily";
import { gasMarkForProduct } from "@/lib/productMedia";
import { isPurchasable } from "@/lib/waitlist";
import { sendPriceAlertEmail } from "@/lib/notificationEmail";

/**
 * The hub's price history — recorded, never reconstructed.
 *
 * Until November 2026 the shop stored one current `Product.pricePerKg` and
 * nothing else, so there is no past to chart. From now on a `PriceSnapshot`
 * row is written (a) whenever a price changes (CRM webhook, admin editor) and
 * (b) once a day by /api/cron/price-snapshot for every gas size. The chart
 * draws only these rows and says on which day its record begins.
 *
 * The per-gas "index" is the lowest €/kg among the sizes of that gas that can
 * be bought right now — what "from €X/kg" means on the catalog. When no size
 * is purchasable it falls back to the lowest listed rate, flagged as such.
 */

export interface GasIndex {
  /** Catalog mark ("R410A"). */
  mark: string;
  /** Display label ("R-410A"). */
  label: string;
  /** Lowest €/kg of a purchasable size (or of any listed size, if none is). */
  perKg: number;
  /** Some size of this gas can be ordered now. */
  available: boolean;
  /** The size that sets the index — the "buy at this price" target. */
  productId: string;
  /** What the cart needs to add that size. */
  sku: string;
  name: string;
  variant: string;
  weightKg: number;
  deposit: number;
  gwp: number | null;
  /** Sizes listed for this gas. */
  sizes: number;
  /**
   * The smallest size that can be bought now — what a technician takes to a
   * job, and what the comparator counts systems-per-cylinder against (the
   * index size can be a 1000 kg isotank). Null when nothing is purchasable.
   */
  service: { productId: string; sku: string; name: string; variant: string; weightKg: number; perKg: number; deposit: number } | null;
}

export const labelForMark = (mark: string) => mark.replace(/^R(?=\d)/, "R-");

type PriceRow = { id: string; name: string; sku: string; pricePerKg: number; weightKg: number; inStock: boolean; stockQuantity: number; gwp: number | null; containerType: string; cylinderDeposit: unknown };

const gasRows = async (ids?: string[]): Promise<Array<PriceRow & { mark: string }>> => {
  const rows = await prisma.product.findMany({
    where: { ...LISTED, pricePerKg: { gt: 0 }, category: { in: ["cylinders", "blends"] }, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, name: true, sku: true, pricePerKg: true, weightKg: true, inStock: true, stockQuantity: true, gwp: true, containerType: true, cylinderDeposit: true },
  });
  // Only rows that are one refrigerant: a custom blend has no market price to follow.
  return rows.flatMap((r) => {
    const mark = gasMarkForProduct(r);
    return mark ? [{ ...r, mark }] : [];
  });
};

/** The current index per gas, cheapest gas first. */
export async function getGasIndex(): Promise<GasIndex[]> {
  const rows = await gasRows();
  const byMark = new Map<string, Array<PriceRow & { mark: string }>>();
  for (const r of rows) byMark.set(r.mark, [...(byMark.get(r.mark) ?? []), r]);
  const out: GasIndex[] = [];
  for (const [mark, sizes] of byMark) {
    const buyable = sizes.filter(isPurchasable);
    const pool = buyable.length ? buyable : sizes;
    const best = pool.reduce((a, b) => (b.pricePerKg < a.pricePerKg ? b : a));
    const smallest = buyable.length ? buyable.reduce((a, b) => (b.weightKg < a.weightKg || (b.weightKg === a.weightKg && b.pricePerKg < a.pricePerKg) ? b : a)) : null;
    out.push({
      mark,
      label: labelForMark(mark),
      perKg: best.pricePerKg,
      available: buyable.length > 0,
      productId: best.id,
      sku: best.sku,
      name: best.name,
      variant: sizeLabel(best.weightKg, best.containerType),
      weightKg: best.weightKg,
      deposit: Number(best.cylinderDeposit),
      gwp: best.gwp,
      sizes: sizes.length,
      service: smallest
        ? { productId: smallest.id, sku: smallest.sku, name: smallest.name, variant: sizeLabel(smallest.weightKg, smallest.containerType), weightKg: smallest.weightKg, perKg: smallest.pricePerKg, deposit: Number(smallest.cylinderDeposit) }
        : null,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
}

/**
 * Write one snapshot per gas size. `daily` skips a size already read today
 * (UTC), so a re-run of the cron doesn't double the series; `change` always
 * writes — the moment a price moved is the point the chart must show.
 */
export async function recordPriceSnapshots(source: "change" | "daily", productIds?: string[]): Promise<number> {
  const rows = await gasRows(productIds);
  if (rows.length === 0) return 0;
  let todo = rows;
  if (source === "daily") {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const done = await prisma.priceSnapshot.findMany({
      where: { productId: { in: rows.map((r) => r.id) }, recordedAt: { gte: midnight }, source: "daily" },
      select: { productId: true },
    });
    const seen = new Set(done.map((d) => d.productId));
    todo = rows.filter((r) => !seen.has(r.id));
  }
  if (todo.length === 0) return 0;
  const { count } = await prisma.priceSnapshot.createMany({
    data: todo.map((r) => ({ productId: r.id, sku: r.sku, mark: r.mark, pricePerKg: r.pricePerKg, inStock: isPurchasable(r), source })),
  });
  return count;
}

export interface PricePoint {
  /** ISO day (UTC), "2026-11-13". */
  day: string;
  perKg: number;
}

/**
 * Daily index per gas from the recorded snapshots: for each day, the lowest
 * €/kg of a purchasable size (or of any size, if none was purchasable that
 * day) — the same rule as getGasIndex, applied to the record.
 */
export async function getPriceHistory(sinceDays = 400): Promise<{ series: Record<string, PricePoint[]>; firstDay: string | null }> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await prisma.priceSnapshot.findMany({
    where: { recordedAt: { gte: since }, mark: { not: null } },
    select: { mark: true, pricePerKg: true, inStock: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });
  const cell = new Map<string, { buyable: number | null; any: number }>();
  let firstDay: string | null = null;
  for (const r of rows) {
    const day = r.recordedAt.toISOString().slice(0, 10);
    firstDay ??= day;
    const key = `${r.mark}|${day}`;
    const price = Number(r.pricePerKg);
    const c = cell.get(key) ?? { buyable: null, any: price };
    c.any = Math.min(c.any, price);
    if (r.inStock) c.buyable = c.buyable === null ? price : Math.min(c.buyable, price);
    cell.set(key, c);
  }
  const series: Record<string, PricePoint[]> = {};
  for (const [key, c] of cell) {
    const [mark, day] = key.split("|") as [string, string];
    (series[mark] ??= []).push({ day, perKg: c.buyable ?? c.any });
  }
  for (const list of Object.values(series)) list.sort((a, b) => a.day.localeCompare(b.day));
  return { series, firstDay };
}

/**
 * Fire every untriggered target alert the current index has reached. Each is
 * claimed before its email goes out (so two snapshot runs can't both send it)
 * and released again if the send fails, so the next run retries.
 */
export async function checkPriceAlerts(index?: GasIndex[]): Promise<{ triggered: number; sent: number; failed: number }> {
  const current = index ?? (await getGasIndex());
  const live = new Map(current.filter((g) => g.available).map((g) => [g.mark, g]));
  const alerts = await prisma.priceAlert.findMany({ where: { triggeredAt: null, mark: { in: [...live.keys()] } }, select: { id: true, userId: true, mark: true, targetPerKg: true } });
  const result = { triggered: 0, sent: 0, failed: 0 };
  for (const a of alerts) {
    const gas = live.get(a.mark);
    if (!gas || gas.perKg > Number(a.targetPerKg)) continue;
    const claim = await prisma.priceAlert.updateMany({ where: { id: a.id, triggeredAt: null }, data: { triggeredAt: new Date() } });
    if (claim.count === 0) continue;
    result.triggered += 1;
    const delivery = await sendPriceAlertEmail({ userId: a.userId, gas: gas.label, productId: gas.productId, target: Number(a.targetPerKg), perKg: gas.perKg }).catch((error: unknown) => ({
      status: "failed" as const,
      error: String(error),
    }));
    if (delivery.status === "sent") result.sent += 1;
    else if (delivery.status === "failed") {
      // Retry on the next snapshot. A skip (no address) stays triggered — the hub shows it as reached.
      result.failed += 1;
      await prisma.priceAlert.updateMany({ where: { id: a.id }, data: { triggeredAt: null } });
    }
  }
  return result;
}

/** A price changed (CRM / admin): record it and check targets. Never throws. */
export async function onPriceChange(productIds: string[]): Promise<void> {
  try {
    if (productIds.length === 0) return;
    await recordPriceSnapshots("change", productIds);
    await checkPriceAlerts();
  } catch (error) {
    console.error("[price-history] snapshot/alert check failed:", error);
  }
}
