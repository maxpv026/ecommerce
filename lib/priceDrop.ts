import "server-only";

import prisma from "@/lib/prisma";
import { cylinderGasPrice } from "@/lib/pricing";
import { LISTED } from "@/lib/productFamily";
import { isPurchasable } from "@/lib/waitlist";
import { sendPriceDropEmail } from "@/lib/notificationEmail";

/**
 * Price-drop emails for favourited products.
 *
 * Called after a price change is committed — from the admin size editor
 * (lib/actions/inventory) and the CRM webhook — inside next/server's
 * `after()`, so the admin's save and the CRM's response never wait on SMTP,
 * while the serverless invocation is kept alive until the mail is out.
 *
 * Who gets one: buyers who favourited this exact size AND turned on price-
 * drop alerts (User.notifyPriceDrops, opt-in, the "Price Drop Alerts"
 * toggle in settings). Favouriting is not consent to email.
 */

export interface PriceSnapshot {
  pricePerKg: number;
  weightKg: number;
}

/**
 * A drop is a cheaper per-kg rate for the same container. A weight change
 * is a different product in the same row, not a discount — 10 kg → 5 kg
 * halves the price and saves nobody anything — so it never counts.
 */
export function isPriceDrop(before: PriceSnapshot, after: PriceSnapshot): boolean {
  return (
    before.weightKg === after.weightKg &&
    after.pricePerKg > 0 &&
    after.pricePerKg < before.pricePerKg &&
    cylinderGasPrice(after.pricePerKg, after.weightKg) < cylinderGasPrice(before.pricePerKg, before.weightKg)
  );
}

/**
 * After this long, an old alert no longer counts: a drop to a price we
 * announced two months ago is news again.
 */
const ALERT_MEMORY_DAYS = 30;
/**
 * Ceiling per change. Sized to the send budget, not just to blast radius:
 * everything here runs inside the caller's after() window, which shares the
 * route's maxDuration (60s on the CRM webhook), and at Resend's default
 * 2 requests/second about 100 emails fit. Past the cap the overflow is
 * logged — a list that size needs a queue, not a longer request.
 */
const MAX_RECIPIENTS = 100;
/**
 * A drop must be at least this much below what the buyer last knew to be
 * worth an email. Without it a €0.01 correction is "news" — the anti-spam
 * memory below only stopped repeats, not trivial cuts.
 */
export const MIN_DROP_RATIO = 0.01;
/**
 * Emails in flight at once. Two, because Resend's default rate limit is two
 * requests per second: more would just turn into 429s, counted as failures.
 */
const SEND_CONCURRENCY = 2;

/** True when `next` is a meaningful saving on `baseline` (both container prices in EUR). */
export function isMeaningfulDrop(baseline: number, next: number): boolean {
  return next > 0 && next <= Math.round(baseline * (1 - MIN_DROP_RATIO) * 100) / 100;
}

export interface PriceDropResult {
  productId: string;
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function notifyPriceDrop(productId: string, before: PriceSnapshot, after: PriceSnapshot): Promise<PriceDropResult> {
  const result: PriceDropResult = { productId, eligible: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isPriceDrop(before, after)) return result;

  // An email urging a purchase of something we can't sell is worse than none.
  const product = await prisma.product.findUnique({
    where: { id: productId, ...LISTED },
    select: { inStock: true, stockQuantity: true, pricePerKg: true, weightKg: true },
  });
  if (!product || !isPurchasable(product)) return result;
  // Re-read: if the price moved again since this change was scheduled, the
  // email quotes what is true now (and only if it is still a drop).
  if (!isPriceDrop(before, product)) return result;

  const oldPrice = cylinderGasPrice(before.pricePerKg, before.weightKg);
  const newPrice = cylinderGasPrice(product.pricePerKg, product.weightKg);
  const memory = new Date(Date.now() - ALERT_MEMORY_DAYS * 24 * 60 * 60 * 1000);

  const favorites = await prisma.favorite.findMany({
    where: { productId, user: { notifyPriceDrops: true, email: { not: null } } },
    select: { id: true, userId: true, lastAlertPrice: true, lastAlertAt: true },
    orderBy: { createdAt: "asc" },
    take: MAX_RECIPIENTS,
  });
  result.eligible = favorites.length;
  if (favorites.length === MAX_RECIPIENTS) {
    console.warn(`[price-drop] ${productId}: recipient cap (${MAX_RECIPIENTS}) reached — later favourites were not emailed for this change.`);
  }

  // One buyer's outcome. Isolated: a database error on one row must not
  // abandon everyone after it.
  const notifyOne = async (fav: (typeof favorites)[number]) => {
    try {
      // What this buyer last knew: the price we last emailed them (if recent),
      // otherwise the price before this change. A price nudged down three
      // times in an afternoon is announced once, and a small correction
      // under MIN_DROP_RATIO is not announced at all.
      const recent = fav.lastAlertAt !== null && fav.lastAlertAt > memory && fav.lastAlertPrice !== null;
      const baseline = recent ? Number(fav.lastAlertPrice) : oldPrice;
      if (!isMeaningfulDrop(baseline, newPrice)) {
        result.skipped += 1;
        return;
      }

      // Claim before sending, conditioned on what we just read, so two
      // changes processed at once can't both email the same person.
      const claimed = await prisma.favorite.updateMany({
        where: { id: fav.id, lastAlertPrice: fav.lastAlertPrice, lastAlertAt: fav.lastAlertAt },
        data: { lastAlertPrice: newPrice, lastAlertAt: new Date() },
      });
      if (claimed.count === 0) {
        result.skipped += 1;
        return;
      }

      const delivery = await sendPriceDropEmail({ userId: fav.userId, productId, oldPrice, newPrice });
      if (delivery.status === "sent") {
        result.sent += 1;
        return;
      }
      // Put the bookkeeping back so a later drop isn't measured against an
      // email that never arrived. Conditioned on our own claim: if a newer
      // change has claimed the row since, it is left alone.
      await prisma.favorite.updateMany({
        where: { id: fav.id, lastAlertPrice: newPrice },
        data: { lastAlertPrice: fav.lastAlertPrice, lastAlertAt: fav.lastAlertAt },
      });
      if (delivery.status === "failed") result.failed += 1;
      else result.skipped += 1;
    } catch (error) {
      console.error(`[price-drop] ${productId}: favourite ${fav.id} failed:`, error);
      result.failed += 1;
    }
  };

  // Two at a time (the provider's rate limit) rather than strictly one by
  // one, so a full batch finishes well inside the after() window.
  for (let i = 0; i < favorites.length; i += SEND_CONCURRENCY) {
    await Promise.all(favorites.slice(i, i + SEND_CONCURRENCY).map(notifyOne));
  }

  if (result.sent || result.failed) {
    console.log(`[price-drop] ${productId}: €${oldPrice} → €${newPrice}; sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`);
  }
  return result;
}
