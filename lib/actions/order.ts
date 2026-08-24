"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { calculateCartTotals } from "@/lib/cart";

const PlaceOrderInput = z.object({
  addressId: z.string().min(1),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        qty: z.number().int().min(1).max(99),
      })
    )
    .min(1),
});

export type PlaceOrderErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "ADDRESS_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "OUT_OF_STOCK"
  | "ORDER_FAILED";

export type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; code: PlaceOrderErrorCode };

const DELIVERY_DAYS = 5;

function generateOrderNumber(): string {
  // Matches the existing "ORD-8472-EU" format.
  return `ORD-${Math.floor(1000 + Math.random() * 9000)}-EU`;
}

/**
 * Creates a PENDING Order (+ nested OrderItems) for the signed-in user.
 * The client only ever supplies references (skus, qtys, an address id) —
 * prices, ownership, and stock are all re-read from the database here.
 */
export async function placeOrder(rawInput: {
  addressId: string;
  items: Array<{ sku: string; qty: number }>;
}): Promise<PlaceOrderResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = PlaceOrderInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const { addressId, items } = parsed.data;

  // Ownership check: the address must belong to the ordering user.
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) return { ok: false, code: "ADDRESS_NOT_FOUND" };

  const skus = items.map((i) => i.sku);
  const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  if (items.some((i) => !bySku.has(i.sku))) return { ok: false, code: "PRODUCT_NOT_FOUND" };
  if (items.some((i) => !bySku.get(i.sku)!.inStock)) return { ok: false, code: "OUT_OF_STOCK" };

  // Authoritative totals from DB prices — same math the cart UI previews.
  const lines = items.map((i) => ({ price: Number(bySku.get(i.sku)!.price), qty: i.qty }));
  const { total } = calculateCartTotals(lines);

  try {
    // orderNumber is random — retry a couple of times on the (unlikely)
    // unique-constraint collision instead of failing the checkout.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const order = await prisma.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId,
            addressId,
            status: "PENDING",
            totalAmount: total,
            estimatedDelivery: new Date(Date.now() + DELIVERY_DAYS * 24 * 60 * 60 * 1000),
            items: {
              create: items.map((i) => {
                const product = bySku.get(i.sku)!;
                return {
                  productId: product.id,
                  quantity: i.qty,
                  priceAtPurchase: product.price,
                };
              }),
            },
          },
        });
        return { ok: true, orderId: order.id };
      } catch (error) {
        const isUniqueViolation =
          typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
        if (!isUniqueViolation || attempt === 2) throw error;
      }
    }
    return { ok: false, code: "ORDER_FAILED" };
  } catch (error) {
    console.error("placeOrder failed:", error);
    return { ok: false, code: "ORDER_FAILED" };
  }
}
