import type { Metadata } from "next";
import AccountSettingsPage from "@/components/AccountSettingsPage";
import MobileSecurityLayout from "@/components/MobileSecurityLayout";
import { loadAccountSettings } from "@/lib/accountSettings";

export const metadata: Metadata = {
  title: "Security & 2FA — My Energy",
  description: "Two-factor authentication, recovery phrase and signed-in devices for your My Energy account.",
};

/**
 * Security & 2FA — the account's real state, never sample data.
 *
 * Desktop: the settings page itself, opened at its Security section (the
 * one place sessions, 2FA and the recovery phrase are managed). Phone: the
 * same controls as a mobile screen. Gated by proxy.ts.
 */
export default async function SecurityPage() {
  const data = await loadAccountSettings();
  return (
    <>
      <div className="hidden md:block">
        <AccountSettingsPage {...data} focus="security" />
      </div>
      <div className="block md:hidden">
        <MobileSecurityLayout security={data.security} email={data.profile?.email ?? ""} now={data.now} />
      </div>
    </>
  );
}
