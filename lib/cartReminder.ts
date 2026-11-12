import "server-only";

import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { tidyDots } from "@/lib/emailTranslator";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { emailContext } from "@/lib/email/context";
import type { ItemLine } from "@/lib/email/design";
import { calculateCartTotals, VAT_RATE, type CartPricingLine } from "@/lib/cart";
import { cylinderGasPrice } from "@/lib/pricing";
import { LISTED } from "@/lib/productFamily";
import { parseSavedItems } from "@/lib/savedCart";
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
    select: { sku: true, name: true, weight: true, gwpClass: true, gwp: true, pricePerKg: true, weightKg: true, cylinderDeposit: true, inStock: true, stockQuantity: true },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  try {
    const c = await emailContext(user.locale, "CartReminderEmail");

    const priced: CartPricingLine[] = [];
    const lines: ItemLine[] = [];
    let excluded = 0;
    for (const item of items) {
      const p = bySku.get(item.sku);
      if (!p || !(p.pricePerKg > 0)) continue;
      const unit = cylinderGasPrice(p.pricePerKg, p.weightKg);
      const available = p.inStock && p.stockQuantity > 0;
      const stock = !available
        ? { label: c.t("stockOut"), tone: "danger" as const }
        : p.stockQuantity < item.qty
          ? { label: c.t("stockLow", { count: p.stockQuantity }), tone: "warning" as const }
          : { label: c.t("stockIn"), tone: "success" as const };
      if (available) priced.push({ pricePerKg: p.pricePerKg, weightKg: p.weightKg, qty: item.qty, deposit: Number(p.cylinderDeposit) });
      else excluded += 1;
      const compliance = [p.gwpClass?.trim(), p.gwp ? c.s("gwp", { value: p.gwp }) : ""].filter(Boolean).join(" · ");
      lines.push({
        name: p.name,
        qty: item.qty,
        meta: [p.weight, c.s("sku", { sku: p.sku }), c.s("perUnit", { price: c.money(unit) })].filter(Boolean),
        badges: [{ label: `● ${stock.label}`, tone: stock.tone }, ...(compliance ? [{ label: compliance, tone: "neutral" as const }] : [])],
        total: c.money(unit * item.qty),
        muted: !available,
      });
    }
    if (priced.length === 0) return { status: "skipped", reason: "UNAVAILABLE" };

    // The checkout's own arithmetic (lib/cart), so the reminder quotes what
    // the buyer will actually be charged — freight and VAT included.
    const totals = calculateCartTotals(priced);
    const count = lines.reduce((n, l) => n + (l.qty ?? 0), 0);
    const oneClick = unsubscribeUrl(userId, "abandonedCart");
    const subject = (options.test ? "[TEST] " : "") + c.t("subject", { count });
    const name = user.name?.trim();
    const { html, text } = c.render({
      subject,
      preview: c.t("preview", { count }),
      reference: c.t("kicker").toLocaleUpperCase(c.locale),
      heading: c.t("heading", { count }),
      testBanner: options.test ? c.t("testBanner") : null,
      blocks: [
        { kind: "text", text: name ? c.t("greeting", { name }) : c.t("greetingNoName") },
        { kind: "text", text: tidyDots(c.t("intro", { date: c.date(cart.contentUpdatedAt) })) },
        { kind: "items", qtyLabel: c.t("qty"), lines },
        {
          kind: "ledger",
          rows: [
            { label: c.s("ledgerSubtotal"), value: c.money(totals.subtotal) },
            ...(totals.deposit > 0 ? [{ label: c.s("ledgerDeposit", { count: totals.depositUnits }), value: c.money(totals.deposit) }] : []),
            { label: c.s("ledgerFreight"), value: c.money(totals.shipping) },
            { label: c.s("ledgerVat", { rate: Math.round(VAT_RATE * 100) }), value: c.money(totals.vat) },
          ],
          total: { label: c.s("ledgerTotal"), value: c.money(totals.total) },
          note: excluded > 0 ? c.t("ledgerNoteExcluded") : c.t("ledgerNote"),
        },
        { kind: "cta", label: c.t("cta"), href: c.url("/cart?restore=1"), note: c.t("ctaNote") },
      ],
      footer: { reason: c.t("footer"), unsubscribe: { label: c.s("unsubscribe"), href: oneClick } },
    });
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
