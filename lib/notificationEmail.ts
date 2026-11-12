import "server-only";

import prisma from "@/lib/prisma";
import { sendHtmlEmail } from "@/lib/mail";
import { tidyDots } from "@/lib/emailTranslator";
import { emailContext } from "@/lib/email/context";
import type { Block } from "@/lib/email/design";
import { unsubscribeUrl } from "@/lib/unsubscribe";
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
    const c = await emailContext(recipient.locale, "BroadcastEmail");
    // Plain text; blank lines separate paragraphs. Escaped by the renderer,
    // so a stray "<" in an update can't become markup.
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const firstName = recipient.name?.trim().split(/\s+/)[0];
    const { html, text } = c.render({
      subject,
      preview: paragraphs[0]?.slice(0, 140) ?? subject,
      reference: c.t("badge").toLocaleUpperCase(c.locale),
      kicker: { label: c.t("kicker"), tone: "brand" },
      heading: subject.replace(/^\[TEST\]\s*/, ""),
      testBanner: subject.startsWith("[TEST]") ? c.t("testBanner") : null,
      blocks: [
        ...(firstName ? ([{ kind: "text", text: c.t("greeting", { name: firstName }) }] satisfies Block[]) : []),
        ...paragraphs.map((p): Block => ({ kind: "text", text: p })),
        { kind: "callout", tone: "neutral", text: c.t("disclaimer") },
      ],
      footer: { reason: c.t("reason"), unsubscribe: { label: c.s("unsubscribe"), href: oneClick } },
    });

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
  /** The customer's fixed cadence, or null when learned from their history. */
  fixedDays?: number | null;
  lastOrderedAt?: Date;
  predictedDate: Date;
  /** The account holder's own test from Settings: marked, sent even if switched off. */
  test?: boolean;
}): Promise<NotificationSendResult> {
  const [user, product] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, companyName: true, locale: true, notifyRestockReminders: true },
    }),
    prisma.product.findUnique({
      where: { id: input.productId, ...LISTED },
      select: { sku: true, name: true, weight: true, gwpClass: true, gwp: true, pricePerKg: true, weightKg: true, cylinderDeposit: true, inStock: true, stockQuantity: true },
    }),
  ]);
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyRestockReminders && !input.test) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };
  if (!product || !isPurchasable(product) || !(product.pricePerKg > 0)) return { status: "skipped", reason: "UNAVAILABLE" };

  try {
    const c = await emailContext(user.locale, "ReplenishmentEmail");
    const { t, locale } = c;
    const date = c.date;
    const deposit = Number(product.cylinderDeposit);
    const unit = cylinderGasPrice(product.pricePerKg, product.weightKg);
    const unitPrice = c.money(unit);
    const qty = Math.min(99, Math.max(1, input.recommendedQty));
    const oneClick = unsubscribeUrl(input.userId, "restockReminders");
    const label = `${product.name} (${product.sku})`;

    const cadence = input.fixedDays
      ? t("bodyFixed", { product: label, days: input.fixedDays, lastDate: date(input.lastOrderedAt ?? input.predictedDate) })
      : t(user.companyName ? "bodyLearnedCompany" : "bodyLearned", {
          product: label,
          company: user.companyName ?? "",
          days: Math.round(input.averageDays),
          date: date(input.predictedDate),
        });
    const price = deposit > 0
      ? t("bodyPriceDeposit", { price: unitPrice, variant: product.weight, deposit: c.money(deposit), qty })
      : t("bodyPrice", { price: unitPrice, variant: product.weight, qty });
    const compliance = [product.gwpClass?.trim(), product.gwp ? c.s("gwp", { value: product.gwp }) : ""].filter(Boolean).join(" · ");

    const subject = cleanHeader((input.test ? "[TEST] " : "") + t("subject", { product: label }));
    const { html, text } = c.render({
      subject,
      preview: t("preview", { product: label }),
      reference: t("kicker").toLocaleUpperCase(locale),
      heading: product.name,
      testBanner: input.test ? t("testBanner") : null,
      blocks: [
        { kind: "text", text: user.name?.trim() ? t("greeting", { name: user.name.trim() }) : t("greetingNoName") },
        ...[cadence, price].map((p): Block => ({ kind: "text", text: tidyDots(p) })),
        {
          kind: "items",
          qtyLabel: c.s("qty"),
          lines: [
            {
              name: product.name,
              qty,
              meta: [product.weight, c.s("sku", { sku: product.sku }), c.s("perUnit", { price: unitPrice })].filter(Boolean),
              badges: compliance ? [{ label: compliance, tone: "neutral" }] : [],
              total: c.money(unit * qty),
            },
          ],
        },
        { kind: "cta", label: t("cta"), href: c.url(`/cart?reorder=${encodeURIComponent(product.sku)}&qty=${qty}`), note: t("ctaNote") },
        { kind: "callout", tone: "neutral", text: input.fixedDays ? t("disclaimerFixed") : t("disclaimerLearned") },
      ],
      footer: { reason: t("footer"), unsubscribe: { label: c.s("unsubscribe"), href: oneClick } },
    });
    const delivery = await sendHtmlEmail({
      to: user.email,
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
    prisma.product.findUnique({ where: { id: input.productId, ...LISTED }, select: { sku: true, name: true, weight: true, gwpClass: true, gwp: true } }),
  ]);
  if (!user) return { status: "skipped", reason: "NOT_FOUND" };
  if (!user.notifyPriceDrops) return { status: "skipped", reason: "OPTED_OUT" };
  if (!user.email) return { status: "skipped", reason: "NO_EMAIL" };
  if (!product) return { status: "skipped", reason: "UNAVAILABLE" };

  try {
    const c = await emailContext(user.locale, "PriceDropEmail");
    const oneClick = unsubscribeUrl(input.userId, "priceDrops");
    const saving = Math.round(((input.oldPrice - input.newPrice) / input.oldPrice) * 100);
    // Under 1% rounds to 0 — say "<1%" rather than "−0%".
    const savingLabel = saving >= 1 ? `−${saving}%` : "<1%";
    const newPrice = c.money(input.newPrice);
    const oldPrice = c.money(input.oldPrice);
    const subject = cleanHeader(c.t("subject", { product: product.name, sku: product.sku, price: newPrice }));
    const name = user.name?.trim();
    const compliance = [product.gwpClass?.trim(), product.gwp ? c.s("gwp", { value: product.gwp }) : ""].filter(Boolean).join(" · ");
    const { html, text } = c.render({
      subject,
      preview: c.t("preview", { product: product.name, price: newPrice, old: oldPrice }),
      reference: c.t("badge").toLocaleUpperCase(c.locale),
      kicker: { label: c.t("kicker", { saving: savingLabel }), tone: "success" },
      heading: product.name,
      blocks: [
        { kind: "text", text: name ? c.t("greeting", { name }) : c.t("greetingNoName") },
        { kind: "text", text: c.rich("body", { product: product.name, variant: product.weight, price: newPrice, old: oldPrice }, ["price"]) },
        {
          kind: "items",
          qtyLabel: c.s("qty"),
          lines: [
            {
              name: product.name,
              meta: [product.weight, c.s("sku", { sku: product.sku }), c.t("exVat")].filter(Boolean),
              badges: [{ label: savingLabel, tone: "success" }, ...(compliance ? [{ label: compliance, tone: "neutral" as const }] : [])],
              was: oldPrice,
              total: newPrice,
            },
          ],
        },
        { kind: "cta", label: c.t("cta"), href: c.url(`/products/${input.productId}`), note: c.t("ctaNote") },
        { kind: "text", tone: "small", text: [{ a: c.t("favorites"), href: c.url("/profile/favorites") }] },
      ],
      footer: { reason: c.t("reason"), unsubscribe: { label: c.s("unsubscribe"), href: oneClick } },
    });
    const delivery = await sendHtmlEmail({
      to: user.email,
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
    console.error(`[price-drop-email] send failed for user ${input.userId}:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
