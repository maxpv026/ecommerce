import "server-only";

import { render } from "@react-email/components";
import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { sellerDetails } from "@/lib/seller";
import { absoluteUrl } from "@/lib/siteUrl";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import RegulatoryUpdateEmail from "@/components/email/RegulatoryUpdateEmail";
import ReplenishmentEmail from "@/components/email/ReplenishmentEmail";
import PriceDropEmail from "@/components/email/PriceDropEmail";
import { cylinderGasPrice } from "@/lib/pricing";
import { LISTED } from "@/lib/productFamily";
import { isPurchasable } from "@/lib/waitlist";

/**
 * Preference-gated notification emails.
 *
 * Separate from lib/mail.ts on purpose: that module is the Prisma-free SMTP
 * transport (it sits on every sign-in's OTP path). This one owns the
 * "may we email this person about this?" decision, which needs the row.
 */

export type NotificationSendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: "NOT_FOUND" | "NO_EMAIL" | "OPTED_OUT" | "INVALID_INPUT" | "UNAVAILABLE" }
  | { status: "failed"; error: string };

/**
 * Sends one regulatory update to one user — only if they opted in.
 *
 * The preference is read from the database at send time, never passed in or
 * taken from a cached list: someone who unsubscribed a minute ago must not
 * get the next mail of a batch that was queued before. Opted out (or no
 * address) returns `skipped` without contacting the mail server; nothing
 * throws, so a caller looping over many users can't be stopped by one.
 */
export async function sendRegulatoryUpdateEmail(
  userId: string,
  subject: string,
  content: string
): Promise<NotificationSendResult> {
  const cleanSubject = cleanHeader(subject);
  if (!userId || !cleanSubject || cleanSubject.length > 200 || !content.trim()) {
    return { status: "skipped", reason: "INVALID_INPUT" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, locale: true, notifyRegulatoryUpdates: true },
  });
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyRegulatoryUpdates) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };

  return deliverRegulatoryEmail({ userId, ...user, email: user.email }, cleanSubject, content);
}

/**
 * The admin's "send a test to me" — the real template, to the admin's own
 * address only, marked [TEST]. Skips the opt-in check because it never
 * reaches anyone but the person pressing the button.
 */
export async function sendRegulatoryTestEmail(
  adminUserId: string,
  subject: string,
  content: string
): Promise<NotificationSendResult> {
  const cleanSubject = cleanHeader(subject);
  if (!cleanSubject || cleanSubject.length > 200 || !content.trim()) {
    return { status: "skipped", reason: "INVALID_INPUT" };
  }
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { email: true, name: true, locale: true },
  });
  if (!admin) return { status: "skipped", reason: "NOT_FOUND" };
  if (!admin.email) return { status: "skipped", reason: "NO_EMAIL" };
  return deliverRegulatoryEmail({ userId: adminUserId, ...admin, email: admin.email }, `[TEST] ${cleanSubject}`, content);
}

// CR/LF stripped: a subject is a header, and a newline in a header is how
// header injection starts.
const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

async function deliverRegulatoryEmail(
  recipient: { userId: string; email: string; name: string | null; locale: string },
  subject: string,
  content: string
): Promise<NotificationSendResult> {
  try {
    const oneClick = unsubscribeUrl(recipient.userId, "regulatory");
    const email = RegulatoryUpdateEmail({
      recipientName: recipient.name,
      subject,
      content,
      preferencesUrl: absoluteUrl("/profile/settings", recipient.locale),
      unsubscribeUrl: oneClick,
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);

    const delivery = await sendHtmlEmail({
      to: recipient.email,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return { status: "sent", messageId: delivery.messageId };
  } catch (error) {
    // The user id, never the address: logs are not where personal data goes.
    console.error(`[regulatory-email] send failed for user ${recipient.userId}:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One replenishment reminder (lib/smartRestock predicts, the cron decides).
 *
 * Re-reads at send time, like the regulatory email: the customer's
 * preference (an opt-out a minute ago wins over a batch selected earlier)
 * and the product's live price and availability (an email urging a reorder
 * of something we can't ship, or quoting yesterday's price, is worse than
 * none).
 */
export async function sendReplenishmentEmail(input: {
  userId: string;
  productId: string;
  recommendedQty: number;
  averageDays: number;
  predictedDate: Date;
}): Promise<NotificationSendResult> {
  const [user, product] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, companyName: true, locale: true, notifyRestockReminders: true },
    }),
    prisma.product.findUnique({
      where: { id: input.productId, ...LISTED },
      select: { sku: true, name: true, weight: true, pricePerKg: true, weightKg: true, cylinderDeposit: true, inStock: true, stockQuantity: true },
    }),
  ]);
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyRestockReminders) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };
  if (!product || !isPurchasable(product) || !(product.pricePerKg > 0)) return { status: "skipped", reason: "UNAVAILABLE" };

  try {
    const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
    const deposit = Number(product.cylinderDeposit);
    const qty = Math.min(99, Math.max(1, input.recommendedQty));
    const oneClick = unsubscribeUrl(input.userId, "restockReminders");
    const reorder = absoluteUrl(`/cart?reorder=${encodeURIComponent(product.sku)}&qty=${qty}`, user.locale);
    const email = ReplenishmentEmail({
      recipientName: user.name,
      companyName: user.companyName,
      productName: product.name,
      sku: product.sku,
      variant: product.weight,
      unitPrice: money.format(cylinderGasPrice(product.pricePerKg, product.weightKg)),
      deposit: deposit > 0 ? money.format(deposit) : null,
      recommendedQty: qty,
      everyDays: Math.round(input.averageDays),
      expectedDate: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(input.predictedDate),
      reorderUrl: reorder,
      preferencesUrl: absoluteUrl("/profile/settings", user.locale),
      unsubscribeUrl: oneClick,
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
    const delivery = await sendHtmlEmail({
      to: user.email,
      subject: cleanHeader(`Restock reminder: ${product.name} (${product.sku})`),
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return { status: "sent", messageId: delivery.messageId };
  } catch (error) {
    console.error(`[replenishment-email] send failed for user ${input.userId}:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One price-drop email (lib/priceDrop decides who and when). Re-reads the
 * buyer's opt-in at send time, like the other preference-gated emails: an
 * opt-out a moment ago wins over a batch selected before it.
 */
export async function sendPriceDropEmail(input: {
  userId: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
}): Promise<NotificationSendResult> {
  if (!(input.newPrice > 0) || !(input.newPrice < input.oldPrice)) return { status: "skipped", reason: "INVALID_INPUT" };

  const [user, product] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true, locale: true, notifyPriceDrops: true } }),
    prisma.product.findUnique({ where: { id: input.productId, ...LISTED }, select: { sku: true, name: true, weight: true } }),
  ]);
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyPriceDrops) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };
  if (!product) return { status: "skipped", reason: "UNAVAILABLE" };

  try {
    const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
    const oneClick = unsubscribeUrl(input.userId, "priceDrops");
    const saving = Math.round(((input.oldPrice - input.newPrice) / input.oldPrice) * 100);
    const email = PriceDropEmail({
      recipientName: user.name,
      productName: product.name,
      sku: product.sku,
      variant: product.weight,
      oldPrice: money.format(input.oldPrice),
      newPrice: money.format(input.newPrice),
      // Under 1% rounds to 0 — say "<1%" rather than "−0%".
      saving: saving >= 1 ? `${saving}%` : "<1%",
      productUrl: absoluteUrl(`/products/${input.productId}`, user.locale),
      favoritesUrl: absoluteUrl("/profile/favorites", user.locale),
      preferencesUrl: absoluteUrl("/profile/settings", user.locale),
      unsubscribeUrl: oneClick,
      sender: sellerDetails(),
    });
    const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
    const delivery = await sendHtmlEmail({
      to: user.email,
      subject: cleanHeader(`Price drop: ${product.name} (${product.sku}) is now ${money.format(input.newPrice)}`),
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return { status: "sent", messageId: delivery.messageId };
  } catch (error) {
    console.error(`[price-drop-email] send failed for user ${input.userId}:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
