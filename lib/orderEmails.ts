import "server-only";

import prisma from "@/lib/prisma";
import { sendHtmlEmail, type MailDelivery } from "@/lib/mail";
import { emailContext, type EmailContext } from "@/lib/email/context";
import type { Block, ItemLine } from "@/lib/email/design";
import { orderBreakdown } from "@/lib/orderTotals";
import { bankTransferDetails, formatIban } from "@/lib/bankTransfer";
import { isBankTransfer } from "@/lib/payment";

/**
 * The emails about one order: the confirmation (with the invoice PDF) and
 * the fulfilment updates (dispatched with DHL tracking, delivered).
 *
 * Built from the ORDER AS STORED, not from the checkout's working values:
 * the same frozen lines and total the invoice PDF and the order page read,
 * through the same orderBreakdown, so the email can never show a figure
 * that differs from the invoice attached to it.
 */

const DHL_TRACKING = (n: string) => `https://www.dhl.com/global-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${encodeURIComponent(n)}`;

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      estimatedDelivery: true,
      paymentMethod: true,
      paymentStatus: true,
      trackingNumber: true,
      shippingAddress: true,
      createdAt: true,
      authorizingCertificateNumber: true,
      authorizingCertificateExpiresAt: true,
      invoice: { select: { invoiceNumber: true } },
      user: { select: { name: true, email: true, companyName: true, vatNumber: true, locale: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          quantity: true,
          priceAtPurchase: true,
          depositAtPurchase: true,
          gwpAtPurchase: true,
          product: { select: { name: true, sku: true, weight: true, gwpClass: true, gwp: true } },
        },
      },
    },
  });
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function itemLines(c: EmailContext, order: LoadedOrder, withMoney: boolean): ItemLine[] {
  return order.items.map((item) => {
    const unit = Number(item.priceAtPurchase);
    const gwp = item.gwpAtPurchase ?? item.product.gwp;
    const compliance = [item.product.gwpClass?.trim(), gwp ? c.s("gwp", { value: gwp }) : ""].filter(Boolean).join(" · ");
    return {
      name: item.product.name,
      qty: item.quantity,
      meta: [item.product.weight, c.s("sku", { sku: item.product.sku }), ...(withMoney ? [c.s("perUnit", { price: c.money(unit) })] : [])].filter(Boolean),
      badges: compliance ? [{ label: compliance, tone: "neutral" as const }] : [],
      total: withMoney ? c.money(unit * item.quantity) : undefined,
    };
  });
}

const breakdownOf = (order: LoadedOrder) =>
  orderBreakdown(
    order.items.map((i) => ({ priceAtPurchase: Number(i.priceAtPurchase), quantity: i.quantity, depositAtPurchase: Number(i.depositAtPurchase) })),
    Number(order.totalAmount)
  );

function ledger(c: EmailContext, b: ReturnType<typeof breakdownOf>): Block {
  return {
    kind: "ledger",
    rows: [
      { label: c.s("ledgerSubtotal"), value: c.money(b.subtotal) },
      ...(b.deposit > 0 ? [{ label: c.s("ledgerDeposit", { count: b.depositUnits }), value: c.money(b.deposit) }] : []),
      { label: c.s("ledgerFreight"), value: c.money(b.shipping) },
      { label: c.s("ledgerVat", { rate: b.vatRatePercent }), value: c.money(b.vat) },
    ],
    total: { label: c.s("ledgerTotal"), value: c.money(b.total) },
    note: b.deposit > 0 ? c.s("ledgerDepositNote") : undefined,
  };
}

/** Order.shippingAddress is frozen one fact per line (lib/orders formatDeliveryAddress). */
const addressText = (raw: string | null) => (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join("\n");

/**
 * The confirmation, with the invoice attached. Returns the delivery (or null
 * when there is no address to send to) and never throws: the order is placed
 * by the time this runs, and a bounced email must not look like a failed
 * checkout. The caller logs what came back.
 */
export async function sendOrderConfirmation(orderId: string, invoicePdf: Buffer | null): Promise<MailDelivery | null> {
  try {
    return await confirmation(orderId, invoicePdf);
  } catch (error) {
    console.error(`[order-email] confirmation for order ${orderId} failed:`, error);
    return null;
  }
}

async function confirmation(orderId: string, invoicePdf: Buffer | null): Promise<MailDelivery | null> {
  const order = await loadOrder(orderId);
  if (!order?.user.email || !order.invoice) return null;
  const c = await emailContext(order.user.locale, "OrderEmail");
  const invoice = order.invoice.invoiceNumber;
  const b = breakdownOf(order);
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const name = order.user.name?.trim();
  const bank = bankTransferDetails();
  const unpaid = order.paymentStatus !== "PAID" && isBankTransfer(order.paymentMethod);

  const billTo = [order.user.companyName, name, order.user.vatNumber ? c.t("vatId", { vat: order.user.vatNumber }) : "", order.user.email].filter(Boolean).join("\n");

  const subject = c.t("subject", { order: order.orderNumber, invoice });
  const { html, text } = c.render({
    subject,
    preview: c.t("preview", { count, total: c.money(b.total), invoice }),
    reference: invoice,
    kicker: { label: c.t("kicker"), tone: "success" },
    heading: name ? c.t("heading", { name }) : c.t("headingNoName"),
    blocks: [
      { kind: "text", text: c.rich(invoicePdf ? "intro" : "introNoPdf", { order: order.orderNumber, invoice }, ["order", "invoice"]) },
      { kind: "items", qtyLabel: c.s("qty"), lines: itemLines(c, order, true) },
      ledger(c, b),
      {
        kind: "facts",
        title: c.t("summaryTitle"),
        rows: [
          { label: c.t("fieldOrder"), value: order.orderNumber, mono: true },
          { label: c.t("fieldInvoice"), value: invoice, mono: true, note: invoicePdf ? c.t("invoiceAttached") : undefined },
          { label: c.t("fieldPayment"), value: isBankTransfer(order.paymentMethod) ? c.t("paymentBank") : (order.paymentMethod ?? "—") },
          { label: c.t("fieldShipping"), value: c.t("shippingAdr"), note: c.t("etaNote", { date: c.date(order.estimatedDelivery) }) },
          ...(order.authorizingCertificateNumber
            ? [
                {
                  label: c.t("fieldCertificate"),
                  value: order.authorizingCertificateNumber,
                  mono: true,
                  note: order.authorizingCertificateExpiresAt ? c.t("certificateValid", { date: c.date(order.authorizingCertificateExpiresAt) }) : undefined,
                },
              ]
            : []),
          ...(order.shippingAddress ? [{ label: c.t("shipTo"), value: addressText(order.shippingAddress) }] : []),
          ...(billTo ? [{ label: c.t("billTo"), value: billTo }] : []),
        ],
      },
      ...(unpaid
        ? ([
            {
              kind: "facts",
              title: c.t("bankTitle"),
              rows: [
                { label: c.t("bankBeneficiary"), value: bank.beneficiary },
                { label: c.t("bankAmount"), value: c.money(b.total), mono: true },
                { label: c.t("bankIban"), value: formatIban(bank.iban), mono: true },
                ...(bank.bic ? [{ label: c.t("bankBic"), value: bank.bic, mono: true }] : []),
                { label: c.t("bankReference"), value: invoice, mono: true },
                { label: c.t("bankName"), value: bank.bank },
              ],
            },
          ] satisfies Block[])
        : []),
      ...(b.depositUnits > 0
        ? ([{ kind: "callout", tone: "brand", title: c.t("depositTitle"), text: c.t("depositBody", { count: b.depositUnits, amount: c.money(b.deposit) }) }] satisfies Block[])
        : []),
      { kind: "cta", label: c.t("cta"), href: c.url(`/profile/orders/${order.id}`) },
    ],
    footer: { reason: c.t("reason") },
  });

  return sendHtmlEmail({
    to: order.user.email,
    subject: subject.replace(/[\r\n]+/g, " "),
    html,
    text,
    // Omitted entirely when rendering failed: an email with a 0-byte
    // "invoice.pdf" is worse than one that says where to find it.
    ...(invoicePdf ? { attachments: [{ filename: `${invoice}.pdf`, content: invoicePdf, contentType: "application/pdf" }] } : {}),
  });
}

export type FulfilmentEmailKind = "SHIPPED" | "DELIVERED";

/**
 * A fulfilment update: dispatched (with the DHL tracking number) or
 * delivered. Transactional, so it is not gated by marketing preferences.
 * Never throws — the status change is committed before this runs.
 */
export async function sendOrderStatusEmail(orderId: string, kind: FulfilmentEmailKind): Promise<boolean> {
  try {
    const order = await loadOrder(orderId);
    if (!order?.user.email) return false;
    if (kind === "SHIPPED" && !order.trackingNumber) return false;
    const c = await emailContext(order.user.locale, "OrderEmail");
    const name = order.user.name?.trim();
    const deposits = order.items.reduce((n, i) => n + (Number(i.depositAtPurchase) > 0 ? i.quantity : 0), 0);
    const depositSum = order.items.reduce((n, i) => n + Number(i.depositAtPurchase) * i.quantity, 0);
    const shipped = kind === "SHIPPED";

    const subject = shipped ? c.t("shippedSubject", { order: order.orderNumber }) : c.t("deliveredSubject", { order: order.orderNumber });
    const facts: Block = {
      kind: "facts",
      rows: [
        { label: c.t("fieldOrder"), value: order.orderNumber, mono: true },
        ...(order.invoice ? [{ label: c.t("fieldInvoice"), value: order.invoice.invoiceNumber, mono: true }] : []),
        { label: c.t("fieldCarrier"), value: "DHL" },
        ...(order.trackingNumber ? [{ label: c.t("fieldTracking"), value: order.trackingNumber, mono: true }] : []),
        ...(shipped ? [{ label: c.t("fieldEta"), value: c.date(order.estimatedDelivery) }] : []),
        ...(order.shippingAddress ? [{ label: c.t("shipTo"), value: addressText(order.shippingAddress) }] : []),
      ],
    };

    const { html, text } = c.render({
      subject,
      preview: shipped ? c.t("shippedPreview", { tracking: order.trackingNumber ?? "" }) : c.t("deliveredPreview", { order: order.orderNumber }),
      reference: order.orderNumber,
      kicker: { label: shipped ? c.t("shippedKicker") : c.t("deliveredKicker"), tone: shipped ? "brand" : "success" },
      heading: shipped ? c.t("shippedHeading") : c.t("deliveredHeading"),
      blocks: [
        ...(name ? ([{ kind: "text", text: c.t("greeting", { name }) }] satisfies Block[]) : []),
        { kind: "text", text: c.rich(shipped ? "shippedBody" : "deliveredBody", { order: order.orderNumber }, ["order"]) },
        facts,
        { kind: "items", qtyLabel: c.s("qty"), lines: itemLines(c, order, false) },
        ...(!shipped && deposits > 0
          ? ([{ kind: "callout", tone: "brand", title: c.t("depositTitle"), text: c.t("deliveredReturn", { count: deposits, amount: c.money(depositSum) }) }] satisfies Block[])
          : []),
        shipped && order.trackingNumber
          ? { kind: "cta", label: c.t("trackCta"), href: DHL_TRACKING(order.trackingNumber), note: c.t("trackNote") }
          : { kind: "cta", label: c.t("cta"), href: c.url(`/profile/orders/${order.id}`) },
      ],
      footer: { reason: c.t("reason") },
    });

    await sendHtmlEmail({ to: order.user.email, subject: subject.replace(/[\r\n]+/g, " "), html, text });
    return true;
  } catch (error) {
    console.error(`[order-email] ${kind} email for order ${orderId} failed:`, error);
    return false;
  }
}
