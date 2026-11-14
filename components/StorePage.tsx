"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "./Header";
import DesktopHome from "./DesktopHome";
import MobileTopBar from "./MobileTopBar";
import AuthModal from "./AuthModal";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder } from "@/lib/data";
import type { GreetingKey } from "@/lib/greeting";

interface StorePageProps {
  /** A larger pick for the desktop Popular grid and its category tabs. */
  popularProducts: StoreProduct[];
  /** One catalog cylinder per hero gas (lib/data getHomeShowcase). */
  showcase: Array<{ mark: string; product: StoreProduct | null }>;
  /** Industry articles: the mobile ticker and the desktop summary card. */
  marketAlerts: MarketAlertData[];
  /** The greeting the server rendered with — hydration must match it (lib/hooks/useGreeting). */
  greetingKey: GreetingKey;
  sdsCount: number;
}

interface AccountData {
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
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
export default function StorePage({ popularProducts, showcase, marketAlerts, greetingKey, sdsCount }: StorePageProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { status, data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [account, setAccount] = useState<{ userId: string; data: AccountData } | null>(null);
  const [recs, setRecs] = useState<{ userId: string; products: StoreProduct[] } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let cancelled = false;
    // Two requests on purpose. The figures (KPIs, last order) are three
    // queries, ~0.3 s; the recommendations may wait on a model call (capped
    // at 2.5 s, lib/data). In one response the KPI cards sat as skeletons for
    // the slow half — seconds on a phone. Every outcome settles: a failed
    // fetch falls back to the public shell rather than a stuck skeleton.
    const fallback: AccountData = { dashboard: null, latestOrder: null };
    fetch("/api/home/account", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AccountData & { ok: boolean }>) : null))
      .then((body) => {
        if (!cancelled) setAccount({ userId, data: body?.ok ? body : fallback });
      })
      .catch(() => {
        if (!cancelled) setAccount({ userId, data: fallback });
      });
    fetch("/api/home/recommendations", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ ok: boolean; products: StoreProduct[] }>) : null))
      .then((body) => {
        if (!cancelled && body?.ok) setRecs({ userId, products: body.products });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // Only data fetched for THIS session counts (a sign-out or account switch
  // must not keep showing the previous buyer's dashboard).
  const mine = status === "authenticated" && account?.userId === userId ? account.data : null;
  // Signed in (or still finding out) and this buyer's data is not here yet.
  const accountLoading = status === "loading" || (status === "authenticated" && !mine);
  // Desktop grid: this buyer's recommendations first, then the wider pick.
  const mineRecs = status === "authenticated" && recs?.userId === userId ? recs.products : [];
  const popular = [...mineRecs, ...popularProducts].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);

  return (
    <div className="flex-1 bg-canvas">
      {/* One home at every width: the desktop Header above md, the phone app
          bar below it, and the same four sections underneath (they adapt). */}
      <div className="hidden md:contents">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
      </div>
      <MobileTopBar />
      <DesktopHome
        products={popular}
        showcase={showcase}
        alerts={marketAlerts}
        dashboard={mine?.dashboard ?? null}
        latestOrder={mine?.latestOrder ?? null}
        accountLoading={accountLoading}
        greetingKey={greetingKey}
        sdsCount={sdsCount}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
