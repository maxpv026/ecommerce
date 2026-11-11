import "server-only";

import { randomInt } from "node:crypto";
import prisma from "@/lib/prisma";
import { requiresFgasCertificate } from "@/lib/fgasSubstances";
import type { QuoteStatus } from "@/lib/generated/prisma/enums";

/**
 * Instant B2B quotes — read side and the rules shared with checkout.
 * Creation lives in lib/actions/quotes; acceptance happens at checkout
 * (lib/orders prepareOrder/commitOrder), which charges the quoted prices.
 */

/** How long the prices on a quote are held. */
export const QUOTE_VALIDITY_HOURS = 48;

/** A user may issue this many quotes per rolling hour — each one is a stored document. */
export const QUOTES_PER_HOUR = 20;

// No 0/O or 1/I/L: the reference is read aloud and typed from paper.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** "QUO-2026-7KQ4". Collisions are caught by the unique index and retried. */
export function generateQuoteNumber(now = new Date()): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `QUO-${now.getUTCFullYear()}-${suffix}`;
}

/**
 * The status to show and to enforce. A PENDING quote past validUntil is
 * expired whether or not the stored column has caught up, so the 48-hour
 * limit never depends on a background job having run.
 */
export function effectiveQuoteStatus(quote: { status: QuoteStatus; validUntil: Date }, now = new Date()): QuoteStatus {
  return quote.status === "PENDING" && quote.validUntil.getTime() <= now.getTime() ? "EXPIRED" : quote.status;
}

/**
 * Whether a line is regulated refrigerant (EU 2024/573): sold — and so
 * quoted — only to a buyer with a verified F-Gas certificate. Gas is
 * anything priced by weight or carrying a GWP; tools and empty recovery
 * cylinders are not.
 */
/** @deprecated use requiresFgasCertificate (lib/fgasSubstances) — substance-based. */
export function isFGasProduct(product: { name: string; category: string; gwp: number | null }): boolean {
  return requiresFgasCertificate(product);
}

export interface QuoteLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  variant: string;
  quantity: number;
  pricePerKg: number;
  weightKg: number;
  unitPrice: number;
  deposit: number;
  lineTotal: number;
}

export interface QuoteView {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  createdAt: string;
  validUntil: string;
  buyerName: string | null;
  buyerEmail: string | null;
  companyName: string | null;
  vatNumber: string | null;
  subtotal: number;
  depositTotal: number;
  shippingAmount: number;
  vatAmount: number;
  totalAmount: number;
  orderId: string | null;
  orderNumber: string | null;
  items: QuoteLine[];
}

const QUOTE_SELECT = {
  id: true,
  quoteNumber: true,
  status: true,
  createdAt: true,
  validUntil: true,
  buyerName: true,
  buyerEmail: true,
  companyName: true,
  vatNumber: true,
  subtotal: true,
  depositTotal: true,
  shippingAmount: true,
  vatAmount: true,
  totalAmount: true,
  orderId: true,
  order: { select: { orderNumber: true } },
  items: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      productId: true,
      sku: true,
      name: true,
      variant: true,
      quantity: true,
      pricePerKg: true,
      weightKg: true,
      unitPrice: true,
      deposit: true,
      lineTotal: true,
    },
  },
} as const;

type QuoteRow = NonNullable<Awaited<ReturnType<typeof findQuote>>>;

function findQuote(where: { id: string; userId: string }) {
  return prisma.quote.findFirst({ where, select: QUOTE_SELECT });
}

function toView(q: QuoteRow, now: Date): QuoteView {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: effectiveQuoteStatus(q, now),
    createdAt: q.createdAt.toISOString(),
    validUntil: q.validUntil.toISOString(),
    buyerName: q.buyerName,
    buyerEmail: q.buyerEmail,
    companyName: q.companyName,
    vatNumber: q.vatNumber,
    subtotal: Number(q.subtotal),
    depositTotal: Number(q.depositTotal),
    shippingAmount: Number(q.shippingAmount),
    vatAmount: Number(q.vatAmount),
    totalAmount: Number(q.totalAmount),
    orderId: q.orderId,
    orderNumber: q.order?.orderNumber ?? null,
    items: q.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      deposit: Number(i.deposit),
      lineTotal: Number(i.lineTotal),
    })),
  };
}

/**
 * Brings the stored column in line with the clock for one user's quotes.
 * Display never depends on it (effectiveQuoteStatus does that); it keeps
 * the column honest for anything that filters on it in SQL.
 */
async function settleExpired(userId: string, now: Date) {
  await prisma.quote.updateMany({
    where: { userId, status: "PENDING", validUntil: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

/** One quote, scoped to its owner — another user's id is simply "not found". */
export async function getQuoteForUser(id: string, userId: string): Promise<QuoteView | null> {
  const now = new Date();
  const row = await findQuote({ id, userId });
  if (!row) return null;
  if (row.status === "PENDING" && row.validUntil <= now) await settleExpired(userId, now);
  return toView(row, now);
}

export async function getUserQuotes(userId: string, limit = 100): Promise<QuoteView[]> {
  const now = new Date();
  await settleExpired(userId, now);
  const rows = await prisma.quote.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: QUOTE_SELECT,
  });
  return rows.map((r) => toView(r, now));
}
