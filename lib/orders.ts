import "server-only";

import { randomInt } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { calculateCartTotals, type CartTotals } from "@/lib/cart";
import { stockStateForQuantity } from "@/lib/inventory";
import { cylinderGasPrice } from "@/lib/pricing";
import type { ProductModel } from "@/lib/generated/prisma/models";
import { LISTED } from "@/lib/productFamily";
import { getEffectiveFgasStatus } from "@/lib/fgas";
import { expireCatalog } from "@/lib/catalogCache";
import { basketRequiresFgas } from "@/lib/fgasSubstances";

/**
 * The order core: everything that has to be true before money is taken,
 * and the atomic write that reserves stock and records the order.
 *
 * app/api/checkout is the single way an Order comes into existence: the
 * client only ever supplies references (skus, qtys, an address id) and every
 * price, deposit, ownership and stock fact is re-read from the database
 * here.
 */

export const OrderRequest = z.object({
  addressId: z.string().min(1),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        qty: z.number().int().min(1).max(99),
      })
    )
    .min(1)
    .max(50),
  /**
   * Order a quote at its quoted prices. The basket must be exactly the
   * quote's lines; a missing, expired, already-ordered or edited quote is
   * refused (QUOTE_INVALID) rather than silently charged at today's prices.
   */
  quoteId: z.string().min(1).max(64).optional(),
});

export type OrderRequestInput = z.infer<typeof OrderRequest>;

export type OrderErrorCode =
  | "UNAUTHENTICATED"
  | "FGAS_UNVERIFIED"
  /** Was verified, but the certificate's expiry date has passed. */
  | "FGAS_EXPIRED"
  | "INVALID_INPUT"
  | "ADDRESS_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "OUT_OF_STOCK"
  | "QUOTE_INVALID"
  | "ORDER_FAILED";

/** One validated line: the live catalog row plus the requested quantity. */
export interface OrderDraftLine {
  product: ProductModel;
  qty: number;
}

/** The delivery address as it read at checkout, ready to be frozen. */
export interface DeliveryAddress {
  recipientName: string;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  /** Pre-composed display line; the only field legacy rows are sure to have. */
  fullAddress: string;
}

/** A checkout that has passed every gate and is ready to be committed. */
export interface OrderDraft {
  userId: string;
  addressId: string;
  address: DeliveryAddress;
  lines: OrderDraftLine[];
  totals: CartTotals;
  /** Set when the order is placed from a quote; commitOrder claims it. */
  quoteId?: string;
  /**
   * The certificate that authorises an order containing F-Gas lines, frozen
   * onto the order by commitOrder. Null for tools-only / non-fluorinated
   * orders, which need none.
   */
  authorizingCertificate: { id: string | null; number: string | null; expiresAt: Date | null } | null;
}

/**
 * One address, one line per fact — what gets frozen onto the order and
 * quoted to the admin. Built from the structured columns when they exist and
 * from `fullAddress` when they don't, so a legacy row still reads sensibly.
 */
export function formatDeliveryAddress(address: DeliveryAddress): string {
  const structured = [
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(" ").trim() || null,
    address.country,
  ].filter((part): part is string => Boolean(part && part.trim()));

  const lines = [
    address.recipientName,
    ...(structured.length > 0 ? structured : [address.fullAddress]),
    address.phone ? `Tel: ${address.phone}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line && line.trim())).join("\n");
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: OrderErrorCode };

const DELIVERY_DAYS = 5;

/**
 * Unambiguous characters only (no 0/O, 1/I/L), so an order number read out
 * over the phone or copied from a paper delivery note can't be mistyped into
 * someone else's.
 */
const ORDER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * `ORD-20261111-7KQ2MXHD`: the UTC date, then 8 characters from a CSPRNG —
 * 31^8 ≈ 852 billion values per day. By the birthday bound even 200,000
 * orders in ONE day has ~2 % odds of a single collision (6 characters would
 * have given ~22). The old `ORD-1000…9999-EU` had 9,000 values in total, so
 * collisions grew with every order until checkouts would have failed.
 * commitOrder still retries on the unique constraint, as a formality.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)];
  return `ORD-${day}-${suffix}`;
}

/** Thrown inside the order transaction to roll it back and surface OUT_OF_STOCK. */
class OutOfStockError extends Error {}
/** Thrown when the quote was ordered or expired between prepareOrder and the commit. */
class QuoteClaimError extends Error {}

/**
 * Runs every pre-payment gate — identity, the F-Gas certificate, address
 * ownership, the products' existence and their stock — and returns the
 * authoritative pricing for the basket.
 *
 * Nothing here writes: the caller may safely bail out knowing no stock has
 * moved yet.
 */
export async function prepareOrder(
  userId: string | null | undefined,
  rawInput: unknown
): Promise<Result<OrderDraft>> {
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = OrderRequest.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { addressId, items, quoteId } = parsed.data;

  const products = await prisma.product.findMany({ where: { ...LISTED, sku: { in: items.map((i) => i.sku) } } });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  if (items.some((i) => !bySku.has(i.sku))) return { ok: false, code: "PRODUCT_NOT_FOUND" };

  // Regulatory gate, by SUBSTANCE (lib/fgasSubstances): only a basket with a
  // fluorinated gas in it needs a certificate — tools, accessories and
  // hydrocarbons never do. When it does, the effective status must be
  // VERIFIED: a certificate past its expiry date is EXPIRED from that
  // instant, whether or not the daily cron has written it down yet. The row
  // is the source of truth; a stale session or crafted request can't pass.
  let authorizingCertificate: OrderDraft["authorizingCertificate"] = null;
  if (basketRequiresFgas(products)) {
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fGasStatus: true,
        fGasExpiresAt: true,
        fGasExtractedData: true,
        certificates: { where: { isActive: true }, select: { id: true, certificateNumber: true, certId: true, expiresAt: true }, take: 1 },
      },
    });
    const effective = buyer ? getEffectiveFgasStatus(buyer) : "NONE";
    if (effective === "EXPIRED") return { ok: false, code: "FGAS_EXPIRED" };
    if (effective !== "VERIFIED") return { ok: false, code: "FGAS_UNVERIFIED" };
    const cert = buyer!.certificates[0];
    authorizingCertificate = {
      id: cert?.id ?? null,
      number: cert?.certificateNumber ?? cert?.certId ?? ((buyer!.fGasExtractedData as { certificateId?: string } | null)?.certificateId ?? null),
      expiresAt: cert?.expiresAt ?? buyer!.fGasExpiresAt ?? null,
    };
  }

  // Ownership check: the address must belong to the ordering user. Read in
  // full so the order can freeze a copy of it (the customer may edit or
  // delete the row afterwards — see Order.shippingAddress).
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: {
      id: true,
      recipientName: true,
      fullAddress: true,
      street: true,
      city: true,
      postalCode: true,
      country: true,
      phone: true,
    },
  });
  if (!address) return { ok: false, code: "ADDRESS_NOT_FOUND" };

  let lines: OrderDraftLine[] = items.map((i) => ({ product: bySku.get(i.sku)!, qty: i.qty }));

  // Ordering a quote: the quoted price, weight and deposit replace the live
  // ones on every line, so the order — its totals, OrderItem snapshots and
  // invoice — is exactly the document the buyer had approved.
  if (quoteId) {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, userId },
      select: { status: true, validUntil: true, items: { select: { productId: true, sku: true, quantity: true, pricePerKg: true, weightKg: true, deposit: true } } },
    });
    if (!quote || quote.status !== "PENDING" || quote.validUntil <= new Date()) return { ok: false, code: "QUOTE_INVALID" };

    const quoted = new Map(quote.items.map((q) => [q.sku, q]));
    const sameBasket =
      quote.items.length === items.length &&
      items.every((i) => quoted.get(i.sku)?.quantity === i.qty && quoted.get(i.sku)?.productId === bySku.get(i.sku)!.id);
    // A changed net weight means a different container from the one quoted:
    // the price can be held, the product can't.
    if (!sameBasket || lines.some((l) => quoted.get(l.product.sku)!.weightKg !== l.product.weightKg)) {
      return { ok: false, code: "QUOTE_INVALID" };
    }

    lines = lines.map((l) => {
      const q = quoted.get(l.product.sku)!;
      return { qty: l.qty, product: { ...l.product, pricePerKg: q.pricePerKg, weightKg: q.weightKg, cylinderDeposit: q.deposit } };
    });
  }

  // Early, friendly rejection; commitOrder() re-checks under a conditional
  // update so a concurrent order can't slip through the gap.
  if (lines.some((l) => !l.product.inStock || l.product.stockQuantity < l.qty)) {
    return { ok: false, code: "OUT_OF_STOCK" };
  }

  // Authoritative totals from the DB's per-kg rate, net weight and deposit
  // — the same math the cart UI previews: gas = pricePerKg × weightKg × qty,
  // deposit = cylinderDeposit × qty as its own component.
  const totals = calculateCartTotals(
    lines.map((l) => ({
      pricePerKg: l.product.pricePerKg,
      weightKg: l.product.weightKg,
      qty: l.qty,
      deposit: Number(l.product.cylinderDeposit),
    }))
  );

  return { ok: true, value: { userId, addressId, address, lines, totals, quoteId, authorizingCertificate } };
}

/**
 * Reserves the stock and writes the Order + OrderItems in one transaction,
 * so two checkouts can't both take the last cylinder.
 *
 * The order lands as PENDING with paymentStatus PENDING: these are B2B wire
 * transfers, so nothing is settled at checkout. An admin marks the order paid
 * once the transfer lands (markOrderPaid), or releases it (releaseOrder) if
 * it never does.
 */
export async function commitOrder(
  draft: OrderDraft,
  payment: {
    paymentMethod: string;
    /**
     * What the buyer is being invoiced, in euros. Passed in rather than taken
     * from `draft.totals` so the stored total is cent-for-cent the figure the
     * summary showed them.
     */
    totalAmount?: number;
  }
): Promise<Result<{ id: string; orderNumber: string; totalAmount: number }>> {
  const totalAmount = payment.totalAmount ?? draft.totals.total;
  const shippingAddress = formatDeliveryAddress(draft.address);

  // orderNumber is random — retry a couple of times on the (unlikely)
  // unique-constraint collision instead of failing the checkout. The
  // transaction rolls back the stock reservation on any failure.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        for (const { product, qty } of draft.lines) {
          const reserved = await tx.product.updateMany({
            where: { id: product.id, inStock: true, stockQuantity: { gte: qty } },
            data: { stockQuantity: { decrement: qty } },
          });
          if (reserved.count === 0) throw new OutOfStockError(product.sku);

          // Keep inStock and the badge facet in step with the new count
          // (a sale that empties the shelf flips the product to "out").
          const after = await tx.product.findUniqueOrThrow({
            where: { id: product.id },
            select: { stockQuantity: true },
          });
          await tx.product.update({ where: { id: product.id }, data: stockStateForQuantity(after.stockQuantity) });
        }

        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId: draft.userId,
            addressId: draft.addressId,
            status: "PENDING",
            // The carrier is chosen at dispatch (admin / CRM, lib/shipping);
            // until then the buyer's timeline reads "order placed".
            shipmentStage: "ORDER_PLACED",
            totalAmount,
            estimatedDelivery: new Date(Date.now() + DELIVERY_DAYS * 24 * 60 * 60 * 1000),
            paymentMethod: payment.paymentMethod,
            paymentStatus: "PENDING",
            shippingAddress,
            // The legal record of what authorised this F-Gas sale; never updated.
            authorizingCertificateId: draft.authorizingCertificate?.id ?? null,
            authorizingCertificateNumber: draft.authorizingCertificate?.number ?? null,
            authorizingCertificateExpiresAt: draft.authorizingCertificate?.expiresAt ?? null,
            items: {
              create: draft.lines.map(({ product, qty }) => ({
                productId: product.id,
                quantity: qty,
                // Snapshot both the cylinder figure and what it was made of.
                priceAtPurchase: cylinderGasPrice(product.pricePerKg, product.weightKg),
                pricePerKgAtPurchase: product.pricePerKg,
                weightKgAtPurchase: product.weightKg,
                depositAtPurchase: product.cylinderDeposit,
                // Carbon footprint, frozen the same way the price is. Equipment
                // has no GWP, so it records null and contributes nothing —
                // deliberately not 0, which would be indistinguishable from
                // "a gas we failed to cost". See lib/compliance.ts.
                gwpAtPurchase: product.gwp,
                co2eKg: product.gwp === null ? 0 : product.weightKg * qty * product.gwp,
              })),
            },
          },
          select: { id: true, orderNumber: true, totalAmount: true },
        });

        // The claim, inside the same transaction as the stock and the order:
        // a quote opened in two tabs is ordered once, and an order can't
        // land at quoted prices after the quote has lapsed.
        if (draft.quoteId) {
          const claimed = await tx.quote.updateMany({
            where: { id: draft.quoteId, userId: draft.userId, status: "PENDING", validUntil: { gt: new Date() } },
            data: { status: "ACCEPTED", orderId: order.id },
          });
          if (claimed.count === 0) throw new QuoteClaimError(draft.quoteId);
        }
        return order;
      });

      // Stock was reserved: expire the cached catalog so the next buyer sees it.
      expireCatalog();
      return { ok: true, value: { ...order, totalAmount: Number(order.totalAmount) } };
    } catch (error) {
      if (error instanceof OutOfStockError) return { ok: false, code: "OUT_OF_STOCK" };
      if (error instanceof QuoteClaimError) return { ok: false, code: "QUOTE_INVALID" };
      const isUniqueViolation =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (isUniqueViolation && attempt < 2) continue;
      console.error("commitOrder failed:", error);
      return { ok: false, code: "ORDER_FAILED" };
    }
  }
  return { ok: false, code: "ORDER_FAILED" };
}

/** Marks an order settled once the transfer lands. Idempotent. */
export async function markOrderPaid(orderId: string, paidAt: Date): Promise<boolean> {
  // Only PENDING → PAID. A second call finds paymentStatus already PAID and
  // matches nothing, so `paidAt` keeps the first settlement's timestamp;
  // an order whose stock was already released (FAILED) is left alone.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: "PENDING" },
    data: { paymentStatus: "PAID", paidAt },
  });
  return count === 1;
}

/**
 * Payment fell through (the transfer never arrived, or was cancelled):
 * flip the order to FAILED and put the reserved cylinders back on the shelf.
 *
 * The status flip doubles as the claim — only the caller that actually moves
 * the row from PENDING to FAILED restocks, so a repeated call can never
 * credit the same stock twice.
 */
export async function releaseOrder(orderId: string): Promise<boolean> {
  // Not once it has shipped: the cylinders are on a van, not on the shelf,
  // so putting them back into stock would sell gas we no longer hold.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: "PENDING", status: "PENDING" },
    data: { paymentStatus: "FAILED" },
  });
  if (claimed.count === 0) return false;

  const items = await prisma.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
      const after = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
        select: { stockQuantity: true },
      });
      await tx.product.update({ where: { id: item.productId }, data: stockStateForQuantity(after.stockQuantity) });
    }
  });
  // Stock went back on the shelf: the cached catalog must show it now.
  expireCatalog();
  return true;
}
