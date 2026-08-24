"use client";

import { useState } from "react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import DashboardDesktop from "./DashboardDesktop";
import MobileProfileLayout from "./MobileProfileLayout";
import MobileProfileSignedOutLayout from "./MobileProfileSignedOutLayout";
import type { ProfileDashboardData, UserOrder, UserProfileData } from "@/lib/data";

interface AccountLayoutClientProps {
  isAuthenticated: boolean;
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
  orders?: UserOrder[] | null;
}

export default function AccountLayoutClient({
  isAuthenticated,
  dashboardData,
  profile,
  orders,
}: AccountLayoutClientProps) {
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      {/* Desktop: the bento dashboard (My Energy Dashboard Desktop design) */}
      <div className="hidden md:block">
        <Header
          query={query}
          onQueryChange={setQuery}
          onSignInClick={() => setIsAuthModalOpen(true)}
        />
        <DashboardDesktop
          isAuthenticated={isAuthenticated}
          profile={profile ?? null}
          orders={orders ?? null}
          dashboard={dashboardData}
        />
      </div>

      <div className="block md:hidden">
        {isAuthenticated ? (
          <MobileProfileLayout dashboardData={dashboardData} />
        ) : (
          <MobileProfileSignedOutLayout />
        )}
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
