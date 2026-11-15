import "server-only";

import type { PrismaClient } from "./generated/prisma/client";
import { sendBackInStockEmail, type StockEmailProduct } from "./mail";
import { cylinderGasPrice, isPricedPerKg } from "./pricing";
import { absoluteUrl } from "@/lib/siteUrl";

// Back-in-stock dispatch, driven by the CRM webhook when a product goes from
// unavailable to purchasable.
//
// Ordering matters here. Rows are CLAIMED first (notified flipped to true in
// one conditional updateMany) and only then mailed. Two webhook pushes racing
// on the same product therefore cannot both grab the same subscriber, which
// is the failure mode that would spam people. Sends that fail afterwards are
// released back to un-notified so the next restock retries them — a delayed
// mail is recoverable, a duplicate one is not.

/** Ceiling per push, so one enormous waitlist can't run the route past its time budget. */
const MAX_NOTIFY_PER_PUSH = 500;
/** Concurrent SMTP sends. Gmail is unhappy with much more than this. */
const SEND_CONCURRENCY = 5;

export interface StockNotifyResult {
  sku: string;
  /** Emails successfully handed to the SMTP server. */
  sent: number;
  /** Sends that failed; these rows were released for a later retry. */
  failed: number;
  /** Subscribers left unclaimed because the batch hit MAX_NOTIFY_PER_PUSH. */
  remaining: number;
}

/**
 * The product page in the subscriber's language, on the canonical host —
 * the same helper every other email uses (lib/siteUrl absoluteUrl: an
 * unknown or junk locale falls back to the default).
 */
function productUrl(productId: string, locale: string): string {
  return absoluteUrl(`/products/${productId}`, locale);
}

async function sendInBatches(
  jobs: Array<{ id: string; email: string; url: string; locale: string }>,
  product: { name: string; details: StockEmailProduct | null }
): Promise<{ sentIds: string[]; failedIds: string[] }> {
  const sentIds: string[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < jobs.length; i += SEND_CONCURRENCY) {
    const slice = jobs.slice(i, i + SEND_CONCURRENCY);
    for (const job of slice) console.log(`[RESTOCK] Attempting to send email to: ${job.email} (link ${job.url})`);

    const settled = await Promise.allSettled(
      slice.map((job) => sendBackInStockEmail(job.email, { ...product, url: job.url, locale: job.locale }))
    );
    settled.forEach((outcome, idx) => {
      if (outcome.status === "fulfilled") {
        sentIds.push(slice[idx].id);
        console.log(
          `[RESTOCK] Email transport response for ${slice[idx].email}:`,
          JSON.stringify(outcome.value)
        );
      } else {
        failedIds.push(slice[idx].id);
        console.error(`[RESTOCK] FAILED to send email to ${slice[idx].email}:`, outcome.reason);
      }
    });
  }
  return { sentIds, failedIds };
}

/**
 * Mails everyone waiting on one product, exactly once. Never throws: a mail
 * outage must not fail the CRM's inventory push, which has already committed.
 */
export async function notifyBackInStock(
  prisma: PrismaClient,
  product: { id: string; sku: string; name: string; weight: string }
): Promise<StockNotifyResult> {
  const empty: StockNotifyResult = { sku: product.sku, sent: 0, failed: 0, remaining: 0 };
  console.log(`[RESTOCK] Triggered for product ID: ${product.id} (${product.sku} — ${product.name})`);

  try {
    const waiting = await prisma.stockSubscription.findMany({
      where: {
        productId: product.id,
        notified: false,
        // Settings → Notifications → Back-in-stock. Guest subscriptions (no
        // account) have no switch and always send; an account that turned it
        // off is skipped and its rows stay pending, so turning it back on
        // resumes them on the next restock.
        OR: [{ userId: null }, { user: { notifyBackInStock: true } }],
      },
      select: { id: true, email: true, locale: true },
      orderBy: { createdAt: "asc" },
      take: MAX_NOTIFY_PER_PUSH + 1,
    });
    console.log(`[RESTOCK] Found pending subscriptions: ${waiting.length}`);
    if (waiting.length === 0) {
      console.log("[RESTOCK] Nobody is waiting on this product — nothing to send.");
      return empty;
    }

    const batch = waiting.slice(0, MAX_NOTIFY_PER_PUSH);
    const remaining = waiting.length - batch.length;
    if (remaining > 0) {
      console.warn(
        `[stock-notify] ${product.sku}: waitlist exceeds ${MAX_NOTIFY_PER_PUSH}; ${remaining} subscriber(s) deferred to the next restock.`
      );
    }

    // Claim before sending: the guard on notified:false makes this the point
    // where concurrent pushes are serialised by the database.
    const claimedAt = new Date();
    const claim = await prisma.stockSubscription.updateMany({
      where: { id: { in: batch.map((s) => s.id) }, notified: false },
      data: { notified: true, notifiedAt: claimedAt },
    });
    console.log(`[RESTOCK] Claimed ${claim.count} of ${batch.length} row(s) for sending.`);
    if (claim.count === 0) {
      console.warn("[RESTOCK] Another push claimed these rows first — nothing to send here.");
      return { ...empty, remaining };
    }

    // Today's catalog facts for the email (price, pack size, safety, GWP) —
    // read once per restock. Missing row or columns: the email still goes,
    // without the product line, rather than not at all.
    const details = await loadStockEmailProduct(prisma, product.id);
    const { sentIds, failedIds } = await sendInBatches(
      batch.map((s) => ({ id: s.id, email: s.email, url: productUrl(product.id, s.locale), locale: s.locale })),
      { name: product.name, details }
    );

    // Release the failures so a later restock picks them up again.
    if (failedIds.length > 0) {
      console.warn(`[RESTOCK] Releasing ${failedIds.length} row(s) back to un-notified for retry.`);
      await prisma.stockSubscription
        .updateMany({ where: { id: { in: failedIds } }, data: { notified: false, notifiedAt: null } })
        .catch((error) => console.error("[stock-notify] could not release failed sends:", error));
    }

    console.log(
      `[RESTOCK] Done for ${product.sku}: sent=${sentIds.length} failed=${failedIds.length} remaining=${remaining}`
    );
    return { sku: product.sku, sent: sentIds.length, failed: failedIds.length, remaining };
  } catch (error) {
    console.error(`[RESTOCK] FAILED dispatch for ${product.sku}:`, error);
    return empty;
  }
}

async function loadStockEmailProduct(prisma: PrismaClient, productId: string): Promise<StockEmailProduct | null> {
  try {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: { sku: true, weightKg: true, containerType: true, category: true, pricePerKg: true, cylinderDeposit: true, gwpClass: true, gwp: true },
    });
    if (!p) return null;
    const pricedPerKg = isPricedPerKg(p.category);
    return {
      sku: p.sku,
      weightKg: p.weightKg,
      containerType: p.containerType,
      pricedPerKg,
      pricePerKg: p.pricePerKg,
      price: pricedPerKg ? cylinderGasPrice(p.pricePerKg, p.weightKg) : p.pricePerKg,
      deposit: pricedPerKg ? Number(p.cylinderDeposit) : 0,
      safety: p.gwpClass,
      gwp: p.gwp,
    };
  } catch (error) {
    console.error("[RESTOCK] could not load the product facts for the email:", error);
    return null;
  }
}
