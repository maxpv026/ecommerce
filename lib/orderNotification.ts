import { formatDeliveryAddress, type DeliveryAddress } from "@/lib/orders";
import { escapeMarkdown } from "@/lib/telegram";

/**
 * The admin's "new order" message.
 *
 * Kept apart from the route so it can be read (and tested) on its own: this
 * is the only thing standing between a placed order and someone actually
 * shipping it, so the delivery address and the quantities have to be right
 * and legible at a glance on a phone.
 *
 * Formatted for Telegram's classic Markdown, so every value that comes from
 * a customer — names, company, street — is escaped. An address containing an
 * underscore would otherwise silently swallow half the message.
 */

export interface NewOrderLine {
  name: string;
  sku: string;
  /** Pack label, e.g. "10 kg cylinder". */
  variant: string;
  qty: number;
}

export interface NewOrderNotification {
  orderNumber: string;
  orderId: string;
  customerName: string | null;
  customerEmail: string | null;
  companyName: string | null;
  totalAmount: number;
  shippingAddress: DeliveryAddress;
  lines: NewOrderLine[];
}

const eur = (amount: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(amount);

export function buildNewOrderMessage(order: NewOrderNotification): string {
  // Name and company are both useful and often differ — show whichever exist,
  // then the email, which is the one identifier that is always there.
  const who = [order.customerName, order.companyName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" · ");

  const customer = [who, order.customerEmail]
    .filter((part): part is string => Boolean(part?.trim()))
    .map(escapeMarkdown)
    .join("\n");

  const items = order.lines
    .map((line) => `• ${escapeMarkdown(line.name)} (${escapeMarkdown(line.variant)}) × ${line.qty}`)
    .join("\n");

  const totalUnits = order.lines.reduce((sum, line) => sum + line.qty, 0);

  return [
    "🧊 *New order — awaiting bank transfer*",
    "",
    `*Order:* ${escapeMarkdown(order.orderNumber)}`,
    `*Total:* ${eur(order.totalAmount)}`,
    "",
    "*Customer*",
    customer || "_unknown_",
    "",
    `*Items* (${totalUnits} ${totalUnits === 1 ? "cylinder" : "cylinders"})`,
    items,
    "",
    "*Deliver to*",
    escapeMarkdown(formatDeliveryAddress(order.shippingAddress)),
    "",
    `_Ref:_ ${escapeMarkdown(order.orderId)}`,
  ].join("\n");
}
