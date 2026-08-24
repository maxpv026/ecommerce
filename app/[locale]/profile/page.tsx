import type { Metadata } from "next";
import { auth } from "@/auth";
import AccountLayoutClient from "@/components/AccountLayoutClient";
import { getProfileDashboardData, getUserOrders, getUserProfile } from "@/lib/data";
import { getTrackingStatus } from "@/lib/actions/tracking";
import { buildOrderTracking, type OrderTrackingView } from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Your Account — My Energy",
  description: "Manage your My Energy profile, order history, and account security.",
};

export default async function ProfilePage() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const userId = session?.user?.id;

  const [dashboardData, profile, orders] = userId
    ? await Promise.all([
        getProfileDashboardData(userId),
        getUserProfile(userId),
        getUserOrders(userId),
      ])
    : [null, null, null];

  // Per-order shipment timelines for the accordion rows: live DHL data
  // where a tracking number exists (cached 5 min upstream), status-derived
  // otherwise. Same machinery the order-detail page uses.
  const orderTracking: Record<string, OrderTrackingView> = {};
  for (const order of orders ?? []) {
    const dhl = order.trackingNumber ? await getTrackingStatus(order.trackingNumber) : null;
    orderTracking[order.id] = buildOrderTracking({
      orderStatus: order.status,
      createdAt: order.createdAt,
      estimatedDelivery: order.estimatedDelivery,
      dhl: dhl?.ok ? dhl.tracking : null,
    });
  }

  return (
    <AccountLayoutClient
      isAuthenticated={isAuthenticated}
      dashboardData={dashboardData}
      profile={profile}
      orders={orders}
      orderTracking={orderTracking}
    />
  );
}
