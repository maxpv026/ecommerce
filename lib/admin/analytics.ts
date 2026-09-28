import "server-only";

import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { ADMIN_ANALYTICS_TAG } from "@/lib/cacheTags";

/**
 * Aggregations behind the admin analytics dashboard.
 *
 * ── THESE FUNCTIONS DO NOT AUTHORISE ──
 * They are deliberately plain data functions. Authorisation happens at the
 * page and route level (requireAdmin + the proxy.ts 2FA gate) because an
 * `auth()` call inside an `unstable_cache` callback reads cookies inside a
 * cache scope — which Next refuses, and which would be wrong anyway: the
 * cached value is global, shared between every admin, and must not be keyed
 * to whoever happened to warm it. `server-only` guarantees they can never be
 * pulled into a client bundle; the gate guarantees nobody unauthorised
 * reaches a caller.
 *
 * ── WHY REVENUE IS DATED BY `createdAt`, NOT `paidAt` ──
 * `Order.paidAt` is the settlement timestamp and would be the right axis for
 * recognised revenue — but nothing calls `markOrderPaid()` yet, so it is NULL
 * on every order in production today. `Invoice.status` has the same problem:
 * nothing transitions it out of PENDING. Grouping by either would have drawn
 * a flat zero line and looked like a working dashboard.
 *
 * So the series is dated by `createdAt` (when the order was placed) and split
 * into two values per day: everything booked, and the subset already marked
 * paid. When settlement is wired up, switch `paidRevenue` to bucket on
 * `paidAt` and the chart becomes a true cash-in curve with no other change.
 */

/** Ten minutes: these are trend lines, not a live till. */
const ANALYTICS_TTL_SECONDS = 10 * 60;

/** Bounds every scan below. A dashboard must not be able to table-scan history. */
const MAX_RANGE_DAYS = 365;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** "2026-09-16" — the bucket key, and what the chart's X axis renders. */
function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Revenue time series
// ---------------------------------------------------------------------------

export interface RevenuePoint {
  /** UTC day, "YYYY-MM-DD". */
  date: string;
  /** Every order placed that day that has not failed. */
  booked: number;
  /** The subset already marked paid. */
  paid: number;
  orders: number;
}

async function revenueStats(days: number): Promise<RevenuePoint[]> {
  const span = Math.min(Math.max(1, Math.trunc(days)), MAX_RANGE_DAYS);
  const since = startOfUtcDay(new Date(Date.now() - (span - 1) * 24 * 60 * 60 * 1000));

  // Two columns over a bounded window, bucketed in JS.
  //
  // Postgres could do this with date_trunc and GROUP BY, but that needs
  // $queryRaw, and this codebase deliberately has zero raw SQL — every value
  // below would be interpolated into a string that an admin-facing dashboard
  // then trusts. At this shop's volume (tens of orders a day) pulling the rows
  // is cheaper than the risk. If a single day ever exceeds a few thousand
  // orders, move this one query to a typed `prisma.$queryRaw` with a tagged
  // template, never string concatenation.
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: undefined }, paymentStatus: { not: "FAILED" } },
    select: { createdAt: true, totalAmount: true, paymentStatus: true },
    orderBy: { createdAt: "asc" },
  });

  // Pre-seed every day so the chart has no gaps — a missing day would make
  // recharts join across it and imply a trend that never happened.
  const buckets = new Map<string, RevenuePoint>();
  for (let i = 0; i < span; i++) {
    const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(dayKey(day), { date: dayKey(day), booked: 0, paid: 0, orders: 0 });
  }

  for (const order of orders) {
    const bucket = buckets.get(dayKey(order.createdAt));
    if (!bucket) continue;
    const amount = Number(order.totalAmount);
    bucket.booked += amount;
    bucket.orders += 1;
    if (order.paymentStatus === "PAID") bucket.paid += amount;
  }

  return [...buckets.values()].map((b) => ({
    ...b,
    booked: round2(b.booked),
    paid: round2(b.paid),
  }));
}

export const getRevenueStats = (days: number) =>
  unstable_cache(revenueStats, ["admin-revenue-stats"], {
    revalidate: ANALYTICS_TTL_SECONDS,
    tags: [ADMIN_ANALYTICS_TAG],
  })(days);

// ---------------------------------------------------------------------------
// Cylinder debt
// ---------------------------------------------------------------------------

export interface CylinderDebtor {
  userId: string;
  name: string | null;
  email: string | null;
  companyName: string | null;
  borrowed: number;
  returned: number;
  /** borrowed − returned. Only debtors (> 0) are listed. */
  outstanding: number;
}

export interface CylinderDebt {
  /** Every cylinder currently out with customers. */
  totalOutstanding: number;
  totalBorrowed: number;
  totalReturned: number;
  /** How many customers hold at least one cylinder. */
  debtorCount: number;
  topDebtors: CylinderDebtor[];
}

async function cylinderDebt(limit: number): Promise<CylinderDebt> {
  // ONE grouped query for the whole ledger, whatever the customer count.
  //
  // The obvious alternative — list users, then sum each one's rows — is an
  // N+1 that grows with the customer base. groupBy pushes the arithmetic into
  // Postgres and returns at most (users × 4) small rows.
  //
  // Only BORROWED and RETURNED are summed. DEPOSIT_CHARGED and
  // DEPOSIT_REFUNDED sit in the same table because a deposit only ever moves
  // against a physical movement, but they are money, not cylinders: counting
  // them here would inflate the debt by every deposit ever taken.
  const grouped = await prisma.cylinderTransaction.groupBy({
    by: ["userId", "type"],
    where: { type: { in: ["BORROWED", "RETURNED"] } },
    _sum: { quantity: true },
  });

  const perUser = new Map<string, { borrowed: number; returned: number }>();
  for (const row of grouped) {
    const entry = perUser.get(row.userId) ?? { borrowed: 0, returned: 0 };
    const qty = row._sum.quantity ?? 0;
    if (row.type === "BORROWED") entry.borrowed += qty;
    else entry.returned += qty;
    perUser.set(row.userId, entry);
  }

  let totalBorrowed = 0;
  let totalReturned = 0;
  const balances: Array<{ userId: string; borrowed: number; returned: number; outstanding: number }> = [];

  for (const [userId, { borrowed, returned }] of perUser) {
    totalBorrowed += borrowed;
    totalReturned += returned;
    const outstanding = borrowed - returned;
    // A negative balance means more returned than borrowed — a data error or
    // a goodwill credit. Excluded from the debtor list (they owe nothing) but
    // deliberately still counted in the totals, so the global figure matches
    // the ledger rather than quietly hiding a correction.
    if (outstanding > 0) balances.push({ userId, borrowed, returned, outstanding });
  }

  balances.sort((a, b) => b.outstanding - a.outstanding || a.userId.localeCompare(b.userId));
  const top = balances.slice(0, Math.min(Math.max(1, limit), 50));

  // One follow-up query for just the names being shown — not for every user
  // in the ledger.
  const users = top.length
    ? await prisma.user.findMany({
        where: { id: { in: top.map((t) => t.userId) } },
        select: { id: true, name: true, email: true, companyName: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    totalOutstanding: Math.max(0, totalBorrowed - totalReturned),
    totalBorrowed,
    totalReturned,
    debtorCount: balances.length,
    topDebtors: top.map((t) => ({
      userId: t.userId,
      name: byId.get(t.userId)?.name ?? null,
      email: byId.get(t.userId)?.email ?? null,
      companyName: byId.get(t.userId)?.companyName ?? null,
      borrowed: t.borrowed,
      returned: t.returned,
      outstanding: t.outstanding,
    })),
  };
}

export const getCylinderDebt = (limit = 5) =>
  unstable_cache(cylinderDebt, ["admin-cylinder-debt"], {
    revalidate: ANALYTICS_TTL_SECONDS,
    tags: [ADMIN_ANALYTICS_TAG],
  })(limit);

// ---------------------------------------------------------------------------
// Top products
// ---------------------------------------------------------------------------

export interface TopProduct {
  productId: string;
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface TopProducts {
  byVolume: TopProduct[];
  byRevenue: TopProduct[];
}

async function topProducts(limit: number, days: number): Promise<TopProducts> {
  const span = Math.min(Math.max(1, Math.trunc(days)), MAX_RANGE_DAYS);
  const since = startOfUtcDay(new Date(Date.now() - (span - 1) * 24 * 60 * 60 * 1000));

  // Revenue is Σ(priceAtPurchase × quantity), a per-row product that Prisma's
  // groupBy cannot express — `_sum` takes a column, not an expression. So the
  // rows are fetched (three small columns, bounded by the window) and summed
  // here. Using the frozen `priceAtPurchase` rather than today's catalogue
  // price is the point: repricing a product must not rewrite last month's
  // revenue.
  const items = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: since }, paymentStatus: { not: "FAILED" } } },
    select: {
      productId: true,
      quantity: true,
      priceAtPurchase: true,
      product: { select: { sku: true, name: true } },
    },
  });

  const totals = new Map<string, TopProduct>();
  for (const item of items) {
    const entry =
      totals.get(item.productId) ??
      {
        productId: item.productId,
        sku: item.product.sku,
        name: item.product.name,
        units: 0,
        revenue: 0,
      };
    entry.units += item.quantity;
    entry.revenue += Number(item.priceAtPurchase) * item.quantity;
    totals.set(item.productId, entry);
  }

  const all = [...totals.values()].map((t) => ({ ...t, revenue: round2(t.revenue) }));
  const cap = Math.min(Math.max(1, limit), 50);

  return {
    byVolume: [...all].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, cap),
    byRevenue: [...all].sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, cap),
  };
}

export const getTopProducts = (limit = 5, days = 90) =>
  unstable_cache(topProducts, ["admin-top-products"], {
    revalidate: ANALYTICS_TTL_SECONDS,
    tags: [ADMIN_ANALYTICS_TAG],
  })(limit, days);

// ---------------------------------------------------------------------------
// Quick stats
// ---------------------------------------------------------------------------

export interface QuickStat {
  value: number;
  /** Percent change vs the comparison period; null when there is no baseline. */
  trendPercent: number | null;
  /** What the trend is measured against, for the card's caption. */
  comparedTo: string;
}

export interface QuickStats {
  monthRevenue: QuickStat;
  activeOrders: QuickStat;
  pendingInvoices: QuickStat;
  cylindersInCirculation: QuickStat;
}

/**
 * Percent change, with the two cases that make naive trend maths lie:
 * a zero baseline is "no comparison", not +100%, and 0 → 0 is flat, not NaN.
 */
function trend(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function quickStats(): Promise<QuickStats> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [thisMonth, lastMonth, activeOrders, pendingInvoices, ledger] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: monthStart }, paymentStatus: { not: "FAILED" } },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: prevMonthStart, lt: monthStart }, paymentStatus: { not: "FAILED" } },
      _sum: { totalAmount: true },
    }),
    prisma.order.count({ where: { status: { in: ["PENDING", "IN_TRANSIT"] } } }),
    prisma.invoice.count({ where: { status: "PENDING" } }),
    prisma.cylinderTransaction.groupBy({
      by: ["type"],
      where: { type: { in: ["BORROWED", "RETURNED"] } },
      _sum: { quantity: true },
    }),
  ]);

  const borrowed = ledger.find((r) => r.type === "BORROWED")?._sum.quantity ?? 0;
  const returned = ledger.find((r) => r.type === "RETURNED")?._sum.quantity ?? 0;

  const current = round2(Number(thisMonth._sum.totalAmount ?? 0));
  const previous = round2(Number(lastMonth._sum.totalAmount ?? 0));

  return {
    monthRevenue: { value: current, trendPercent: trend(current, previous), comparedTo: "last month" },
    // Point-in-time counts: there is no meaningful prior value to compare a
    // live queue against, and inventing one would be a decorative number on
    // an operational dashboard.
    activeOrders: { value: activeOrders, trendPercent: null, comparedTo: "now" },
    pendingInvoices: { value: pendingInvoices, trendPercent: null, comparedTo: "now" },
    cylindersInCirculation: {
      value: Math.max(0, borrowed - returned),
      trendPercent: null,
      comparedTo: "now",
    },
  };
}

export const getQuickStats = () =>
  unstable_cache(quickStats, ["admin-quick-stats"], {
    revalidate: ANALYTICS_TTL_SECONDS,
    tags: [ADMIN_ANALYTICS_TAG],
  })();
