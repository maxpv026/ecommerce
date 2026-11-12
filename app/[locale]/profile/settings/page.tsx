import type { Metadata } from "next";
import AccountSettingsPage from "@/components/AccountSettingsPage";
import { loadAccountSettings } from "@/lib/accountSettings";
import MobileSettingsRedirect from "@/components/MobileSettingsRedirect";

export const metadata: Metadata = {
  title: "Settings — My Energy",
  description: "Manage your My Energy account, security, and notification preferences.",
};

/**
 * Desktop-only.
 *
 * Mobile used to get a full settings screen here, reached from a gear in the
 * profile header. That model is gone: basic profile edits happen in a bottom
 * sheet on the profile itself, and the remaining preference screens
 * (password, language, currency) are listed under the profile's own Settings
 * tab. The route stays because the desktop dashboard's "Manage price alerts"
 * button lands on it.
 *
 * A phone that reaches this URL — an old bookmark, a shared link — is sent
 * back to the profile rather than shown an empty page. Done with CSS + a
 * client redirect rather than a user-agent sniff, because the breakpoint is
 * what actually decides which UI exists.
 */
export default async function SettingsPage() {
  // proxy.ts gates /profile/settings, so a visitor always has a session by
  // the time this runs; the loader's null fallback only covers a session race.
  const data = await loadAccountSettings();

  return (
    <>
      <div className="hidden md:block">
        <AccountSettingsPage {...data} />
      </div>
      <div className="block md:hidden">
        <MobileSettingsRedirect />
      </div>
    </>
  );
}
