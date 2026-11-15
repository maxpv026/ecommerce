import type { Metadata } from "next";
import { auth } from "@/auth";
import { loadAccountSettings } from "@/lib/accountSettings";
import { getNotificationFeed } from "@/lib/notificationFeed";
import AccountSettingsPage from "@/components/AccountSettingsPage";
import NotificationsFeed from "@/components/NotificationsFeed";
import MobileTopBar from "@/components/MobileTopBar";
import FullMessagesProvider from "@/components/i18n/FullMessagesProvider";

export const metadata: Metadata = {
  title: "Notifications & settings — My Energy",
  description: "Email notifications, profile, security and preferences for your My Energy account.",
};

/**
 * Desktop: the account settings (the same page as /profile/settings) — the
 * email notification controls are what someone opening "Notifications" on a
 * computer is after. Phone: the app bar and the account's real event feed
 * (lib/notificationFeed — orders, F-Gas, price alerts, returns; no samples),
 * with a link to the same settings.
 *
 * Gated by proxy.ts, so a visitor has a session; the empty fallbacks only
 * cover a session race. FullMessagesProvider: the settings read route-scoped
 * namespaces (lib/i18n/clientMessages).
 */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const userId = (await auth())?.user?.id ?? null;
  const [data, feed] = await Promise.all([loadAccountSettings(), userId ? getNotificationFeed(userId) : Promise.resolve([])]);

  return (
    <FullMessagesProvider locale={locale}>
      <div className="hidden md:block">
        <AccountSettingsPage {...data} />
      </div>
      <div className="md:hidden">
        <MobileTopBar />
        <NotificationsFeed items={feed} now={new Date().toISOString()} />
      </div>
    </FullMessagesProvider>
  );
}
