import type { Metadata } from "next";
import { auth } from "@/auth";
import { getUserProfile } from "@/lib/data";
import AccountSettingsPage from "@/components/AccountSettingsPage";
import MobileNotificationsLayout from "@/components/MobileNotificationsLayout";
import FullMessagesProvider from "@/components/i18n/FullMessagesProvider";

export const metadata: Metadata = {
  title: "Notifications & settings — My Energy",
  description: "Email notifications, profile, security and preferences for your My Energy account.",
};

/**
 * Desktop: the account settings (the same page as /profile/settings) — the
 * email notification controls are what someone opening "Notifications" on a
 * computer is after. Phone: the app's notification feed, unchanged; it draws
 * its own bar, so it needs no desktop chrome.
 *
 * Gated by proxy.ts, so a visitor has a session; the null fallback only
 * covers a session race. FullMessagesProvider: the settings read
 * route-scoped namespaces (lib/i18n/clientMessages).
 */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  const profile = session?.user?.id ? await getUserProfile(session.user.id) : null;

  return (
    <FullMessagesProvider locale={locale}>
      <div className="hidden md:block">
        <AccountSettingsPage profile={profile} />
      </div>
      <div className="md:hidden">
        <MobileNotificationsLayout />
      </div>
    </FullMessagesProvider>
  );
}
