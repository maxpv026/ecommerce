"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import Header from "./Header";
import DesktopHome from "./DesktopHome";
import MobileAppLayout from "./MobileAppLayout";
import AuthModal from "./AuthModal";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder, UserProfileData } from "@/lib/data";
import type { GreetingKey } from "@/lib/greeting";

interface StorePageProps {
  /** The static catalogue picks every visitor sees (cached, tag PRODUCTS_TAG). */
  featuredProducts: StoreProduct[];
  /** Server-rendered market-alerts card for the desktop grid. */
  marketAlertsCard: ReactNode;
  /** The same articles as data, for the mobile ticker's marquee. */
  marketAlerts: MarketAlertData[];
  /** The greeting the server rendered with — hydration must match it (lib/hooks/useGreeting). */
  greetingKey: GreetingKey;
  sdsCount: number;
}

interface AccountData {
  recommendedProducts: StoreProduct[];
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
  orders: UserOrder[];
  certificate: UserProfileData["certificate"];
  jobTitle: string | null;
}

/**
 * The home page shell is static (app/[locale]/page.tsx, ISR) and identical
 * for everyone, so it is served from the CDN instead of waiting on auth() and
 * five queries per request. The signed-in parts arrive from
 * /api/home/account once the session is known.
 *
 * Everyone sees the full page at once. A signed-in buyer's own figures (the
 * hero stats, the latest-order card) show a placeholder of the same size
 * while their data loads — never a stranger's numbers, and never the whole
 * page swapped for a skeleton, which is what it used to do: guest page →
 * skeleton → page, two full re-renders and ~350 ms of nothing on every
 * signed-in visit.
 */
export default function StorePage({ featuredProducts, marketAlertsCard, marketAlerts, greetingKey, sdsCount }: StorePageProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { status, data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [account, setAccount] = useState<{ userId: string; data: AccountData } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let cancelled = false;
    // Every outcome settles: a failed or refused fetch falls back to the
    // public shell rather than leaving a signed-in buyer on the skeleton.
    const fallback: AccountData = { recommendedProducts: featuredProducts, dashboard: null, latestOrder: null, orders: [], certificate: null, jobTitle: null };
    fetch("/api/home/account", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AccountData & { ok: boolean }>) : null))
      .then((body) => {
        if (!cancelled) setAccount({ userId, data: body?.ok ? body : fallback });
      })
      .catch(() => {
        if (!cancelled) setAccount({ userId, data: fallback });
      });
    return () => {
      cancelled = true;
    };
  }, [status, userId, featuredProducts]);

  // Only data fetched for THIS session counts (a sign-out or account switch
  // must not keep showing the previous buyer's dashboard).
  const mine = status === "authenticated" && account?.userId === userId ? account.data : null;
  // Signed in (or still finding out) and this buyer's data is not here yet.
  const accountLoading = status === "loading" || (status === "authenticated" && !mine);
  const products = mine?.recommendedProducts.length ? mine.recommendedProducts : featuredProducts;

  return (
    <div className="flex-1 bg-canvas">
      {/* Desktop / tablet — real dashboard-style home */}
      <div className="hidden md:block">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
        <DesktopHome
          products={products}
          marketAlerts={marketAlertsCard}
          dashboard={mine?.dashboard ?? null}
          latestOrder={mine?.latestOrder ?? null}
          accountLoading={accountLoading}
          greetingKey={greetingKey}
          sdsCount={sdsCount}
        />
      </div>

      {/* Native-app-style mobile home */}
      <div className="block md:hidden">
        <MobileAppLayout
          featuredProducts={products}
          marketAlerts={marketAlerts}
          dashboard={mine?.dashboard ?? null}
          orders={mine?.orders ?? []}
          certificate={mine?.certificate ?? null}
          jobTitle={mine?.jobTitle ?? null}
          greetingKey={greetingKey}
        />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
