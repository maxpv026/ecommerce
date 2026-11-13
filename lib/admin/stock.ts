import "server-only";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { applyInventoryUpdate } from "@/lib/inventory";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { notifyBackInStock } from "@/lib/stockNotify";
import type { InventoryUpdateReport } from "@/lib/actions/adminInventory";

/**
 * Sets one product's on-hand count through the waitlist-aware path (0 → n
 * emails the waitlist). The caller has already checked "inventory.stock":
 * /admin/inventory (updateInventory) and the Telegram bot both land here.
 */

const Input = z.object({
  productId: z.string().trim().min(1).max(64),
  /** Absolute on-hand count, as the CRM would send it — never a delta. */
  newQuantity: z.number().int().min(0).max(1_000_000),
});

export async function applyStockChange(raw: { productId: string; newQuantity: number }): Promise<InventoryUpdateReport> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Enter a whole number of units, zero or more.", error: "INVALID_INPUT" };
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { sku: true, stockQuantity: true },
    });
    if (!product) return { ok: false, message: "That product no longer exists.", error: "PRODUCT_NOT_FOUND" };

    // Counted BEFORE the dispatch: notifyBackInStock flips these rows to
    // notified, so counting afterwards would always report zero and the
    // screen would claim nobody was waiting.
    const waitlistFound = await prisma.stockSubscription.count({
      where: { productId: parsed.data.productId, notified: false },
    });

    const result = await applyInventoryUpdate(prisma, {
      sku: product.sku,
      quantity: parsed.data.newQuantity,
    });
    if (result.status !== "updated") {
      return { ok: false, message: "That product no longer exists.", error: "PRODUCT_NOT_FOUND" };
    }

    // Awaited to completion before returning. A serverless invocation that
    // returns first can be frozen mid-SMTP, and the mail silently never
    // leaves — the whole reason this is a server action and not a
    // fire-and-forget.
    const notification = result.cameBackInStock
      ? await notifyBackInStock(prisma, {
          id: result.id,
          sku: result.sku,
          name: result.name,
          weight: result.weight,
        })
      : null;

    // The table reads stock and waitlist counts, and both have just moved.
    revalidatePath("/[locale]/admin/inventory", "page");
    revalidatePath("/[locale]/products", "page");
    revalidateTag(CATALOG_COUNTS_TAG, "max");

    const base = `${result.sku}: stock ${result.previousQuantity} → ${result.stockQuantity}.`;
    if (!result.cameBackInStock) {
      return {
        ok: true,
        message:
          waitlistFound > 0 && result.stockQuantity > 0
            ? `${base} Already in stock, so no mail was due — ${waitlistFound} still waiting for a 0 → positive change.`
            : base,
        sku: result.sku,
        quantityBefore: result.previousQuantity,
        quantityAfter: result.stockQuantity,
        cameBackInStock: false,
        waitlistFound,
        emailsSent: 0,
        emailsFailed: 0,
        remaining: 0,
      };
    }

    const sent = notification?.sent ?? 0;
    const failed = notification?.failed ?? 0;
    return {
      ok: failed === 0,
      message:
        waitlistFound === 0
          ? `${base} Back in stock, but nobody was on the waitlist.`
          : `${base} ${sent} email${sent === 1 ? "" : "s"} sent${failed > 0 ? `, ${failed} failed — they stay queued for the next restock` : ""}.`,
      sku: result.sku,
      quantityBefore: result.previousQuantity,
      quantityAfter: result.stockQuantity,
      cameBackInStock: true,
      waitlistFound,
      emailsSent: sent,
      emailsFailed: failed,
      remaining: notification?.remaining ?? 0,
    };
  } catch (error) {
    console.error("[RESTOCK] updateInventory threw:", error);
    return {
      ok: false,
      message: "The update failed. See the server log.",
      // The error NAME only. The message was being returned verbatim to the
      // browser, and a Prisma failure puts the connection string and the
      // offending query in there — which is how a database URL ends up in a
      // screenshot. The full error is in the server log above.
      error: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    };
  }
}
