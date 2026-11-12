import "server-only";

import prisma from "@/lib/prisma";
import { LISTED } from "@/lib/productFamily";
import { cylinderGasPrice, isPricedPerKg } from "@/lib/pricing";
import { orderBreakdown } from "@/lib/orderTotals";

/**
 * The accountant's three pillars — product turnover, the revenue ledger and
 * the customer base — computed from the orders' frozen purchase snapshots
 * (priceAtPurchase, weightKgAtPurchase, depositAtPurchase) and the frozen
 * order total, exactly as the invoices are. FAILED payments are not sales.
 *
 * Read-only. Callers are gated by "analytics.view" / "finance.export".
 */

/** A scan bound: an accounting screen must never table-scan unbounded history. */
const MAX_ORDERS = 20_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AccountingRange = 30 | 90 | 365 | 0; // 0 = all time
export const ACCOUNTING_RANGES: readonly AccountingRange[] = [30, 90, 365, 0];
export const parseRange = (raw: unknown): AccountingRange => {
  const n = Number(raw);
  return (ACCOUNTING_RANGES as readonly number[]).includes(n) ? (n as AccountingRange) : 90;
};
const since = (range: AccountingRange) => (range === 0 ? undefined : new Date(Date.now() - range * 86_400_000));

async function loadOrders(range: AccountingRange) {
  return prisma.order.findMany({
    where: { paymentStatus: { not: "FAILED" }, ...(since(range) ? { createdAt: { gte: since(range) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: MAX_ORDERS,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      paidAt: true,
      totalAmount: true,
      userId: true,
      user: { select: { name: true, email: true, companyName: true, vatNumber: true } },
      items: {
        select: {
          quantity: true,
          priceAtPurchase: true,
          weightKgAtPurchase: true,
          depositAtPurchase: true,
          co2eKg: true,
          product: { select: { id: true, sku: true, name: true, weight: true, category: true } },
        },
      },
    },
  });
}
type OrderRows = Awaited<ReturnType<typeof loadOrders>>;

const breakdownOf = (o: OrderRows[number]) =>
  orderBreakdown(
    o.items.map((i) => ({ priceAtPurchase: Number(i.priceAtPurchase), quantity: i.quantity, depositAtPurchase: Number(i.depositAtPurchase) })),
    Number(o.totalAmount)
  );

// ── 1. Product turnover ──────────────────────────────────────────────────

export interface TurnoverRow {
  sku: string;
  name: string;
  variant: string;
  units: number;
  netKg: number;
  revenue: number;
  deposits: number;
  /** Share of goods revenue, 0–1. */
  share: number;
}

export interface Turnover {
  rows: TurnoverRow[];
  totals: { units: number; netKg: number; revenue: number; deposits: number; co2eT: number };
  /** Stock on hand at today's list prices, excl. VAT. */
  inventory: { units: number; netKg: number; valuation: number; skus: number };
}

function turnoverOf(orders: OrderRows): Omit<Turnover, "inventory"> {
  const bySku = new Map<string, TurnoverRow>();
  let co2eKg = 0;
  for (const o of orders) {
    for (const i of o.items) {
      const row = bySku.get(i.product.sku) ?? { sku: i.product.sku, name: i.product.name, variant: i.product.weight, units: 0, netKg: 0, revenue: 0, deposits: 0, share: 0 };
      row.units += i.quantity;
      if (isPricedPerKg(i.product.category)) row.netKg += i.weightKgAtPurchase * i.quantity;
      row.revenue += Number(i.priceAtPurchase) * i.quantity;
      row.deposits += Number(i.depositAtPurchase) * i.quantity;
      bySku.set(i.product.sku, row);
      co2eKg += i.co2eKg;
    }
  }
  const rows = [...bySku.values()].sort((a, b) => b.revenue - a.revenue);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  for (const r of rows) {
    r.share = revenue > 0 ? r.revenue / revenue : 0;
    r.netKg = r2(r.netKg);
    r.revenue = r2(r.revenue);
    r.deposits = r2(r.deposits);
  }
  return {
    rows,
    totals: {
      units: rows.reduce((n, r) => n + r.units, 0),
      netKg: r2(rows.reduce((n, r) => n + r.netKg, 0)),
      revenue: r2(revenue),
      deposits: r2(rows.reduce((n, r) => n + r.deposits, 0)),
      co2eT: r2(co2eKg / 1000),
    },
  };
}

async function inventoryValuation(): Promise<Turnover["inventory"]> {
  const products = await prisma.product.findMany({
    where: { ...LISTED, stockQuantity: { gt: 0 } },
    select: { stockQuantity: true, pricePerKg: true, weightKg: true, category: true },
  });
  return {
    skus: products.length,
    units: products.reduce((n, p) => n + p.stockQuantity, 0),
    netKg: r2(products.reduce((n, p) => n + (isPricedPerKg(p.category) ? p.weightKg * p.stockQuantity : 0), 0)),
    valuation: r2(products.reduce((n, p) => n + cylinderGasPrice(p.pricePerKg, p.weightKg) * p.stockQuantity, 0)),
  };
}

// ── 2. Purchase & revenue ledger ─────────────────────────────────────────

export interface Ledger {
  orders: number;
  /** Charged totals incl. VAT, freight and deposits. */
  gross: number;
  /** Goods net of VAT. */
  net: number;
  vat: number;
  shipping: number;
  deposits: number;
  aov: number;
  paid: { count: number; amount: number };
  unpaid: { count: number; amount: number };
  byStatus: Record<"PENDING" | "IN_TRANSIT" | "DELIVERED", number>;
}

function ledgerOf(orders: OrderRows): Ledger {
  const l: Ledger = { orders: orders.length, gross: 0, net: 0, vat: 0, shipping: 0, deposits: 0, aov: 0, paid: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 }, byStatus: { PENDING: 0, IN_TRANSIT: 0, DELIVERED: 0 } };
  for (const o of orders) {
    const b = breakdownOf(o);
    l.gross += b.total;
    l.net += b.subtotal;
    l.vat += b.vat;
    l.shipping += b.shipping;
    l.deposits += b.deposit;
    l.byStatus[o.status] += 1;
    const bucket = o.paymentStatus === "PAID" ? l.paid : l.unpaid;
    bucket.count += 1;
    bucket.amount += b.total;
  }
  for (const k of ["gross", "net", "vat", "shipping", "deposits"] as const) l[k] = r2(l[k]);
  l.paid.amount = r2(l.paid.amount);
  l.unpaid.amount = r2(l.unpaid.amount);
  l.aov = l.orders > 0 ? r2(l.gross / l.orders) : 0;
  return l;
}

// ── 3. Customers ─────────────────────────────────────────────────────────

export interface TopBuyer {
  name: string;
  company: string | null;
  orders: number;
  netKg: number;
  revenue: number;
}

export interface CustomerStats {
  customers: number;
  /** Customers with at least one order in the period. */
  activeBuyers: number;
  /** Of the active buyers, the share with two or more orders. */
  repeatRate: number;
  verifiedCompanies: number;
  top: TopBuyer[];
}

async function customersOf(orders: OrderRows): Promise<CustomerStats> {
  const [customers, verifiedCompanies] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.user.count({ where: { role: "USER", fGasStatus: "VERIFIED" } }),
  ]);
  const byBuyer = new Map<string, TopBuyer>();
  for (const o of orders) {
    const b = byBuyer.get(o.userId) ?? { name: o.user.name ?? o.user.email ?? "—", company: o.user.companyName, orders: 0, netKg: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += breakdownOf(o).subtotal;
    b.netKg += o.items.reduce((n, i) => n + (isPricedPerKg(i.product.category) ? i.weightKgAtPurchase * i.quantity : 0), 0);
    byBuyer.set(o.userId, b);
  }
  const buyers = [...byBuyer.values()];
  return {
    customers,
    activeBuyers: buyers.length,
    repeatRate: buyers.length ? buyers.filter((b) => b.orders >= 2).length / buyers.length : 0,
    verifiedCompanies,
    top: buyers
      .map((b) => ({ ...b, netKg: r2(b.netKg), revenue: r2(b.revenue) }))
      .sort((a, b) => b.netKg - a.netKg || b.revenue - a.revenue)
      .slice(0, 8),
  };
}

export interface AccountingReport {
  range: AccountingRange;
  turnover: Turnover;
  ledger: Ledger;
  customers: CustomerStats;
  /** True when the scan bound was reached and older orders are not included. */
  truncated: boolean;
}

export async function getAccountingReport(range: AccountingRange): Promise<AccountingReport> {
  const orders = await loadOrders(range);
  const [inventory, customers] = await Promise.all([inventoryValuation(), customersOf(orders)]);
  return { range, turnover: { ...turnoverOf(orders), inventory }, ledger: ledgerOf(orders), customers, truncated: orders.length >= MAX_ORDERS };
}

// ── CSV ledger ───────────────────────────────────────────────────────────

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote when needed; neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per order in the period, with the invoice breakdown. */
export async function accountingCsv(range: AccountingRange): Promise<string> {
  const orders = await loadOrders(range);
  const header = ["order_number", "created_at", "customer", "company", "vat_id", "status", "payment_status", "paid_at", "goods_net_eur", "deposits_eur", "adr_freight_net_eur", "vat_eur", "total_eur", "cylinders", "net_kg"];
  const lines = orders.map((o) => {
    const b = breakdownOf(o);
    const units = o.items.reduce((n, i) => n + i.quantity, 0);
    const kg = o.items.reduce((n, i) => n + (isPricedPerKg(i.product.category) ? i.weightKgAtPurchase * i.quantity : 0), 0);
    return [
      o.orderNumber,
      o.createdAt.toISOString(),
      o.user.name ?? o.user.email,
      o.user.companyName,
      o.user.vatNumber,
      o.status,
      o.paymentStatus,
      o.paidAt?.toISOString() ?? "",
      b.subtotal.toFixed(2),
      b.deposit.toFixed(2),
      b.shipping.toFixed(2),
      b.vat.toFixed(2),
      b.total.toFixed(2),
      units,
      r2(kg).toFixed(2),
    ].map(csvCell).join(",");
  });
  // BOM: Excel opens UTF-8 (Cyrillic names, €) correctly only with it.
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}
