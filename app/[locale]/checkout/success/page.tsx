import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import AppChrome from "@/components/AppChrome";
import CheckoutSuccessPage, { type PlacedOrderSummary } from "@/components/CheckoutSuccessPage";
import { bankTransferDetails } from "@/lib/bankTransfer";
import { orderBreakdown } from "@/lib/orderTotals";
import { epcPayload, epcQrSvg } from "@/lib/epcQr";

export const metadata: Metadata = {
  title: "Payment details — My Energy",
  description: "Your order is reserved and awaiting payment by bank transfer.",
  // Nothing here should be indexed: it is one customer's order.
  robots: { index: false, follow: false },
};

interface CheckoutSuccessRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string }>;
}

const GAS = new Set(["cylinders", "blends"]);

/**
 * /checkout/success — step 3 of 3: the bank-transfer terminal for one order.
 * Everything on it is read from the stored order (the same figures the
 * invoice PDF prints, via orderBreakdown) and the configured receiving
 * account (lib/bankTransfer). The EPC QR code is rendered here, on the server.
 */
export default async function CheckoutSuccessRoute({ params, searchParams }: CheckoutSuccessRouteProps) {
  const { locale } = await params;
  const { orderId } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: "/checkout" } }, locale });
    // redirect() throws, but return anyway: an undefined userId would match ANY row below.
    return null;
  }
  // No order id: reached directly rather than through checkout.
  if (!orderId) redirect({ href: "/profile/orders", locale });

  // Scoped by userId — an order id in the query string is not authorisation.
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      createdAt: true,
      estimatedDelivery: true,
      shippingAddress: true,
      customerNote: true,
      paymentStatus: true,
      paymentReportedAt: true,
      paymentReportedRef: true,
      invoice: { select: { id: true, invoiceNumber: true } },
      address: { select: { recipientName: true, fullAddress: true, phone: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          priceAtPurchase: true,
          depositAtPurchase: true,
          weightKgAtPurchase: true,
          product: { select: { name: true, gwpClass: true, containerType: true, category: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const lines = order.items.map((i) => ({ priceAtPurchase: Number(i.priceAtPurchase), quantity: i.quantity, depositAtPurchase: Number(i.depositAtPurchase) }));
  const breakdown = orderBreakdown(lines, Number(order.totalAmount));
  const bank = bankTransferDetails();
  const payload = epcPayload(bank, breakdown.total, order.orderNumber);

  const summary: PlacedOrderSummary = {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    estimatedDelivery: order.estimatedDelivery.toISOString(),
    // The frozen copy is the truth; the live relation only for orders placed before it existed.
    shippingAddress: order.shippingAddress ?? (order.address ? `${order.address.recipientName}\n${order.address.fullAddress}` : null),
    phone: order.address?.phone ?? null,
    customerNote: order.customerNote,
    paid: order.paymentStatus === "PAID",
    reported: order.paymentReportedAt ? { at: order.paymentReportedAt.toISOString(), reference: order.paymentReportedRef } : null,
    invoice: order.invoice ? { id: order.invoice.id, number: order.invoice.invoiceNumber } : null,
    breakdown,
    items: order.items.map((i) => ({
      id: i.id,
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: Number(i.priceAtPurchase),
      weightKg: Number(i.weightKgAtPurchase),
      containerType: i.product.containerType,
      pricedPerKg: GAS.has(i.product.category ?? ""),
      safety: i.product.gwpClass && i.product.gwpClass !== "n/a" ? i.product.gwpClass : null,
    })),
  };

  return (
    <AppChrome>
      <CheckoutSuccessPage order={summary} bank={bank} qr={payload ? { payload, svg: await epcQrSvg(payload) } : null} />
    </AppChrome>
  );
}
