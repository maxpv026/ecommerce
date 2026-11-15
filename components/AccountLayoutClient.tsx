"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Header from "./Header";
import AuthModal from "./AuthModal";
import SmartRestockStrip from "./profile/SmartRestockStrip";
import MobileTopBar from "./MobileTopBar";
import ProfileHub, { type LogbookSummary } from "./profile/hub/ProfileHub";
import type { ProfileTab } from "@/lib/profileTabs";
import type { ProfileDashboardData, UserAddress, UserOrder, UserProfileData } from "@/lib/data";
import type { ActiveRestockAlert } from "@/lib/smartRestock";
import type { OrderTrackingView } from "@/lib/tracking";
import type { ProfileHubData } from "@/lib/profileHub";

interface AccountLayoutClientProps {
  isAuthenticated: boolean;
  dashboardData: ProfileDashboardData | null;
  profile?: UserProfileData | null;
  orders?: UserOrder[] | null;
  orderTracking?: Record<string, OrderTrackingView>;
  addresses?: UserAddress[] | null;
  /** Predictive restock suggestions; empty renders nothing. */
  restockAlerts?: ActiveRestockAlert[];
  /** This year's F-Gas logbook figures. */
  logbook?: LogbookSummary | null;
  /** Preferences, cylinder fleet, quotes, favourites, security (lib/profileHub). */
  hub?: ProfileHubData | null;
  initialTab?: ProfileTab;
  initialDocFilter?: string;
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
  hub = null,
  initialTab = "overview",
  initialDocFilter,
}: AccountLayoutClientProps) {
  const t = useTranslations("ProfileHub");
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
      {/* One profile at every width (the separate phone profile is gone): the
          desktop Header above md, the phone app bar below; the same nine tabs. */}
      <div className="hidden md:contents">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
      </div>
      <MobileTopBar />
      <div>
        {isAuthenticated && profile && hub ? (
          <>
            <SmartRestockStrip alerts={restockAlerts} className="mx-auto max-w-7xl px-4 pt-5 sm:px-8 sm:pt-7" />
            <ProfileHub
              profile={profile}
              orders={orders ?? []}
              orderTracking={orderTracking ?? {}}
              addresses={addresses ?? []}
              dashboard={dashboardData}
              logbook={logbook}
              hub={hub}
              initialTab={initialTab}
              initialDocFilter={initialDocFilter}
            />
          </>
        ) : (
          // No session (a race past the proxy gate): ask to sign in — never a sample account.
          <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pb-24 sm:pt-9" data-profile-signed-out>
            <h1 className="m-0 text-[34px] font-semibold max-sm:text-[28px] leading-[1.1] tracking-[-.04em]">{t("signedOutTitle")}</h1>
            <p className="m-0 mt-2 text-[14px] text-slate-500 dark:text-ink-muted">{t("signedOutBody")}</p>
            <Link href="/auth" className="mt-6 inline-flex h-12 items-center rounded-[14px] bg-blue-700 px-6 text-[14.5px] font-semibold text-white hover:bg-blue-800">
              {t("signIn")}
            </Link>
          </main>
        )}
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
