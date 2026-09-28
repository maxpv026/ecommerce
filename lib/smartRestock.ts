import "server-only";

import prisma from "@/lib/prisma";

/**
 * Purchase-velocity prediction for B2B restocking.
 *
 * Deliberately separated from the cron route and from the AI call: this is
 * pure arithmetic over order history, so it can be run against a database
 * and checked without spending a model call or sending anyone an email.
 * The route composes predict → suppress → generate → send.
 */

/** Only look this far back. A cadence from three years ago is archaeology. */
const HISTORY_DAYS = 540;

/**
 * Cadence sanity bounds, in days.
 *
 * Below the floor the "cadence" is almost always an artefact — a split
 * delivery, a corrected order, a same-week top-up — and acting on it means
 * emailing someone every other day. Above the ceiling there is no usable
 * signal: an annual purchase predicts nothing about next week.
 */
const MIN_CADENCE_DAYS = 3;
const MAX_CADENCE_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface RestockPrediction {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  companyName: string | null;
  productId: string;
  productName: string;
  productSku: string;
  productVariant: string;
  /** Distinct purchase occasions observed (same-day orders count once). */
  purchaseCount: number;
  /** Mean days between consecutive purchase occasions. */
  averageDays: number;
  /** Mean units per occasion, rounded up — what we suggest reordering. */
  recommendedQty: number;
  /** Last purchase, at UTC-day resolution. */
  lastOrderedAt: Date;
  /** lastOrderedAt + averageDays. */
  predictedDate: Date;
  /** Negative when the customer is already overdue. */
  daysUntilPredicted: number;
}

/**
 * Every (customer, product) pair with enough history to predict a cadence.
 *
 * ── The same-day collapse, which is the whole correctness story here ──
 * A B2B order is regularly split across two rows: a line added minutes later,
 * a corrected quantity, two POs raised by the same buyer. Treated naively
 * those are two purchases zero days apart, the mean cadence collapses toward
 * zero, and the predicted date lands on the day of the last order — for ever.
 * Every such customer would then be emailed on every single cron run. So
 * purchases are collapsed to UTC-day occasions first, and quantities summed
 * within a day.
 */
export async function getRestockPredictions(): Promise<RestockPrediction[]> {
  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);

  // One pass over the window. Grouping happens here rather than in SQL
  // because the cadence is a difference between consecutive rows, which
  // Prisma's groupBy cannot express (it has no window functions). The
  // selection is four small columns over a bounded range.
  const items = await prisma.orderItem.findMany({
    where: {
      order: { createdAt: { gte: since }, paymentStatus: { not: "FAILED" } },
    },
    select: {
      productId: true,
      quantity: true,
      order: { select: { userId: true, createdAt: true } },
      product: { select: { name: true, sku: true, weight: true, inStock: true, stockQuantity: true } },
    },
    orderBy: { order: { createdAt: "asc" } },
  });

  interface Group {
    userId: string;
    productId: string;
    product: { name: string; sku: string; weight: string; inStock: boolean; stockQuantity: number };
    /** UTC-day epoch → units bought that day. */
    byDay: Map<number, number>;
  }

  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = `${item.order.userId}::${item.productId}`;
    const group =
      groups.get(key) ??
      {
        userId: item.order.userId,
        productId: item.productId,
        product: item.product,
        byDay: new Map<number, number>(),
      };
    const day = utcDay(item.order.createdAt);
    group.byDay.set(day, (group.byDay.get(day) ?? 0) + item.quantity);
    groups.set(key, group);
  }

  const predictions: RestockPrediction[] = [];
  const now = Date.now();

  for (const group of groups.values()) {
    // "Purchased at least 2 times" means two distinct occasions, not two rows.
    if (group.byDay.size < 2) continue;

    const days = [...group.byDay.keys()].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < days.length; i++) intervals.push((days[i] - days[i - 1]) / DAY_MS);
    if (intervals.length === 0) continue;

    const averageDays = intervals.reduce((n, d) => n + d, 0) / intervals.length;
    if (averageDays < MIN_CADENCE_DAYS || averageDays > MAX_CADENCE_DAYS) continue;

    const quantities = [...group.byDay.values()];
    const averageQty = quantities.reduce((n, q) => n + q, 0) / quantities.length;
    // Round UP: suggesting less than they habitually buy invites a second
    // order, which is the opposite of the point.
    const recommendedQty = Math.max(1, Math.ceil(averageQty));

    const lastDay = days[days.length - 1];
    const predicted = new Date(lastDay + Math.round(averageDays) * DAY_MS);

    predictions.push({
      userId: group.userId,
      userName: null,
      userEmail: null,
      companyName: null,
      productId: group.productId,
      productName: group.product.name,
      productSku: group.product.sku,
      productVariant: group.product.weight,
      purchaseCount: group.byDay.size,
      averageDays: Math.round(averageDays * 10) / 10,
      recommendedQty,
      lastOrderedAt: new Date(lastDay),
      predictedDate: predicted,
      daysUntilPredicted: Math.round((predicted.getTime() - now) / DAY_MS),
    });
  }

  // Hydrate the customer details only for pairs that survived.
  const userIds = [...new Set(predictions.map((p) => p.userId))];
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, companyName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const p of predictions) {
      const u = byId.get(p.userId);
      p.userName = u?.name ?? null;
      p.userEmail = u?.email ?? null;
      p.companyName = u?.companyName ?? null;
    }
  }

  return predictions.sort((a, b) => a.daysUntilPredicted - b.daysUntilPredicted);
}

export interface DueOptions {
  /** How far ahead to act. */
  lookAheadDays?: number;
  /**
   * How far past a missed prediction still counts.
   *
   * A customer who should have reordered four days ago is the single best
   * person to contact — strictly "the next 7 days" would skip exactly them.
   * Bounded, though: someone 90 days overdue has changed supplier or stopped
   * needing it, and chasing them is noise.
   */
  graceDays?: number;
  /** Suppression window — no second email about the same product inside it. */
  suppressionDays?: number;
}

export interface DueResult {
  due: RestockPrediction[];
  skipped: {
    outsideWindow: number;
    recentlyNotified: number;
    openAlert: number;
    noEmail: number;
    unavailable: number;
  };
}

/**
 * Narrows predictions to the ones worth emailing about today.
 *
 * Every exclusion here is a decision not to contact someone, which is the
 * part of this feature that protects the relationship. Counts are returned
 * so a cron run can be read at a glance instead of guessing why it was quiet.
 */
export async function selectDueRestocks(
  predictions: RestockPrediction[],
  options: DueOptions = {}
): Promise<DueResult> {
  const lookAhead = options.lookAheadDays ?? 7;
  const grace = options.graceDays ?? 14;
  const suppression = options.suppressionDays ?? 30;

  const skipped = { outsideWindow: 0, recentlyNotified: 0, openAlert: 0, noEmail: 0, unavailable: 0 };

  const inWindow = predictions.filter((p) => {
    if (p.daysUntilPredicted > lookAhead || p.daysUntilPredicted < -grace) {
      skipped.outsideWindow += 1;
      return false;
    }
    return true;
  });
  if (inWindow.length === 0) return { due: [], skipped };

  // One query for the whole suppression check, not one per candidate.
  const since = new Date(Date.now() - suppression * DAY_MS);
  const recent = await prisma.restockAlert.findMany({
    where: {
      userId: { in: [...new Set(inWindow.map((p) => p.userId))] },
      productId: { in: [...new Set(inWindow.map((p) => p.productId))] },
      OR: [
        // Contacted about it recently.
        { status: "NOTIFIED", createdAt: { gte: since } },
        // Or there is already an alert sitting live on their dashboard —
        // emailing again while the last one is unread is the definition of
        // spam, however old it is.
        { status: { in: ["PENDING", "NOTIFIED"] } },
      ],
    },
    select: { userId: true, productId: true, status: true, createdAt: true },
  });

  const notifiedRecently = new Set<string>();
  const openAlert = new Set<string>();
  for (const row of recent) {
    const key = `${row.userId}::${row.productId}`;
    if (row.status === "NOTIFIED" && row.createdAt >= since) notifiedRecently.add(key);
    if (row.status === "PENDING" || row.status === "NOTIFIED") openAlert.add(key);
  }

  const due = inWindow.filter((p) => {
    const key = `${p.userId}::${p.productId}`;
    if (notifiedRecently.has(key)) {
      skipped.recentlyNotified += 1;
      return false;
    }
    if (openAlert.has(key)) {
      skipped.openAlert += 1;
      return false;
    }
    if (!p.userEmail) {
      skipped.noEmail += 1;
      return false;
    }
    return true;
  });

  return { due, skipped };
}

/**
 * Whether we can actually sell them what we are about to suggest.
 *
 * Checked at send time rather than during prediction: stock moves constantly,
 * and an email urging someone to reorder something the catalogue cannot ship
 * is worse than silence.
 */
export async function filterPurchasable(due: RestockPrediction[]): Promise<{
  sellable: RestockPrediction[];
  unavailable: number;
}> {
  if (due.length === 0) return { sellable: [], unavailable: 0 };
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(due.map((p) => p.productId))] } },
    select: { id: true, inStock: true, stockQuantity: true },
  });
  const ok = new Set(products.filter((p) => p.inStock && p.stockQuantity > 0).map((p) => p.id));
  const sellable = due.filter((p) => ok.has(p.productId));
  return { sellable, unavailable: due.length - sellable.length };
}

// ---------------------------------------------------------------------------
// Dashboard read
// ---------------------------------------------------------------------------

/**
 * One live alert, carrying everything the card needs to build a cart line.
 *
 * The product's pricing travels with the alert because the cart is client
 * state (zustand + persist) and `addItem` wants a full CartLine. Sending it
 * from the server keeps the card from having to fetch a product before it can
 * do anything — and placeOrder re-reads every price from the database at
 * checkout regardless, so nothing here is trusted for money.
 */
export interface ActiveRestockAlert {
  id: string;
  recommendedQty: number;
  predictedDate: string;
  aiMessage: string | null;
  productId: string;
  sku: string;
  name: string;
  variant: string;
  pricePerKg: number;
  weightKg: number;
  deposit: number;
  /** False when the catalogue can no longer ship it — the card then hides. */
  purchasable: boolean;
}

/**
 * Live restock suggestions for one customer's dashboard.
 *
 * Only PENDING and NOTIFIED are live: CONVERTED means they bought it and
 * DISMISSED means they said no, and re-showing either would be the exact
 * nagging this feature is supposed to avoid.
 */
export async function getActiveRestockAlerts(userId: string): Promise<ActiveRestockAlert[]> {
  const rows = await prisma.restockAlert.findMany({
    where: { userId, status: { in: ["PENDING", "NOTIFIED"] } },
    orderBy: { predictedDate: "asc" },
    take: 5,
    select: {
      id: true,
      recommendedQty: true,
      predictedDate: true,
      aiMessage: true,
      productId: true,
      product: {
        select: {
          sku: true,
          name: true,
          weight: true,
          pricePerKg: true,
          weightKg: true,
          cylinderDeposit: true,
          inStock: true,
          stockQuantity: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    recommendedQty: row.recommendedQty,
    predictedDate: row.predictedDate.toISOString(),
    aiMessage: row.aiMessage,
    productId: row.productId,
    sku: row.product.sku,
    name: row.product.name,
    variant: row.product.weight,
    pricePerKg: row.product.pricePerKg,
    weightKg: row.product.weightKg,
    deposit: Number(row.product.cylinderDeposit),
    purchasable: row.product.inStock && row.product.stockQuantity > 0,
  }));
}

/**
 * Marks alerts CONVERTED for products that an order actually contained.
 *
 * Called after an order is committed — a completed sale, not a click. Only
 * NOTIFIED rows are promoted: a PENDING row was never sent, and crediting a
 * message nobody received would overstate how well this works. Returns how
 * many were credited so the caller can log it.
 */
export async function convertRestockAlerts(userId: string, productIds: string[]): Promise<number> {
  if (productIds.length === 0) return 0;
  const { count } = await prisma.restockAlert.updateMany({
    where: { userId, productId: { in: [...new Set(productIds)] }, status: "NOTIFIED" },
    data: { status: "CONVERTED" },
  });
  return count;
}
