"use server";

import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/fgasReview";
import { applyInventoryUpdate } from "@/lib/inventory";
import { notifyBackInStock } from "@/lib/stockNotify";

/**
 * Admin-only: force a real back-in-stock run for one product and report
 * exactly what happened.
 *
 * Why this exists. The mail is sent on a 0 → positive stock TRANSITION, not
 * on "stock is positive". Almost every product in this catalog is already in
 * stock, so setting one to 25 changes nothing that anybody is watching for:
 * `cameBackInStock` is false, `notifyBackInStock` is never reached, and no
 * email is sent — correctly, and invisibly. That is the failure mode this
 * tool was built to make obvious.
 *
 * So it drives the transition itself: quantity to 0, then to the target, via
 * the same `applyInventoryUpdate` the CRM webhook uses. Everything is
 * awaited to completion before returning, so nothing is left dangling when
 * the serverless invocation ends.
 */

const Input = z.object({
  productId: z.string().trim().min(1).max(64),
  /** What to restock to. 25 is plenty to prove the path. */
  quantity: z.number().int().min(1).max(1000).default(25),
});

export interface TestRestockReport {
  ok: boolean;
  /** Short line suitable for a toast. */
  headline: string;
  /** Everything worth reading, in order. */
  steps: string[];
  detail?: {
    sku: string;
    name: string;
    quantityBefore: number;
    inStockBefore: boolean;
    quantityAfter: number;
    inStockAfter: boolean;
    transitionForced: boolean;
    reArmed: number;
    pendingFound: number;
    sent: number;
    failed: number;
    remaining: number;
  };
  /** The exact error, when something threw. */
  error?: string;
}

export async function testRestockEmail(raw: {
  productId: string;
  quantity?: number;
}): Promise<TestRestockReport> {
  const session = await auth();
  const admin = await requireAdmin(session?.user?.id);
  if (!admin.ok) {
    return { ok: false, headline: "Admins only.", steps: [], error: admin.code };
  }

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, headline: "Bad input.", steps: [], error: parsed.error.issues[0]?.message };
  }

  const steps: string[] = [];
  try {
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { sku: true, name: true, stockQuantity: true, inStock: true },
    });
    if (!product) return { ok: false, headline: "Product not found.", steps, error: "PRODUCT_NOT_FOUND" };

    steps.push(`Product ${product.sku} starts at qty ${product.stockQuantity}, inStock=${product.inStock}.`);

    // Re-arm first: a row already flipped to notified is skipped by design,
    // which would make a second click do nothing and look like a new bug.
    const reArm = await prisma.stockSubscription.updateMany({
      where: { productId: parsed.data.productId, notified: true },
      data: { notified: false, notifiedAt: null },
    });
    if (reArm.count > 0) steps.push(`Re-armed ${reArm.count} previously-notified subscriber(s) so this test can run again.`);

    const pendingFound = await prisma.stockSubscription.count({
      where: { productId: parsed.data.productId, notified: false },
    });
    steps.push(`${pendingFound} subscriber(s) waiting on this product.`);
    if (pendingFound === 0) {
      return {
        ok: false,
        headline: "Nobody is on this product's waitlist — there is no one to email.",
        steps: [...steps, 'Subscribe first using the "Notify me" block while the product is out of stock.'],
        detail: {
          sku: product.sku,
          name: product.name,
          quantityBefore: product.stockQuantity,
          inStockBefore: product.inStock,
          quantityAfter: product.stockQuantity,
          inStockAfter: product.inStock,
          transitionForced: false,
          reArmed: reArm.count,
          pendingFound: 0,
          sent: 0,
          failed: 0,
          remaining: 0,
        },
      };
    }

    // Force the transition the webhook reacts to. Without the trip through
    // zero this is a no-op for an already-stocked product.
    if (product.stockQuantity > 0 || product.inStock) {
      await applyInventoryUpdate(prisma, { sku: product.sku, quantity: 0 });
      steps.push("Took the product to 0 first — the mail fires on a 0 → positive transition, not on 'stock is positive'.");
    }

    const restock = await applyInventoryUpdate(prisma, { sku: product.sku, quantity: parsed.data.quantity });
    if (restock.status !== "updated") {
      return { ok: false, headline: "Could not update stock.", steps, error: "PRODUCT_NOT_FOUND" };
    }
    steps.push(
      `Restocked to ${restock.stockQuantity} (inStock ${restock.previousInStock} → ${restock.inStock}), cameBackInStock=${restock.cameBackInStock}.`
    );

    if (!restock.cameBackInStock) {
      return {
        ok: false,
        headline: "No 0 → positive transition happened, so nothing would be sent.",
        steps,
        error: "NO_TRANSITION",
      };
    }

    // Awaited to completion — the whole point. Returning before this settles
    // is what silently kills in-flight SMTP on a serverless host.
    const result = await notifyBackInStock(prisma, {
      id: restock.id,
      sku: restock.sku,
      name: restock.name,
      weight: restock.weight,
    });
    steps.push(`Dispatch finished: sent=${result.sent} failed=${result.failed} remaining=${result.remaining}.`);

    const detail = {
      sku: restock.sku,
      name: restock.name,
      quantityBefore: product.stockQuantity,
      inStockBefore: product.inStock,
      quantityAfter: restock.stockQuantity,
      inStockAfter: restock.inStock,
      transitionForced: true,
      reArmed: reArm.count,
      pendingFound,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
    };

    if (result.sent === 0) {
      return {
        ok: false,
        headline: `Nothing sent — ${result.failed} failed. Check the server log for the SMTP reply.`,
        steps,
        detail,
      };
    }
    return {
      ok: true,
      headline: `Found ${pendingFound} subscriber(s). ${result.sent} email(s) sent${result.failed ? `, ${result.failed} failed` : ""}.`,
      steps,
      detail,
    };
  } catch (error) {
    console.error("[RESTOCK] testRestockEmail threw:", error);
    return {
      ok: false,
      headline: "The test threw an exception.",
      steps,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
