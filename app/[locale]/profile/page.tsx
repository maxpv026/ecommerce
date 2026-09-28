import type { Metadata } from "next";
import { Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import { auth } from "@/auth";
import AccountLayoutClient from "@/components/AccountLayoutClient";
import { getProfileDashboardData, getUserAddresses, getUserOrders, getUserProfile } from "@/lib/data";
import { getTrackingStatus } from "@/lib/actions/tracking";
import { getActiveRestockAlerts } from "@/lib/smartRestock";
import { buildOrderTracking, type OrderTrackingView } from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Your Account — My Energy",
  description: "Manage your My Energy profile, order history, and account security.",
};

/**
 * The segment skeleton lives inside the page now, not in a
 * `profile/loading.tsx`. A loading.tsx here wrapped all 18 routes under
 * /profile — including /profile/orders/[id], whose `notFound()` for an
 * order that isn't yours could then only change the UI, not the 200 status.
 * See app/[locale]/page.tsx for the full reasoning and the measurement.
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const userId = session?.user?.id;

  const [dashboardData, profile, orders, addresses, restockAlerts] = userId
    ? await Promise.all([
        getProfileDashboardData(userId),
        getUserProfile(userId),
        getUserOrders(userId),
        getUserAddresses(userId),
        getActiveRestockAlerts(userId),
      ])
    : [null, null, null, null, []];

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
      addresses={addresses}
      restockAlerts={restockAlerts ?? []}
    />
  );
}
