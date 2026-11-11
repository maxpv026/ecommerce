import "server-only";

import { render } from "@react-email/components";
import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { tidyDots } from "@/lib/emailTranslator";
import { sellerDetails } from "@/lib/seller";
import { absoluteUrl } from "@/lib/siteUrl";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { emailTranslator } from "@/lib/emailTranslator";
import { cylinderGasPrice } from "@/lib/pricing";
import { LISTED } from "@/lib/productFamily";
import { parseSavedItems } from "@/lib/savedCart";
import CartReminderEmail, { type CartReminderLine } from "@/components/email/CartReminderEmail";
import type { NotificationSendResult } from "@/lib/notificationEmail";

/**
 * Abandoned-cart reminders.
 *
 * A signed-in buyer's basket is mirrored to SavedCart (components/cart/
 * CartServerSync → /api/cart/sync). A basket whose contents have not changed
 * for CART_IDLE_MS, that never became an order, is reminded about once —
 * by email, with today's price and stock for every line, through the same
 * SMTP transport as every other message.
 *
 * ── One reminder per basket ──
 * `reminderSentAt` is claimed before sending (an optimistic update on the
 * row as it was read), so overlapping cron runs cannot both send. A basket
 * is eligible again only after its contents change, and never sooner than
 * REMINDER_COOLDOWN_MS after the last reminder: someone who keeps tweaking
 * a basket for a week gets at most one email every few days, not one per edit.
 */

/** How long a basket must sit untouched before it counts as abandoned. */
export const CART_IDLE_MS = 4 * 60 * 60 * 1000;
/** Minimum gap between two reminders to the same buyer. */
export const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** Older baskets are stale: the buyer has moved on, a reminder would be noise. */
export const MAX_CART_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface DueCart {
  userId: string;
  contentUpdatedAt: Date;
  reminderSentAt: Date | null;
  itemCount: number;
}

export interface DueCartsResult {
  due: DueCart[];
  skipped: { cooldown: number; orderedSince: number; alreadyReminded: number };
}

/** Baskets owed a reminder now. Read-only — nothing is claimed here. */
export async function selectDueCarts(options: { now?: Date; userId?: string | null } = {}): Promise<DueCartsResult> {
  const now = options.now?.getTime() ?? Date.now();
  const rows = await prisma.savedCart.findMany({
    where: {
      ...(options.userId ? { userId: options.userId } : {}),
      contentUpdatedAt: { lte: new Date(now - CART_IDLE_MS), gte: new Date(now - MAX_CART_AGE_MS) },
      itemCount: { gt: 0 },
      user: { notifyAbandonedCart: true, email: { not: null } },
    },
    select: { userId: true, contentUpdatedAt: true, reminderSentAt: true, itemCount: true },
    orderBy: { contentUpdatedAt: "asc" },
    take: 500,
  });

  const skipped = { cooldown: 0, orderedSince: 0, alreadyReminded: 0 };
  const candidates = rows.filter((r) => {
    if (r.reminderSentAt && r.reminderSentAt >= r.contentUpdatedAt) {
      skipped.alreadyReminded += 1;
      return false;
    }
    if (r.reminderSentAt && now - r.reminderSentAt.getTime() < REMINDER_COOLDOWN_MS) {
      skipped.cooldown += 1;
      return false;
    }
    return true;
  });
  if (candidates.length === 0) return { due: [], skipped };

  // Belt and braces: checkout deletes the snapshot, but if that delete was
  // lost, an order placed after the basket's last change means it was bought.
  const orders = await prisma.order.findMany({
    where: { userId: { in: candidates.map((c) => c.userId) }, createdAt: { gte: new Date(Math.min(...candidates.map((c) => c.contentUpdatedAt.getTime()))) } },
    select: { userId: true, createdAt: true },
  });
  const due = candidates.filter((c) => {
    const ordered = orders.some((o) => o.userId === c.userId && o.createdAt >= c.contentUpdatedAt);
    if (ordered) skipped.orderedSince += 1;
    return !ordered;
  });
  return { due, skipped };
}

/**
 * Takes this basket's reminder before sending. Matches the row exactly as it
 * was read, so a concurrent run (or an edit in between) makes it a no-op.
 */
export async function claimCartReminder(cart: DueCart, at = new Date()): Promise<boolean> {
  const { count } = await prisma.savedCart.updateMany({
    where: { userId: cart.userId, contentUpdatedAt: cart.contentUpdatedAt, reminderSentAt: cart.reminderSentAt },
    data: { reminderSentAt: at },
  });
  return count === 1;
}

/** A send that did not happen gives the claim back, so a later run retries. */
export async function releaseCartReminder(cart: DueCart, claimedAt: Date): Promise<void> {
  await prisma.savedCart.updateMany({ where: { userId: cart.userId, reminderSentAt: claimedAt }, data: { reminderSentAt: cart.reminderSentAt } });
}

/**
 * Renders and sends one reminder from the saved basket, at today's prices.
 *
 * Re-reads everything at send time: the opt-in (an unsubscribe a minute ago
 * wins), the basket and every product. Lines no longer listed are dropped;
 * lines out of stock are shown as such, and when nothing at all can be
 * bought the reminder is skipped — urging checkout of an unshippable basket
 * is worse than silence. `test` sends to the account holder on request from
 * Settings: marked as a test, and sent even with the topic switched off.
 */
export async function sendCartReminderEmail(userId: string, options: { test?: boolean } = {}): Promise<NotificationSendResult> {
  const [user, cart] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, locale: true, notifyAbandonedCart: true } }),
    prisma.savedCart.findUnique({ where: { userId }, select: { items: true, contentUpdatedAt: true } }),
  ]);
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyAbandonedCart && !options.test) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };
  const items = parseSavedItems(cart?.items);
  if (!cart || items.length === 0) return { status: "skipped", reason: "INVALID_INPUT" };

  const products = await prisma.product.findMany({
    where: { ...LISTED, sku: { in: items.map((i) => i.sku) } },
    select: { sku: true, name: true, weight: true, pricePerKg: true, weightKg: true, cylinderDeposit: true, inStock: true, stockQuantity: true },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  try {
    const { t, locale } = await emailTranslator(user.locale, "CartReminderEmail");
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });

    let gas = 0;
    let deposits = 0;
    let buyable = 0;
    const lines: CartReminderLine[] = [];
    for (const item of items) {
      const p = bySku.get(item.sku);
      if (!p || !(p.pricePerKg > 0)) continue;
      const unit = cylinderGasPrice(p.pricePerKg, p.weightKg);
      const deposit = Number(p.cylinderDeposit);
      const available = p.inStock && p.stockQuantity > 0;
      const stock: CartReminderLine["stock"] = !available
        ? { label: t("stockOut"), tone: "out" }
        : p.stockQuantity < item.qty
          ? { label: t("stockLow", { count: p.stockQuantity }), tone: "low" }
          : { label: t("stockIn"), tone: "ok" };
      if (available) {
        buyable += 1;
        gas += unit * item.qty;
        deposits += deposit * item.qty;
      }
      lines.push({
        name: p.name,
        meta: [p.weight, p.sku].filter(Boolean).join(" · "),
        qty: item.qty,
        unitPrice: money.format(unit),
        lineTotal: money.format((unit + deposit) * item.qty),
        stock,
      });
    }
    if (buyable === 0) return { status: "skipped", reason: "UNAVAILABLE" };

    const count = lines.reduce((n, l) => n + l.qty, 0);
    const oneClick = unsubscribeUrl(userId, "abandonedCart");
    const subject = (options.test ? "[TEST] " : "") + t("subject", { count });
    const email = CartReminderEmail({
      lang: locale,
      preview: t("preview", { count }),
      kicker: t("kicker"),
      heading: t("heading", { count }),
      greeting: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName"),
      intro: tidyDots(t("intro", { date: date.format(cart.contentUpdatedAt) })),
      testBanner: options.test ? t("testBanner") : null,
      lines,
      labels: { qty: t("qty"), total: t("lineTotal") },
      totals: [
        { label: t("totalGas"), value: money.format(gas) },
        ...(deposits > 0 ? [{ label: t("totalDeposits"), value: money.format(deposits) }] : []),
        { label: t("totalExVat"), value: money.format(gas + deposits), strong: true },
      ],
      totalsNote: t("totalsNote"),
      cta: { label: t("cta"), href: absoluteUrl("/cart?restore=1", locale) },
      ctaNote: t("ctaNote"),
      footer: t("footer"),
      preferences: { label: t("managePreferences"), href: absoluteUrl("/profile/settings", locale) },
      unsubscribe: { label: t("unsubscribe"), href: oneClick },
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
    const delivery = await sendHtmlEmail({
      to: user.email,
      subject: subject.replace(/[\r\n]+/g, " "),
      html,
      text,
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    return { status: "sent", messageId: delivery.messageId };
  } catch (error) {
    console.error(`[cart-reminder] send failed for user ${userId}:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
