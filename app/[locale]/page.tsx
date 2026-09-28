import { Suspense } from "react";
import StorePage from "@/components/StorePage";
import MarketAlertsCard from "@/components/MarketAlertsCard";
import PageSkeleton from "@/components/PageSkeleton";
import { auth } from "@/auth";
import {
  getFeaturedProducts,
  getMarketAlerts,
  getProfileDashboardData,
  getRecommendedProducts,
  getUserOrders,
  getUserProfile,
  type ProfileDashboardData,
  type UserOrder,
  type UserProfileData,
} from "@/lib/data";

/**
 * The skeleton this page shows while its data loads used to be
 * `app/[locale]/loading.tsx`. That file was written for this route — its own
 * comment said so — but a `loading.tsx` wraps its whole SEGMENT, so it also
 * wrapped every nested route under /[locale]: products, checkout, profile,
 * all of them.
 *
 * The cost was not cosmetic. A segment-level loading boundary makes Next
 * flush the shell (and the fallback) before the page body runs, which commits
 * the HTTP status as 200. Any `notFound()` reached afterwards could still
 * swap the UI to the 404 page, but no longer the status — so every dead
 * product URL answered `200 OK` with 404 content. Search engines treat that
 * as an indexable page.
 *
 * Measured, same build, only this boundary moved:
 *   /en/products/does-not-exist   200 → 404
 *
 * Keeping the boundary INSIDE the page gives the identical streamed
 * skeleton for this route while leaving every sibling route free to answer
 * with a real status. `Home` itself must stay synchronous for that to work:
 * the moment it awaits anything, the shell waits with it.
 */
export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const session = await auth();
  const userId = session?.user?.id;

  const [recommendedProducts, marketAlerts, dashboard, orders, profile] = await Promise.all([
    userId ? getRecommendedProducts(userId, 4) : getFeaturedProducts(4),
    getMarketAlerts(),
    userId ? getProfileDashboardData(userId) : Promise.resolve<ProfileDashboardData | null>(null),
    userId ? getUserOrders(userId) : Promise.resolve<UserOrder[]>([]),
    userId ? getUserProfile(userId) : Promise.resolve<UserProfileData | null>(null),
  ]);

  return (
    <StorePage
      recommendedProducts={recommendedProducts}
      // A server component handed to a client one as a prop: its markup is
      // rendered here and never reaches the browser as JavaScript.
      marketAlertsCard={<MarketAlertsCard />}
      marketAlerts={marketAlerts}
      dashboard={dashboard}
      latestOrder={orders[0] ?? null}
      orders={orders.slice(0, 4)}
      certificate={profile?.certificate ?? null}
      jobTitle={profile?.jobTitle ?? null}
    />
  );
}
