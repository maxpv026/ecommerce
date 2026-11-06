"use client";

import { useEffect, useLayoutEffect } from "react";
import { useSession } from "next-auth/react";
import { THEME_FROM_DB, applyThemeChoice, paintTheme, readThemeChoice } from "@/lib/theme";

/**
 * Keeps the device in step with the account's theme. Renders nothing.
 *
 * Why the account value isn't rendered into the HTML on the server: that
 * would mean reading the session in the root layout, which makes every page
 * dynamic — /categories and /compliance/sds are deliberately served from
 * cache. So the pre-paint script reads the device's copy (no flash), and
 * this reconciles it with the account once the session is known. A device
 * already in step — every visit after the first — never changes at all.
 */
export default function ThemeSync() {
  const { data: session } = useSession();
  const accountTheme = session?.user?.theme;

  // Dev-only safety net (moved here from ThemeToggle): React Strict Mode's
  // mount/unmount/remount resets <html> to the attributes JSX manages,
  // clearing the class the inline script set. Production never remounts.
  useLayoutEffect(() => {
    paintTheme(readThemeChoice());
  }, []);

  // Account → device. Runs when the session first arrives and after
  // update(); undefined (signed out, or a token from before the column
  // existed) leaves the device's own choice alone.
  useEffect(() => {
    if (!accountTheme) return;
    const fromAccount = THEME_FROM_DB[accountTheme];
    if (fromAccount !== readThemeChoice()) applyThemeChoice(fromAccount);
  }, [accountTheme]);

  // "System" follows the OS live — switching macOS to dark at sunset
  // repaints an open tab without a reload.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeChoice() === "system") paintTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return null;
}
