import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import prisma from "@/lib/prisma";
import CheckoutSuccessPage, { type PlacedOrderSummary } from "@/components/CheckoutSuccessPage";
import { bankTransferDetails } from "@/lib/bankTransfer";

export const metadata: Metadata = {
  title: "Order placed — My Energy",
  description: "Your order is reserved and awaiting payment by bank transfer.",
  // Nothing here should be indexed: it is one customer's order.
  robots: { index: false, follow: false },
};

interface CheckoutSuccessRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string }>;
}

export default async function CheckoutSuccessRoute({ params, searchParams }: CheckoutSuccessRouteProps) {
  const { locale } = await params;
  const { orderId } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect({ href: { pathname: "/auth", query: { callbackUrl: "/checkout" } }, locale });
  }

  // No order id means someone reached this URL directly rather than through
  // checkout; there is nothing to confirm, so send them to their orders.
  if (!orderId) {
    redirect({ href: "/profile/orders", locale });
  }

  // Scoped by userId — an order id in the query string is not authorisation
  // to read someone else's order.
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: userId! },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      createdAt: true,
      estimatedDelivery: true,
      shippingAddress: true,
      address: { select: { recipientName: true, fullAddress: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          product: { select: { name: true, weight: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const summary: PlacedOrderSummary = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: Number(order.totalAmount),
    createdAt: order.createdAt.toISOString(),
    estimatedDelivery: order.estimatedDelivery.toISOString(),
    // The frozen copy is the truth; fall back to the live relation only for
    // orders placed before the snapshot existed.
    shippingAddress:
      order.shippingAddress ??
      (order.address ? `${order.address.recipientName}\n${order.address.fullAddress}` : null),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      variant: item.product.weight,
      quantity: item.quantity,
    })),
  };

  const bank = bankTransferDetails();

  return <CheckoutSuccessPage order={summary} bank={bank} />;
}
