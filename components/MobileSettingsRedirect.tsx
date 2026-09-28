"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Sends a phone that lands on /profile/settings back to the profile.
 *
 * The standalone mobile settings screen was removed in favour of the
 * profile's own Settings tab and the edit bottom sheet, but the route still
 * exists for desktop — it is where the dashboard's "Manage price alerts"
 * button lands.
 *
 * The breakpoint is checked here, at runtime, rather than relied on from the
 * `md:hidden` wrapper: that class hides this component but still mounts it,
 * so a desktop visitor would run the redirect and lose the settings page.
 * matchMedia is the same breakpoint Tailwind's `md` uses (768px).
 */
export default function MobileSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    router.replace("/profile");
  }, [router]);

  return (
    <div className="grid min-h-screen place-items-center md:hidden" data-mobile-settings-redirect aria-hidden>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-white/20 dark:border-t-blue-400" />
    </div>
  );
}
