import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import OrderDetailView, { type OrderDetailData } from "@/components/OrderDetailView";
import AppChrome from "@/components/AppChrome";
import { getTrackingStatus } from "@/lib/actions/tracking";
import { buildOrderTracking } from "@/lib/tracking";
import { bankTransferDetails } from "@/lib/bankTransfer";
import { imagePathForProduct } from "@/lib/productMedia";
import { isPurchasable } from "@/lib/waitlist";

export const metadata: Metadata = {
  title: "Order Details — My Energy",
  description: "Your My Energy order details and delivery status.",
};

interface OrderPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { locale, id } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: `/profile/orders/${id}` } }, locale });
  }

  // Scoped by userId — one customer can never open another's order.
  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: { items: { include: { product: true } }, address: true, invoice: { select: { id: true } } },
  });
  if (!order) notFound();

  // Live DHL status when the shipment has a tracking number; any failure
  // (no key, rate limit, unknown number) degrades to the status-derived
  // timeline instead of breaking the page.
  const dhlResult = order.trackingNumber ? await getTrackingStatus(order.trackingNumber) : null;
  const tracking = buildOrderTracking({
    orderStatus: order.status,
    createdAt: order.createdAt.toISOString(),
    estimatedDelivery: order.estimatedDelivery.toISOString(),
    dhl: dhlResult?.ok ? dhlResult.tracking : null,
  });

  const data: OrderDetailData = {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    estimatedDelivery: tracking.estimatedDelivery ?? order.estimatedDelivery.toISOString(),
    totalAmount: Number(order.totalAmount),
    trackingNumber: order.trackingNumber,
    invoiceId: order.invoice?.id ?? null,
    tracking,
    // The frozen snapshot first. `order.address` is the customer's *current*
    // address-book entry, which they may have edited since — or deleted, in
    // which case the relation is null (onDelete: SetNull) and the old view
    // showed a dash for an order that definitely went somewhere. The
    // relation is only a fallback for rows placed before the snapshot.
    shippingAddress:
      order.shippingAddress ??
      (order.address ? [order.address.recipientName, order.address.fullAddress].join("\n") : null),
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.product.sku,
      name: item.product.name,
      variant: item.product.weight,
      quantity: item.quantity,
      priceAtPurchase: Number(item.priceAtPurchase),
      pricePerKgAtPurchase: item.pricePerKgAtPurchase,
      weightKgAtPurchase: item.weightKgAtPurchase,
      depositAtPurchase: Number(item.depositAtPurchase),
      imageSrc: imagePathForProduct(item.product),
      // Re-read now, not taken from the order: "order again" must not put a
      // line in the cart that checkout would refuse. The cart and
      // prepareOrder re-check this too — this only avoids the dead end.
      purchasable: isPurchasable(item.product),
    })),
  };

  // The bank details stay on the page for as long as the transfer is
  // outstanding — this is where a buyer comes back to find them.
  const bank = bankTransferDetails();

  return (
    <AppChrome>
      <OrderDetailView order={data} bank={bank} />
    </AppChrome>
  );
}
