import "server-only";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { calculateOrderCo2e, kgToTonnes } from "@/lib/compliance";

/**
 * The client-facing analytics dashboard's data layer.
 *
 * ── Why these resolve the session themselves ───────────────────────────
 *
 * Every function here reads `auth()` rather than taking a userId. On a
 * customer-facing dashboard that removes a whole class of bug: there is no
 * parameter to pass wrong, so no page, route or future refactor can hand one
 * buyer another buyer's figures. The cost is that they cannot be called for
 * an arbitrary user — which is the point. Admin-side aggregates already have
 * their own module (lib/admin/analytics.ts) behind requireAdmin().
 *
 * ── Why the CO2e maths is not repeated here ────────────────────────────
 *
 * GWP is a real, populated column (Product.gwp) and every order line carries
 * `gwpAtPurchase` + `co2eKg` snapshots, so there is nothing to mock. More
 * importantly, lib/compliance.ts already owns that arithmetic and it is what
 * prints on the signed audit PDF. A second implementation here would give a
 * buyer two different CO2e numbers for the same purchases — one on screen,
 * one on the document they hand an auditor. So the footprint functions below
 * delegate; only the spend trend is new.
 */

/** Orders that count as real spend. Matches the revenue aggregations. */
const REAL_ORDER = { paymentStatus: { not: "FAILED" } } as const;

function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/* ── Spend trend ──────────────────────────────────────────────────────── */

export interface SpendPoint {
  /** "2026-03" — sortable, and the chart formats it for display. */
  month: string;
  /** Gross charged in EUR: goods + deposit + freight + VAT. */
  spend: number;
  orders: number;
  /** Cylinders of refrigerant taken that month. */
  cylinders: number;
  /** Net kg of gas. */
  massKg: number;
  /** Tonnes CO2e, from the same engine as the audit report. */
  co2eTonnes: number;
}

/**
 * Monthly spend and volume for the signed-in buyer.
 *
 * Every month in the window is present, including months with no orders —
 * a bar chart that silently omits empty months compresses the time axis and
 * makes a quiet quarter look like a busy one.
 *
 * Grouped in JS rather than with `groupBy`: the month buckets have to agree
 * with the per-line CO2e and cylinder counts, and Prisma cannot aggregate
 * across the order→item join in one pass. The row count here is one buyer's
 * order lines over a year, so this is not the place to optimise.
 */
export async function getUserSpendTrend(months = 12): Promise<SpendPoint[]> {
  const userId = await currentUserId();
  const window = Math.min(Math.max(1, Math.trunc(months)), 36);

  // Start of the month `window - 1` months back, in UTC — so "12 months"
  // means 12 calendar buckets including the current one, not 365 days.
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (window - 1), 1));

  const buckets = new Map<string, SpendPoint>();
  for (let i = 0; i < window; i += 1) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { month: key, spend: 0, orders: 0, cylinders: 0, massKg: 0, co2eTonnes: 0 });
  }

  if (!userId) return [...buckets.values()];

  const orders = await prisma.order.findMany({
    where: { userId, ...REAL_ORDER, createdAt: { gte: from } },
    select: {
      createdAt: true,
      totalAmount: true,
      items: {
        select: {
          quantity: true,
          weightKgAtPurchase: true,
          gwpAtPurchase: true,
          product: { select: { name: true, sku: true, gwp: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const order of orders) {
    const key = `${order.createdAt.getUTCFullYear()}-${String(order.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    // An order can fall outside the window by a hair if the clock moved
    // between building the buckets and the query returning; skip rather than
    // inventing a bucket the chart's axis does not know about.
    if (!bucket) continue;

    const costed = calculateOrderCo2e(order.items);
    bucket.orders += 1;
    bucket.spend = round(bucket.spend + Number(order.totalAmount));
    bucket.massKg = round(bucket.massKg + costed.totalMassKg, 2);
    bucket.co2eTonnes = round(bucket.co2eTonnes + kgToTonnes(costed.totalCo2eKg), 3);
    bucket.cylinders += costed.lines.reduce((n, l) => n + (l.isGas ? l.quantity : 0), 0);
  }

  return [...buckets.values()];
}
