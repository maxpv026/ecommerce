import "server-only";

import prisma from "@/lib/prisma";
import { sendHtmlEmail, type MailDelivery } from "@/lib/mail";
import { emailContext, type EmailContext } from "@/lib/email/context";
import type { Block, ItemLine } from "@/lib/email/design";
import { orderBreakdown } from "@/lib/orderTotals";
import { bankTransferDetails, formatIban } from "@/lib/bankTransfer";
import { isBankTransfer } from "@/lib/payment";
import { resolveOrderTracking, SHIPMENT_SELECT } from "@/lib/shipping/resolve";
import type { FulfilmentEmailKind } from "@/lib/shipping/carriers";

/**
 * The emails about one order: the confirmation (with the invoice PDF) and
 * the fulfilment updates, worded for the order's carrier (lib/shipping).
 *
 * Built from the ORDER AS STORED, not from the checkout's working values:
 * the same frozen lines and total the invoice PDF and the order page read,
 * through the same orderBreakdown, so the email can never show a figure
 * that differs from the invoice attached to it.
 */

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      paymentMethod: true,
      paymentStatus: true,
      ...SHIPMENT_SELECT,
      shippingAddress: true,
      authorizingCertificateNumber: true,
      authorizingCertificateExpiresAt: true,
      invoice: { select: { invoiceNumber: true } },
      user: { select: { name: true, email: true, companyName: true, vatNumber: true, locale: true, billingEmail: true } },
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
          { label: c.t("fieldShipping"), value: c.t("shippingMethodPending"), note: c.t("etaNote", { date: c.date(order.estimatedDelivery) }) },
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
    // The buyer's accounts inbox gets the receipt and invoice too (profile → billing email).
    ...(order.user.billingEmail && order.user.billingEmail !== order.user.email ? { cc: order.user.billingEmail } : {}),
    subject: subject.replace(/[\r\n]+/g, " "),
    html,
    text,
    // Omitted entirely when rendering failed: an email with a 0-byte
    // "invoice.pdf" is worse than one that says where to find it.
    ...(invoicePdf ? { attachments: [{ filename: `${invoice}.pdf`, content: invoicePdf, contentType: "application/pdf" }] } : {}),
  });
}

/**
 * A fulfilment update, worded for how THIS order travels (lib/shipping):
 *
 *   SHIPPED           left us — with DHL / a freight carrier (name, waybill,
 *                     public link) or on our own ADR vehicle (plate, driver).
 *   OUT_FOR_DELIVERY  on the final leg.
 *   READY_FOR_PICKUP  waiting at the warehouse (address, hours, notes).
 *   DELIVERED         arrived — or, for a pickup, collected.
 *
 * Built from the same tracking view as the order page, without a live DHL
 * call. Transactional (not preference-gated). Never throws: the stage change
 * is committed before this runs.
 */
export async function sendOrderStatusEmail(orderId: string, kind: FulfilmentEmailKind): Promise<boolean> {
  try {
    const order = await loadOrder(orderId);
    if (!order?.user.email) return false;
    const c = await emailContext(order.user.locale, "OrderEmail");
    const view = await resolveOrderTracking(order, { live: false });
    const name = order.user.name?.trim();
    const deposits = order.items.reduce((n, i) => n + (Number(i.depositAtPurchase) > 0 ? i.quantity : 0), 0);
    const depositSum = order.items.reduce((n, i) => n + Number(i.depositAtPurchase) * i.quantity, 0);
    const pickup = view.method === "PICKUP";
    const fleet = view.method === "OWN_FLEET";
    const carrier = fleet ? c.t("fleetName") : (view.carrier?.name ?? c.t("carrierUnnamed"));
    const ref = view.carrier?.trackingNumber ?? null;
    const url = view.carrier?.trackingUrl ?? null;
    const o = order.orderNumber;

    const copy = {
      SHIPPED: {
        subject: c.t("shippedSubject", { order: o }),
        preview: fleet ? c.t("shippedPreviewFleet") : c.t("shippedPreviewCarrier", { carrier }),
        kicker: c.t("shippedKicker"),
        heading: c.t("shippedHeading"),
        body: fleet ? "shippedBodyFleet" : ref ? "shippedBodyCarrierTracking" : "shippedBodyCarrier",
      },
      OUT_FOR_DELIVERY: { subject: c.t("outSubject", { order: o }), preview: c.t("outPreview"), kicker: c.t("outKicker"), heading: c.t("outHeading"), body: "outBody" },
      READY_FOR_PICKUP: { subject: c.t("pickupSubject", { order: o }), preview: c.t("pickupPreview"), kicker: c.t("pickupKicker"), heading: c.t("pickupHeading"), body: "pickupBody" },
      DELIVERED: pickup
        ? { subject: c.t("collectedSubject", { order: o }), preview: c.t("collectedPreview", { order: o }), kicker: c.t("collectedKicker"), heading: c.t("collectedHeading"), body: "collectedBody" }
        : { subject: c.t("deliveredSubject", { order: o }), preview: c.t("deliveredPreview", { order: o }), kicker: c.t("deliveredKicker"), heading: c.t("deliveredHeading"), body: "deliveredBody" },
    }[kind];

    const travelling = kind === "SHIPPED" || kind === "OUT_FOR_DELIVERY";
    const facts: Block = {
      kind: "facts",
      rows: [
        { label: c.t("fieldOrder"), value: o, mono: true },
        ...(order.invoice ? [{ label: c.t("fieldInvoice"), value: order.invoice.invoiceNumber, mono: true }] : []),
        ...(pickup
          ? [
              { label: c.t("fieldPickupAddress"), value: view.pickup?.location ?? c.t("pickupAddressPending") },
              ...(view.pickup?.hours ? [{ label: c.t("fieldPickupHours"), value: view.pickup.hours }] : []),
            ]
          : [{ label: c.t("fieldCarrier"), value: carrier }]),
        ...(ref ? [{ label: c.t("fieldReference"), value: ref, mono: true }] : []),
        ...(fleet && view.fleet?.vehiclePlate ? [{ label: c.t("fieldVehicle"), value: view.fleet.vehiclePlate, mono: true }] : []),
        ...(fleet && view.fleet?.driverName ? [{ label: c.t("fieldDriver"), value: view.fleet.driverName }] : []),
        ...(fleet && view.fleet?.driverPhone ? [{ label: c.t("fieldDriverPhone"), value: view.fleet.driverPhone, mono: true }] : []),
        ...(travelling && view.estimatedDelivery ? [{ label: c.t("fieldEta"), value: fleet ? c.dateTime(new Date(view.estimatedDelivery)) : c.date(new Date(view.estimatedDelivery)) }] : []),
        ...(!pickup && order.shippingAddress ? [{ label: c.t("shipTo"), value: addressText(order.shippingAddress) }] : []),
      ],
    };

    const cta: Block =
      travelling && url
        ? { kind: "cta", label: c.t("trackCtaCarrier", { carrier }), href: url, note: c.t("trackNoteCarrier") }
        : { kind: "cta", label: c.t("cta"), href: c.url(`/profile/orders/${order.id}`) };

    const { html, text } = c.render({
      subject: copy.subject,
      preview: copy.preview,
      reference: o,
      kicker: { label: copy.kicker, tone: kind === "DELIVERED" ? "success" : "brand" },
      heading: copy.heading,
      blocks: [
        ...(name ? ([{ kind: "text", text: c.t("greeting", { name }) }] satisfies Block[]) : []),
        { kind: "text", text: c.rich(copy.body, { order: o, carrier }, ["order"]) },
        facts,
        ...(view.notes ? ([{ kind: "callout", tone: "neutral", title: c.t("fieldNotes"), text: view.notes }] satisfies Block[]) : []),
        { kind: "items", qtyLabel: c.s("qty"), lines: itemLines(c, order, false) },
        ...(kind === "DELIVERED" && deposits > 0
          ? ([{ kind: "callout", tone: "brand", title: c.t("depositTitle"), text: c.t("deliveredReturn", { count: deposits, amount: c.money(depositSum) }) }] satisfies Block[])
          : []),
        cta,
      ],
      footer: { reason: c.t("reason") },
    });

    await sendHtmlEmail({ to: order.user.email, subject: copy.subject.replace(/[\r\n]+/g, " "), html, text });
    return true;
  } catch (error) {
    console.error(`[order-email] ${kind} email for order ${orderId} failed:`, error);
    return false;
  }
}
