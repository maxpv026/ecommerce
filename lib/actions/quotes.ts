"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { calculateCartTotals } from "@/lib/cart";
import { cylinderGasPrice, roundMoney } from "@/lib/pricing";
import { LISTED } from "@/lib/productFamily";
import { isPurchasable } from "@/lib/waitlist";
import { QUOTES_PER_HOUR, QUOTE_VALIDITY_HOURS, generateQuoteNumber, isFGasProduct } from "@/lib/quotes";

/**
 * Turns the cart into a formal quote.
 *
 * The client sends references only — SKUs and quantities, exactly what
 * checkout accepts. Every price, weight and deposit is read from the
 * database here and frozen onto the quote, and the totals are computed with
 * the same function checkout uses, so a quote accepted within 48 hours
 * charges exactly what it printed (lib/orders honours it).
 */

export type QuoteErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "PRODUCT_NOT_FOUND"
  | "PRICE_ON_REQUEST"
  | "OUT_OF_STOCK"
  | "FGAS_UNVERIFIED"
  | "RATE_LIMITED"
  | "FAILED";

export type CreateQuoteResult =
  | { ok: true; id: string; quoteNumber: string; validUntil: string; totalAmount: number }
  | { ok: false; code: QuoteErrorCode; skus?: string[] };

const CartItems = z
  .array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().int().min(1).max(99) }))
  .min(1)
  .max(50);

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export async function createQuote(cartItems: unknown): Promise<CreateQuoteResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = CartItems.safeParse(cartItems);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  // One line per SKU — a cart that somehow holds the same SKU twice is quoted as one line.
  const qtyBySku = new Map<string, number>();
  for (const { sku, qty } of parsed.data) qtyBySku.set(sku, Math.min(99, (qtyBySku.get(sku) ?? 0) + qty));

  const [buyer, recent, products] = await Promise.all([
    // The row, not the session: a stale token can't quote gas after a revocation.
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, companyName: true, vatNumber: true, fGasStatus: true },
    }),
    prisma.quote.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } }),
    prisma.product.findMany({ where: { ...LISTED, sku: { in: [...qtyBySku.keys()] } } }),
  ]);
  if (!buyer) return { ok: false, code: "UNAUTHENTICATED" };
  if (recent >= QUOTES_PER_HOUR) return { ok: false, code: "RATE_LIMITED" };

  const bySku = new Map(products.map((p) => [p.sku, p]));
  const missing = [...qtyBySku.keys()].filter((sku) => !bySku.has(sku));
  if (missing.length) return { ok: false, code: "PRODUCT_NOT_FOUND", skus: missing };

  const lines = [...qtyBySku].map(([sku, qty]) => ({ product: bySku.get(sku)!, qty }));

  // Regulatory gate, same rule as checkout: refrigerant only for a VERIFIED
  // certificate. A buyer without one can still quote tools and equipment.
  const gas = lines.filter((l) => isFGasProduct(l.product)).map((l) => l.product.sku);
  if (gas.length && buyer.fGasStatus !== "VERIFIED") return { ok: false, code: "FGAS_UNVERIFIED", skus: gas };

  // A quote must be something checkout could accept: a price to hold, and
  // the stock to fill it today. Stock is not reserved — it's re-checked when
  // the quote is ordered.
  const unpriced = lines.filter((l) => !(l.product.pricePerKg > 0)).map((l) => l.product.sku);
  if (unpriced.length) return { ok: false, code: "PRICE_ON_REQUEST", skus: unpriced };
  const short = lines.filter((l) => !isPurchasable(l.product) || l.product.stockQuantity < l.qty).map((l) => l.product.sku);
  if (short.length) return { ok: false, code: "OUT_OF_STOCK", skus: short };

  const totals = calculateCartTotals(
    lines.map((l) => ({
      pricePerKg: l.product.pricePerKg,
      weightKg: l.product.weightKg,
      qty: l.qty,
      deposit: Number(l.product.cylinderDeposit),
    }))
  );

  const now = new Date();
  const validUntil = new Date(now.getTime() + QUOTE_VALIDITY_HOURS * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const quote = await prisma.quote.create({
        data: {
          quoteNumber: generateQuoteNumber(now),
          userId,
          validUntil,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          companyName: buyer.companyName,
          vatNumber: buyer.vatNumber,
          subtotal: roundMoney(totals.subtotal),
          depositTotal: roundMoney(totals.deposit),
          shippingAmount: roundMoney(totals.shipping),
          vatAmount: roundMoney(totals.vat),
          totalAmount: roundMoney(totals.total),
          items: {
            create: lines.map(({ product, qty }) => {
              const unitPrice = cylinderGasPrice(product.pricePerKg, product.weightKg);
              return {
                productId: product.id,
                sku: product.sku,
                name: product.name,
                variant: product.weight,
                quantity: qty,
                pricePerKg: product.pricePerKg,
                weightKg: product.weightKg,
                unitPrice,
                deposit: product.cylinderDeposit,
                lineTotal: roundMoney(unitPrice * qty),
              };
            }),
          },
        },
        select: { id: true, quoteNumber: true, totalAmount: true },
      });

      revalidatePath("/[locale]/profile/quotes", "page");
      return {
        ok: true,
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        validUntil: validUntil.toISOString(),
        totalAmount: Number(quote.totalAmount),
      };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      console.error("[quotes] createQuote failed:", error);
      return { ok: false, code: "FAILED" };
    }
  }
  return { ok: false, code: "FAILED" };
}
