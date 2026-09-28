import "server-only";

import prisma from "@/lib/prisma";
import { getCylinderLedger } from "@/lib/invoicing";

/**
 * F-Gas carbon accounting for a customer's purchase history.
 *
 * ── What this measures, and what it does not ───────────────────────────
 *
 * This computes the CO2-equivalent of the refrigerant a customer has BOUGHT
 * from us. That is a real, defensible figure and useful evidence toward the
 * record-keeping an operator owes under Art. 6 of Regulation 517/2014.
 *
 * It is NOT a statement of regulatory compliance, and the distinction matters
 * enough to state in code:
 *
 *   • F-Gas QUOTAS apply to producers and importers placing HFCs on the EU
 *     market. A contractor buying cylinders has no purchase quota, so there
 *     is no "quota used" figure to show a buyer.
 *   • The 5 / 50 / 500 tonne CO2e thresholds set LEAK-CHECK FREQUENCY for one
 *     installed system, based on that system's charge. They say nothing about
 *     what a company bought in a year. A buyer who purchased 60 t CO2e across
 *     forty sites has crossed no threshold at all.
 *   • We know what left our warehouse. We do not know their installed base,
 *     what was recovered, or what is still in a cylinder on a van. Nothing
 *     here can conclude "compliant".
 *
 * The one threshold that genuinely tracks what a customer BUYS is the Art. 13
 * service ban on virgin HFCs with GWP >= 2500 — see HIGH_GWP_THRESHOLD below.
 * That is the only regulatory line this module evaluates.
 */

/** Kilograms of CO2e in one metric tonne. Tonnes are display-only. */
export const CO2E_KG_PER_TONNE = 1000;

/**
 * Regulation 517/2014 Art. 13: since 1 January 2020, virgin HFCs with a GWP
 * of 2500 or more may not be used to service refrigeration equipment with a
 * charge of 40 tonnes CO2e or more. Reclaimed and recycled gas is exempt.
 *
 * This is about the gas itself, so it is the one line we can evaluate from
 * purchase history alone.
 */
export const HIGH_GWP_THRESHOLD = 2500;

/**
 * Leak-check intervals by system charge (Art. 4). Reference only — these
 * apply per installed system, never to a purchase total. Exported so the UI
 * can show them as context without this module pretending to evaluate them.
 */
export const LEAK_CHECK_THRESHOLDS_TONNES = [5, 50, 500] as const;

/** Where a line's GWP came from. Reported, never silently assumed. */
export type GwpSource = "snapshot" | "catalogue" | "unknown";

/**
 * Catalogue categories that are actually refrigerant.
 *
 * Category, not weight, decides this. Equipment carries weightKg = 1 so that
 * `pricePerKg × weightKg` yields its unit price (see the Product model) — that
 * 1 is a pricing unit, not a kilogram of gas. Testing `weightKg > 0` counted a
 * 4-valve manifold as an uncosted refrigerant line and put "4-Valve" in the
 * gas breakdown.
 */
const GAS_CATEGORIES = new Set(["cylinders", "blends"]);

/** The minimum an item must carry to be costed. Structural, so it is testable without Prisma. */
export interface Co2eInputItem {
  quantity: number;
  /** Net kg of gas in one unit, as snapshotted on the order line. */
  weightKgAtPurchase: number;
  /** GWP snapshotted at purchase. Null on equipment and on pre-migration rows. */
  gwpAtPurchase?: number | null;
  product?: {
    name?: string | null;
    sku?: string | null;
    gwp?: number | null;
    category?: string | null;
  } | null;
}

export interface Co2eLine {
  sku: string;
  name: string;
  /** False for equipment: no footprint, and not a gap in the record either. */
  isGas: boolean;
  quantity: number;
  /** Net kg of gas per unit. */
  unitMassKg: number;
  /** quantity × unitMassKg. */
  massKg: number;
  gwp: number | null;
  gwpSource: GwpSource;
  /** massKg × gwp, in kilograms of CO2e. 0 when the GWP is unknown. */
  co2eKg: number;
}

export interface Co2eResult {
  lines: Co2eLine[];
  totalCo2eKg: number;
  totalMassKg: number;
  /**
   * Lines we could not cost because no GWP exists anywhere for them.
   *
   * Surfaced rather than folded into the total as zero: on an audit document
   * a silent zero understates emissions, which is the one direction an
   * environmental figure must never be wrong in.
   */
  unknownGwpLines: number;
  /** Lines costed from the live catalogue because the order predates the snapshot column. */
  estimatedLines: number;
}

function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export function kgToTonnes(co2eKg: number): number {
  return round(co2eKg / CO2E_KG_PER_TONNE, 3);
}

/**
 * Costs a set of order lines.
 *
 * GWP resolution is deliberate: the purchase-time snapshot wins, the live
 * catalogue value is the fallback for rows written before that column
 * existed, and anything with neither is counted as unknown rather than zero.
 * `gwpSource` travels with every line so a report can say which figures are
 * recorded and which are reconstructed.
 *
 * Equipment (a manifold, a recovery cylinder) has no GWP by definition; it
 * contributes no CO2e and is not an "unknown" — only gas with a missing
 * figure is. Which is which comes from the catalogue category, not from the
 * weight: see GAS_CATEGORIES for why weight cannot be used here.
 */
export function calculateOrderCo2e(items: Co2eInputItem[]): Co2eResult {
  const lines: Co2eLine[] = [];
  let totalCo2eKg = 0;
  let totalMassKg = 0;
  let unknownGwpLines = 0;
  let estimatedLines = 0;

  for (const item of items) {
    const quantity = Math.max(0, Math.trunc(item.quantity ?? 0));
    const unitMassKg = Number(item.weightKgAtPurchase ?? 0);
    const massKg = round(unitMassKg * quantity, 3);

    let gwp: number | null = null;
    let gwpSource: GwpSource = "unknown";
    if (typeof item.gwpAtPurchase === "number" && item.gwpAtPurchase > 0) {
      gwp = item.gwpAtPurchase;
      gwpSource = "snapshot";
    } else if (typeof item.product?.gwp === "number" && item.product.gwp > 0) {
      gwp = item.product.gwp;
      gwpSource = "catalogue";
    }

    // Category decides what counts as refrigerant — see GAS_CATEGORIES.
    const isGas = GAS_CATEGORIES.has(item.product?.category ?? "");
    if (isGas && quantity > 0 && gwp === null) unknownGwpLines += 1;

    if (isGas && gwpSource === "catalogue") estimatedLines += 1;

    const co2eKg = !isGas || gwp === null ? 0 : round(massKg * gwp, 3);

    totalCo2eKg += co2eKg;
    // Only gas contributes to refrigerant mass; a manifold's pricing unit does not.
    if (isGas) totalMassKg += massKg;

    lines.push({
      sku: item.product?.sku ?? "—",
      name: item.product?.name ?? "—",
      isGas,
      quantity,
      unitMassKg,
      massKg: isGas ? massKg : 0,
      gwp: isGas ? gwp : null,
      gwpSource: isGas ? gwpSource : "unknown",
      co2eKg,
    });
  }

  return {
    lines,
    totalCo2eKg: round(totalCo2eKg, 3),
    totalMassKg: round(totalMassKg, 3),
    unknownGwpLines,
    estimatedLines,
  };
}

export interface RefrigerantBreakdown {
  /** Refrigerant mark, e.g. "R-410A" — the leading token of the product name. */
  refrigerant: string;
  gwp: number | null;
  /**
   * Mass-weighted mean GWP actually applied: co2eKg / massKg.
   *
   * Usually identical to `gwp`, and deliberately not assumed to be. A mark's
   * published GWP gets revised, and because each line carries its own
   * `gwpAtPurchase`, two purchases of the same gas in different years can
   * legitimately carry different factors. This is the figure that reconciles
   * with the CO2e column; `gwp` is the current catalogue value.
   */
  avgGwp: number | null;
  massKg: number;
  co2eKg: number;
  co2eTonnes: number;
  /** Share of the period's total CO2e, 0–1. */
  share: number;
  /** True when this gas falls under the Art. 13 virgin-HFC service ban. */
  highGwp: boolean;
}

export interface CompliancePeriod {
  co2eKg: number;
  co2eTonnes: number;
  massKg: number;
  orderCount: number;
}

export type SummaryPeriod = "ytd" | "all";

export interface ComplianceSummary {
  generatedAt: Date;
  /** Which period `byRefrigerant` and `highGwp` describe. */
  period: SummaryPeriod;
  /** 1 January of the current year through now. */
  yearToDate: CompliancePeriod;
  allTime: CompliancePeriod;
  /** Descending by CO2e — the gases that dominate the footprint come first. */
  byRefrigerant: RefrigerantBreakdown[];
  /** Share of year-to-date CO2e in gases at or above the Art. 13 GWP limit. */
  highGwp: { co2eKg: number; co2eTonnes: number; share: number; refrigerants: string[] };
  /**
   * Whether every purchased line could be costed. This is the only honest
   * "status" available from purchase data — it describes OUR record, not the
   * customer's regulatory position.
   */
  record: { lines: number; unknownGwpLines: number; estimatedLines: number; complete: boolean };
}

/** Refrigerant mark from the product name: "R-410A Premium" → "R-410A". */
function refrigerantOf(name: string): string {
  return name.split(" ")[0] || name;
}

const startOfYear = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

/**
 * Everything the compliance dashboard and the audit PDF need, for one buyer.
 *
 * Orders with a FAILED payment are excluded — the same rule the revenue
 * aggregations use. Gas that was never paid for was never supplied, and
 * counting it would overstate the customer's footprint.
 */
export async function getCustomerComplianceSummary(
  userId: string,
  { period = "ytd", now = new Date() }: { period?: SummaryPeriod; now?: Date } = {}
): Promise<ComplianceSummary> {
  const orders = await prisma.order.findMany({
    where: { userId, paymentStatus: { not: "FAILED" } },
    select: {
      id: true,
      createdAt: true,
      items: {
        select: {
          quantity: true,
          weightKgAtPurchase: true,
          gwpAtPurchase: true,
          product: { select: { name: true, sku: true, gwp: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const since = startOfYear(now);

  const all = calculateOrderCo2e(orders.flatMap((o) => o.items));
  const ytdOrders = orders.filter((o) => o.createdAt >= since);
  const ytd = calculateOrderCo2e(ytdOrders.flatMap((o) => o.items));

  // The breakdown covers whichever period the caller asked for, so its shares
  // always reconcile with the headline figure shown beside it. Mixing periods
  // would produce a table whose percentages do not add up to the number above
  // it, which is the fastest way to lose an auditor's trust.
  const selected = period === "all" ? all : ytd;
  const periodTotal = selected.totalCo2eKg;

  const byMark = new Map<string, { gwp: number | null; massKg: number; co2eKg: number }>();
  for (const line of selected.lines) {
    if (!line.isGas) continue;
    const mark = refrigerantOf(line.name);
    const entry = byMark.get(mark) ?? { gwp: line.gwp, massKg: 0, co2eKg: 0 };
    entry.massKg = round(entry.massKg + line.massKg, 3);
    entry.co2eKg = round(entry.co2eKg + line.co2eKg, 3);
    if (entry.gwp === null) entry.gwp = line.gwp;
    byMark.set(mark, entry);
  }

  const byRefrigerant: RefrigerantBreakdown[] = [...byMark.entries()]
    .map(([refrigerant, v]) => ({
      refrigerant,
      gwp: v.gwp,
      massKg: v.massKg,
      co2eKg: v.co2eKg,
      avgGwp: v.massKg > 0 ? round(v.co2eKg / v.massKg, 1) : null,
      co2eTonnes: kgToTonnes(v.co2eKg),
      share: periodTotal > 0 ? round(v.co2eKg / periodTotal, 4) : 0,
      highGwp: v.gwp !== null && v.gwp >= HIGH_GWP_THRESHOLD,
    }))
    .sort((a, b) => b.co2eKg - a.co2eKg);

  const high = byRefrigerant.filter((r) => r.highGwp);
  const highCo2eKg = round(
    high.reduce((sum, r) => sum + r.co2eKg, 0),
    3
  );

  const toPeriod = (r: Co2eResult, orderCount: number): CompliancePeriod => ({
    co2eKg: r.totalCo2eKg,
    co2eTonnes: kgToTonnes(r.totalCo2eKg),
    massKg: r.totalMassKg,
    orderCount,
  });

  return {
    generatedAt: now,
    yearToDate: toPeriod(ytd, ytdOrders.length),
    allTime: toPeriod(all, orders.length),
    byRefrigerant,
    period,
    highGwp: {
      co2eKg: highCo2eKg,
      co2eTonnes: kgToTonnes(highCo2eKg),
      share: periodTotal > 0 ? round(highCo2eKg / periodTotal, 4) : 0,
      refrigerants: high.map((r) => r.refrigerant),
    },
    record: {
      lines: all.lines.filter((l) => l.isGas).length,
      unknownGwpLines: all.unknownGwpLines,
      estimatedLines: all.estimatedLines,
      complete: all.unknownGwpLines === 0,
    },
  };
}

/* ── Dashboard bundle ──────────────────────────────────────────────────── */

export interface CylinderHolding {
  /** Returnable cylinders still out on this account (borrowed − returned). */
  inPossession: number;
  /**
   * Mass-weighted mean deposit this account was actually charged, in EUR.
   *
   * Read from the customer's own order lines rather than assuming the €15
   * default: the deposit is a per-product column, so a future product with a
   * different rate must not silently mis-state what is owed back.
   */
  depositPerCylinder: number;
  /** inPossession × depositPerCylinder — refundable on return. */
  depositHeldEur: number;
}

export interface ComplianceDashboardData {
  summary: ComplianceSummary;
  cylinders: CylinderHolding;
}

/**
 * Everything /profile/compliance renders, in one round trip.
 *
 * Note what is deliberately NOT here: a "CO2e still held in your cylinders"
 * figure. A cylinder on a van may be full, part-used or empty, and we have no
 * way to know which — so the footprint card reports the deposit tied up in
 * returnable packaging, which is a fact, rather than an emissions figure that
 * would be a guess.
 */
export async function getComplianceDashboardData(
  userId: string,
  period: SummaryPeriod = "ytd"
): Promise<ComplianceDashboardData> {
  const [summary, ledger, depositRows] = await Promise.all([
    getCustomerComplianceSummary(userId, { period }),
    getCylinderLedger(userId),
    prisma.orderItem.findMany({
      where: { order: { userId, paymentStatus: { not: "FAILED" } }, depositAtPurchase: { gt: 0 } },
      select: { quantity: true, depositAtPurchase: true },
    }),
  ]);

  const units = depositRows.reduce((n, r) => n + r.quantity, 0);
  const charged = depositRows.reduce((sum, r) => sum + Number(r.depositAtPurchase) * r.quantity, 0);
  const depositPerCylinder = units > 0 ? round(charged / units) : 0;

  return {
    summary,
    cylinders: {
      inPossession: ledger.inPossession,
      depositPerCylinder,
      depositHeldEur: round(ledger.inPossession * depositPerCylinder),
    },
  };
}
