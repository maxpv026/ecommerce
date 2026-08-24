"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import AccountSidebar from "./AccountSidebar";
import MobileProfileLayout from "./MobileProfileLayout";
import MobileProfileSignedOutLayout from "./MobileProfileSignedOutLayout";
import { ACCOUNT_PROFILE } from "@/lib/account";
import type { ProfileDashboardData, UserProfileData } from "@/lib/data";

interface AccountLayoutClientProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
}

export default function AccountLayoutClient({
  children,
  isAuthenticated,
  dashboardData,
  profile,
}: AccountLayoutClientProps) {
  const t = useTranslations("AccountProfile");
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // The "Dana Mercer" placeholder profile exists ONLY for the signed-out
  // desktop preview. A real session never falls through to it: a user with
  // no name yet is shown by their email, and a missing company simply
  // omits that segment of the subtitle.
  const displayName = isAuthenticated
    ? (profile?.name || session?.user?.name || session?.user?.email || profile?.email) ?? ""
    : ACCOUNT_PROFILE.name;
  const displayCompany = isAuthenticated
    ? (profile?.companyName ?? session?.user?.companyName ?? null)
    : ACCOUNT_PROFILE.companyLabel;
  const displayOrderCount = dashboardData?.totalOrders ?? (isAuthenticated ? 0 : ACCOUNT_PROFILE.orderCount);
  const customerSinceYear = profile?.memberSinceYear ?? ACCOUNT_PROFILE.customerSinceYear;

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <section className="mx-auto max-w-[1240px] px-8 pb-24 pt-12">
        <div className="mb-8.5">
          <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-slate-500">
            {t("accountEyebrow")}
          </div>
          <h1 className="m-0 text-[38px] font-semibold tracking-[-.04em]">{displayName}</h1>
          <p className="mt-2 text-[13.5px] text-slate-500 dark:text-slate-400">
            {displayCompany ? `${displayCompany} · ` : ""}
            {t("customerSince", { year: customerSinceYear })} ·{" "}
            {t("ordersCountSuffix", { count: displayOrderCount })}
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[232px_1fr] lg:gap-11">
          <AccountSidebar />

          {/* Main content area: ambient mesh gradient behind the glass cards */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-[120px] -top-[140px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-20 blur-[120px] [animation:hc-float_24s_ease-in-out_infinite] dark:opacity-[.3]" />
              <div className="absolute -right-[100px] top-[220px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.18] blur-[120px] [animation:hc-float_30s_ease-in-out_infinite_reverse] dark:opacity-[.28]" />
            </div>

            <div className="relative flex flex-col gap-5.5">{children}</div>
          </div>
        </div>
      </section>
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
