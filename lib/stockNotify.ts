import "server-only";

import type { PrismaClient } from "./generated/prisma/client";
import { sendBackInStockEmail } from "./mail";
import { routing } from "@/i18n/routing";

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

function productUrl(productId: string, locale: string): string {
  // Wrapped because this is the one line that reads the environment, and it
  // runs inside a webhook where a throw would be logged as "dispatch failed"
  // with no clue which part broke. A usable link beats an exception.
  try {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
    if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.AUTH_URL) {
      console.warn(
        "[RESTOCK] Neither NEXT_PUBLIC_SITE_URL nor AUTH_URL is set — the email link will point at localhost."
      );
    }
    // Re-checked here as well as at subscribe time. The column predates the
    // validation and holds whatever was written before it existed, and this
    // string goes into a link we send to a person — so a row carrying junk
    // falls back to the default rather than shipping a broken or hostile URL.
    const segment = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
    return `${base}/${segment}/products/${productId}`;
  } catch (error) {
    console.error("[RESTOCK] FAILED to build the product URL; falling back to a bare path:", error);
    return `/${routing.defaultLocale}/products/${productId}`;
  }
}

async function sendInBatches(
  jobs: Array<{ id: string; email: string; url: string }>,
  product: { name: string; variant: string }
): Promise<{ sentIds: string[]; failedIds: string[] }> {
  const sentIds: string[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < jobs.length; i += SEND_CONCURRENCY) {
    const slice = jobs.slice(i, i + SEND_CONCURRENCY);
    for (const job of slice) console.log(`[RESTOCK] Attempting to send email to: ${job.email} (link ${job.url})`);

    const settled = await Promise.allSettled(
      slice.map((job) => sendBackInStockEmail(job.email, { ...product, url: job.url }))
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
      where: { productId: product.id, notified: false },
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

    const { sentIds, failedIds } = await sendInBatches(
      batch.map((s) => ({ id: s.id, email: s.email, url: productUrl(product.id, s.locale) })),
      { name: product.name, variant: product.weight }
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
