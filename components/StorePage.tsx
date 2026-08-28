"use client";

import { useState } from "react";
import Header from "./Header";
import DesktopHome from "./DesktopHome";
import MobileAppLayout from "./MobileAppLayout";
import AuthModal from "./AuthModal";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder, UserProfileData } from "@/lib/data";

interface StorePageProps {
  recommendedProducts: StoreProduct[];
  marketAlerts: MarketAlertData[];
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
  orders: UserOrder[];
  certificate: UserProfileData["certificate"];
  jobTitle: string | null;
}

export default function StorePage({ recommendedProducts, marketAlerts, dashboard, latestOrder, orders, certificate, jobTitle }: StorePageProps) {
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      {/* Desktop / tablet — real dashboard-style home */}
      <div className="hidden md:block">
        <Header
          query={query}
          onQueryChange={setQuery}
          onSignInClick={() => setIsAuthModalOpen(true)}
        />
        <DesktopHome
          products={recommendedProducts}
          marketAlerts={marketAlerts}
          dashboard={dashboard}
          latestOrder={latestOrder}
        />
      </div>

      {/* Native-app-style mobile home */}
      <div className="block md:hidden">
        <MobileAppLayout
          featuredProducts={recommendedProducts}
          marketAlerts={marketAlerts}
          dashboard={dashboard}
          orders={orders}
          certificate={certificate}
          jobTitle={jobTitle}
        />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
