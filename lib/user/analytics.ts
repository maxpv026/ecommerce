import "server-only";

import { cache } from "react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getCylinderLedger } from "@/lib/invoicing";
import {
  HIGH_GWP_THRESHOLD,
  calculateOrderCo2e,
  getCustomerComplianceSummary,
  kgToTonnes,
  type RefrigerantBreakdown,
} from "@/lib/compliance";

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

/* ── Cylinder balance ─────────────────────────────────────────────────── */

export interface CylinderBalance {
  borrowed: number;
  returned: number;
  /** borrowed − returned: what is still out on this account. */
  outstanding: number;
  /** Mass-weighted mean deposit actually charged, EUR. */
  depositPerCylinder: number;
  /** Refundable on return. */
  depositHeldEur: number;
}

export async function getUserCylinderBalance(): Promise<CylinderBalance> {
  const userId = await currentUserId();
  const zero: CylinderBalance = {
    borrowed: 0,
    returned: 0,
    outstanding: 0,
    depositPerCylinder: 0,
    depositHeldEur: 0,
  };
  if (!userId) return zero;

  const [ledger, depositRows] = await Promise.all([
    getCylinderLedger(userId),
    prisma.orderItem.findMany({
      where: { order: { userId, ...REAL_ORDER }, depositAtPurchase: { gt: 0 } },
      select: { quantity: true, depositAtPurchase: true },
    }),
  ]);

  // Read from what this account was actually charged rather than assuming the
  // €15 default: the deposit is a per-product column, so a future product on
  // a different rate must not mis-state what is owed back.
  const units = depositRows.reduce((n, r) => n + r.quantity, 0);
  const charged = depositRows.reduce((sum, r) => sum + Number(r.depositAtPurchase) * r.quantity, 0);
  const depositPerCylinder = units > 0 ? round(charged / units) : 0;

  return {
    borrowed: ledger.borrowed,
    returned: ledger.returned,
    outstanding: ledger.inPossession,
    depositPerCylinder,
    depositHeldEur: round(ledger.inPossession * depositPerCylinder),
  };
}

/* ── GWP footprint ────────────────────────────────────────────────────── */

export interface GwpFootprint {
  /** Descending by CO2e — the donut's slices, biggest contributor first. */
  byRefrigerant: RefrigerantBreakdown[];
  totalCo2eTonnes: number;
  totalMassKg: number;
  /** Share (0–1) in gases at or above the Art. 13 GWP limit. */
  highGwpShare: number;
  highGwpTonnes: number;
  highGwpRefrigerants: string[];
  /** Lines we could not cost. Surfaced, never folded in as zero. */
  unknownGwpLines: number;
}

/**
 * The footprint, all-time, per gas.
 *
 * All-time rather than year-to-date because this feeds a donut: a buyer
 * showing management "which gases are my carbon" wants their whole history,
 * and a YTD slice in January would read as near-zero emissions.
 *
 * `cache()`-wrapped because /hub wants it three times in one render — the
 * donut, the insight column's "you buy this gas" matching, and the briefing's
 * personalisation — and it fans out into a join across every order line on the
 * account. It takes no arguments, so the dedupe is exact.
 */
export const getUserGWPFootprint = cache(async function getUserGWPFootprint(): Promise<GwpFootprint> {
  const userId = await currentUserId();
  const empty: GwpFootprint = {
    byRefrigerant: [],
    totalCo2eTonnes: 0,
    totalMassKg: 0,
    highGwpShare: 0,
    highGwpTonnes: 0,
    highGwpRefrigerants: [],
    unknownGwpLines: 0,
  };
  if (!userId) return empty;

  const summary = await getCustomerComplianceSummary(userId, { period: "all" });

  return {
    byRefrigerant: summary.byRefrigerant,
    totalCo2eTonnes: summary.allTime.co2eTonnes,
    totalMassKg: summary.allTime.massKg,
    highGwpShare: summary.highGwp.share,
    highGwpTonnes: summary.highGwp.co2eTonnes,
    highGwpRefrigerants: summary.highGwp.refrigerants,
    unknownGwpLines: summary.record.unknownGwpLines,
  };
});

/* ── Greener alternatives, from the real catalogue ────────────────────── */

export interface GreenerAlternative {
  /** The high-GWP gas the buyer actually purchased. */
  from: string;
  fromGwp: number;
  /** A lower-GWP gas we genuinely stock and can sell today. */
  to: string;
  toGwp: number;
  /** Percentage reduction in GWP, e.g. 64 for 3922 → 1397. */
  reductionPercent: number;
}

/**
 * Lower-GWP gases this shop can actually sell, for each high-GWP gas the
 * buyer bought.
 *
 * Resolved against the catalogue on purpose. The AI summary is asked to
 * suggest greener alternatives, and a model left to its own knowledge will
 * confidently name a gas we do not stock — the same failure the F-Gas
 * assistant's suggestProduct tool exists to prevent. Handing it real,
 * purchasable rows means the recommendation is actionable rather than
 * plausible.
 *
 * "Purchasable" is the same rule the rest of the shop uses: in stock, some
 * quantity on hand, and a price.
 */
export async function getGreenerAlternatives(
  footprint: GwpFootprint
): Promise<GreenerAlternative[]> {
  const high = footprint.byRefrigerant.filter((r) => r.highGwp && r.gwp !== null);
  if (high.length === 0) return [];

  const sellable = await prisma.product.findMany({
    where: {
      inStock: true,
      stockQuantity: { gt: 0 },
      pricePerKg: { gt: 0 },
      gwp: { not: null },
      category: { in: ["cylinders", "blends"] },
    },
    select: { name: true, gwp: true },
    orderBy: { gwp: "asc" },
  });

  const out: GreenerAlternative[] = [];
  for (const gas of high) {
    const fromGwp = gas.gwp as number;
    // Lowest-GWP sellable gas that is a genuine improvement. No claim is made
    // that it is a drop-in retrofit — that is an engineering decision the
    // F-Gas assistant answers from the knowledge base, not a figure to infer
    // from a GWP comparison.
    const best = sellable.find((p) => (p.gwp as number) < fromGwp);
    if (!best) continue;
    const toGwp = best.gwp as number;
    out.push({
      from: gas.refrigerant,
      fromGwp,
      to: best.name.split(" ")[0] || best.name,
      toGwp,
      reductionPercent: Math.round(((fromGwp - toGwp) / fromGwp) * 100),
    });
  }
  return out;
}

export { HIGH_GWP_THRESHOLD };
