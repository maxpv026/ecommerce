import type { Metadata } from "next";
import { Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import { auth } from "@/auth";
import AccountLayoutClient from "@/components/AccountLayoutClient";
import { getProfileDashboardData, getUserAddresses, getUserOrders, getUserProfile } from "@/lib/data";
import { getCustomerComplianceSummary } from "@/lib/compliance";
import { getActiveRestockAlerts } from "@/lib/smartRestock";
import type { OrderTrackingView } from "@/lib/tracking";
import { resolveOrderTracking } from "@/lib/shipping/resolve";
import { getProfileHub } from "@/lib/profileHub";
import { PROFILE_TABS, type ProfileTab } from "@/lib/profileTabs";

export const metadata: Metadata = {
  title: "Profile — My Energy",
  description: "Manage your My Energy profile, order history, and account security.",
};

/**
 * The segment skeleton lives inside the page now, not in a
 * `profile/loading.tsx`. A loading.tsx here wrapped all 18 routes under
 * /profile — including /profile/orders/[id], whose `notFound()` for an
 * order that isn't yours could then only change the UI, not the 200 status.
 * See app/[locale]/page.tsx for the full reasoning and the measurement.
 */
export default function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string; docs?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <ProfileContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfileContent({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string; docs?: string }> }) {
  // ?tab=orders opens that view; ?section= is the older spelling some links still use.
  const sp = await searchParams;
  const wanted = sp.tab ?? sp.section ?? "";
  const initialTab: ProfileTab = (PROFILE_TABS as readonly string[]).includes(wanted) ? (wanted as ProfileTab) : "overview";
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const userId = session?.user?.id;

  const [dashboardData, profile, orders, addresses, restockAlerts, compliance, hub] = userId
    ? await Promise.all([
        getProfileDashboardData(userId),
        getUserProfile(userId),
        getUserOrders(userId),
        getUserAddresses(userId),
        getActiveRestockAlerts(userId),
        getCustomerComplianceSummary(userId),
        getProfileHub(userId),
      ])
    : [null, null, null, null, [], null, null];

  // The logbook card's figures: this year, same numbers /profile/compliance shows.
  const logbook = compliance
    ? {
        year: compliance.generatedAt.getUTCFullYear(),
        massKg: compliance.yearToDate.massKg,
        // From kg, unrounded: co2eTonnes is already rounded to 3 dp, and the card rounds again to 2 —
        // 102.8746 would read 102,88 here and 102,87 on /profile/compliance.
        co2eTonnes: compliance.yearToDate.co2eKg / 1000,
        lines: compliance.ledger.length,
      }
    : null;

  // Per-order shipment timelines for the accordion rows — the same resolver
  // as the order page (lib/shipping/resolve): live DHL scans where there is a
  // DHL waybill (cached 5 min upstream), the logistics team's stage and
  // checkpoints for every other carrier, own-fleet delivery and pickup.
  const orderTracking: Record<string, OrderTrackingView> = {};
  for (const order of orders ?? []) {
    orderTracking[order.id] = await resolveOrderTracking(order.shipment);
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
      logbook={logbook}
      hub={hub}
      initialTab={initialTab}
      initialDocFilter={sp.docs}
    />
  );
}
