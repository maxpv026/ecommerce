import { Suspense } from "react";
import StorePage from "@/components/StorePage";
import MarketAlertsCard from "@/components/MarketAlertsCard";
import PageSkeleton from "@/components/PageSkeleton";
import { getFeaturedProducts, getMarketAlerts } from "@/lib/data";
import { getTimeOfDayGreeting } from "@/lib/greeting";

// Static, refreshed at most every 5 minutes; catalogue changes expire the
// featured products immediately (PRODUCTS_TAG, lib/catalogCache).
export const revalidate = 300;

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
  // No auth() here: that one call forced the most-visited page to render on
  // every request. The shell is the same for everyone; the signed-in parts
  // come from /api/home/account in the browser (components/StorePage).
  const [featuredProducts, marketAlerts] = await Promise.all([getFeaturedProducts(4), getMarketAlerts()]);

  return (
    <StorePage
      featuredProducts={featuredProducts}
      // A server component handed to a client one as a prop: its markup is
      // rendered here and never reaches the browser as JavaScript.
      marketAlertsCard={<MarketAlertsCard />}
      marketAlerts={marketAlerts}
      // Rendered into the static HTML; the browser hydrates against it, then
      // switches to the visitor's own time of day (lib/hooks/useGreeting).
      greetingKey={getTimeOfDayGreeting()}
    />
  );
}
