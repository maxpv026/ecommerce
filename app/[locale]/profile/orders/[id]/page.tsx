import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import OrderConfirmation, { type OrderConfirmationData } from "@/components/OrderConfirmation";
import { getTrackingStatus } from "@/lib/actions/tracking";
import { buildOrderTracking } from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Order Confirmation — My Energy",
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
    include: { items: { include: { product: true } }, address: true },
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

  const data: OrderConfirmationData = {
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    estimatedDelivery: tracking.estimatedDelivery ?? order.estimatedDelivery.toISOString(),
    totalAmount: Number(order.totalAmount),
    trackingNumber: order.trackingNumber,
    tracking,
    address: order.address
      ? {
          title: order.address.title,
          recipientName: order.address.recipientName,
          fullAddress: order.address.fullAddress,
        }
      : null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      variant: item.product.weight,
      quantity: item.quantity,
      priceAtPurchase: Number(item.priceAtPurchase),
    })),
  };

  return <OrderConfirmation order={data} />;
}
