"use server";

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendCartReminderEmail } from "@/lib/cartReminder";
import { sendReplenishmentEmail } from "@/lib/notificationEmail";
import { getRestockPredictions } from "@/lib/smartRestock";

export type TestNotificationKind = "abandonedCart" | "restockReminders";

export type TestNotificationResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "RATE_LIMITED" | "CART_EMPTY" | "NO_HISTORY" | "NOTHING_AVAILABLE" | "NO_EMAIL" | "FAILED" };

/**
 * Settings → "Send a test to my email".
 *
 * The real email, built by the real sender from the account's own data —
 * the saved basket, or the restock prediction for something they actually
 * bought — to the account holder's own address only, subject marked [TEST].
 * It records nothing: no reminder is claimed, no RestockAlert is created, so
 * a test can never suppress the genuine reminder later.
 *
 * When there is nothing real to send, it says so instead of inventing an
 * example: an empty basket, or no order history to predict from.
 */
export async function sendTestNotification(kind: TestNotificationKind): Promise<TestNotificationResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };
  if (!checkRateLimit(`notification-test:${userId}`, { limit: 4, windowMs: 10 * 60_000 }).success) return { ok: false, code: "RATE_LIMITED" };

  try {
    if (kind === "abandonedCart") {
      const result = await sendCartReminderEmail(userId, { test: true });
      if (result.status === "sent") return { ok: true };
      if (result.status === "failed") return { ok: false, code: "FAILED" };
      return {
        ok: false,
        code: result.reason === "INVALID_INPUT" ? "CART_EMPTY" : result.reason === "UNAVAILABLE" ? "NOTHING_AVAILABLE" : result.reason === "NO_EMAIL" ? "NO_EMAIL" : "FAILED",
      };
    }

    const predictions = await getRestockPredictions({ userId, includeOptedOut: true });
    if (predictions.length === 0) return { ok: false, code: "NO_HISTORY" };
    for (const p of predictions) {
      const result = await sendReplenishmentEmail({
        userId,
        productId: p.productId,
        recommendedQty: p.recommendedQty,
        averageDays: p.averageDays,
        fixedDays: p.fixedDays,
        lastOrderedAt: p.lastOrderedAt,
        predictedDate: p.predictedDate,
        test: true,
      });
      if (result.status === "sent") return { ok: true };
      if (result.status === "failed") return { ok: false, code: "FAILED" };
      if (result.reason === "NO_EMAIL") return { ok: false, code: "NO_EMAIL" };
      // UNAVAILABLE: try their next product.
    }
    return { ok: false, code: "NOTHING_AVAILABLE" };
  } catch (error) {
    console.error(`[notification-test] ${kind} for user ${userId} failed:`, error);
    return { ok: false, code: "FAILED" };
  }
}
