"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import DashboardDesktop from "./DashboardDesktop";
import SmartRestockStrip from "./profile/SmartRestockStrip";
import MobileProfileLayout from "./MobileProfileLayout";
import MobileProfileSignedOutLayout from "./MobileProfileSignedOutLayout";
import type { ProfileDashboardData, UserAddress, UserOrder, UserProfileData } from "@/lib/data";
import type { ActiveRestockAlert } from "@/lib/smartRestock";
import type { OrderTrackingView } from "@/lib/tracking";
import type { LogbookSummary } from "./DashboardDesktop";

interface AccountLayoutClientProps {
  isAuthenticated: boolean;
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
  orders?: UserOrder[] | null;
  orderTracking?: Record<string, OrderTrackingView>;
  addresses?: UserAddress[] | null;
  /** Predictive restock suggestions; empty renders nothing. */
  restockAlerts?: ActiveRestockAlert[];
  /** This year's F-Gas logbook figures for the dashboard card. */
  logbook?: LogbookSummary | null;
}

export default function AccountLayoutClient({
  isAuthenticated,
  dashboardData,
  profile,
  orders,
  orderTracking,
  addresses,
  restockAlerts = [],
  logbook = null,
}: AccountLayoutClientProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { data: session, status, update } = useSession();

  // The header and app bar read the photo from the session, which another
  // device only refreshes at its next sign-in. The profile page already has
  // the row, so a mismatch here re-reads the session — ONCE per distinct
  // mismatch. update() itself flips `status` to "loading" and back, so
  // without the ref a mismatch the refresh can't resolve (a failed or
  // rate-limited request, a server on a stale Prisma client) re-fired this
  // on every flip: an unbounded update() loop that exhausted /api/auth's
  // rate limit and signed the whole site out for that client.
  const rowAvatar = profile ? (profile.avatarUrl ?? null) : undefined;
  const sessionAvatar = session?.user?.image ?? null;
  const attemptedSync = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "authenticated" || rowAvatar === undefined || rowAvatar === sessionAvatar) return;
    const mismatch = `${rowAvatar}|${sessionAvatar}`;
    if (attemptedSync.current === mismatch) return;
    attemptedSync.current = mismatch;
    void update({}); // {}: a bare update() is a GET that never re-reads the row
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update() is not referentially stable
  }, [status, rowAvatar, sessionAvatar]);

  return (
    <div className="flex-1 bg-canvas">
      {/* Desktop: the bento dashboard (My Energy Dashboard Desktop design) */}
      <div className="hidden md:block">
        <Header
          onSignInClick={() => setIsAuthModalOpen(true)}
        />
        <SmartRestockStrip alerts={restockAlerts} className="mx-auto max-w-[1240px] px-8 pt-7" />
        <DashboardDesktop
          isAuthenticated={isAuthenticated}
          profile={profile ?? null}
          orders={orders ?? null}
          orderTracking={orderTracking ?? {}}
          addresses={addresses ?? null}
          dashboard={dashboardData}
          logbook={logbook}
        />
      </div>

      <div className="block md:hidden">
        {isAuthenticated ? (
          <>
            <SmartRestockStrip alerts={restockAlerts} className="px-4 pt-4" />
            <MobileProfileLayout
            dashboardData={dashboardData}
            profile={profile}
            orders={orders}
              addresses={addresses}
            />
          </>
        ) : (
          <MobileProfileSignedOutLayout />
        )}
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
