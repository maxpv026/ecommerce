"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/fgasReview";
import { applyInventoryUpdate } from "@/lib/inventory";
import { CATALOG_COUNTS_TAG } from "@/lib/cacheTags";
import { notifyBackInStock } from "@/lib/stockNotify";

/**
 * Manual stock control for the admin inventory screen.
 *
 * This exists because editing `stockQuantity` in Prisma Studio writes the
 * number and nothing else: the back-in-stock mail is sent by application
 * code on a 0 → positive transition, not by a database trigger. A row edited
 * outside the app therefore restocks silently and no one on the waitlist
 * ever hears about it.
 *
 * The update runs through `applyInventoryUpdate` — the same function the CRM
 * webhook calls — so `inStock`, the stock badge and the transition flag are
 * all derived identically. Writing the row here by hand would drift from the
 * webhook and reintroduce exactly the problem this screen is meant to fix.
 */

const Input = z.object({
  productId: z.string().trim().min(1).max(64),
  /** Absolute on-hand count, as the CRM would send it — never a delta. */
  newQuantity: z.number().int().min(0).max(1_000_000),
});

export interface InventoryUpdateReport {
  ok: boolean;
  /** One line, ready for a toast. */
  message: string;
  sku?: string;
  quantityBefore?: number;
  quantityAfter?: number;
  /** True when this update took the product from unavailable to purchasable. */
  cameBackInStock?: boolean;
  /** Subscribers who were waiting when the transition happened. */
  waitlistFound?: number;
  emailsSent?: number;
  emailsFailed?: number;
  /** Subscribers deferred because the batch hit its ceiling. */
  remaining?: number;
  error?: string;
}

export async function updateInventory(raw: {
  productId: string;
  newQuantity: number;
}): Promise<InventoryUpdateReport> {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) {
    return { ok: false, message: "Admins only.", error: admin.code };
  }

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
