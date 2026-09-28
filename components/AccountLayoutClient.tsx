"use client";

import { useState } from "react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import DashboardDesktop from "./DashboardDesktop";
import SmartRestockStrip from "./profile/SmartRestockStrip";
import MobileProfileLayout from "./MobileProfileLayout";
import MobileProfileSignedOutLayout from "./MobileProfileSignedOutLayout";
import type { ProfileDashboardData, UserAddress, UserOrder, UserProfileData } from "@/lib/data";
import type { ActiveRestockAlert } from "@/lib/smartRestock";
import type { OrderTrackingView } from "@/lib/tracking";

interface AccountLayoutClientProps {
  isAuthenticated: boolean;
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
  orders?: UserOrder[] | null;
  orderTracking?: Record<string, OrderTrackingView>;
  addresses?: UserAddress[] | null;
  /** Predictive restock suggestions; empty renders nothing. */
  restockAlerts?: ActiveRestockAlert[];
}

export default function AccountLayoutClient({
  isAuthenticated,
  dashboardData,
  profile,
  orders,
  orderTracking,
  addresses,
  restockAlerts = [],
}: AccountLayoutClientProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
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
