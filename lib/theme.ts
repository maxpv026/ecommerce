import type { ThemePreference } from "@/lib/generated/prisma/enums";

/**
 * The colour scheme, as this device knows it.
 *
 * The account's choice lives in User.themePreference and travels in the
 * session; this module is the device-side half. localStorage holds the
 * resolved choice because the inline script in app/[locale]/layout.tsx
 * reads it before first paint — that script is what prevents a flash, and
 * it can't wait for a session fetch. ThemeSync keeps the two in step.
 *
 * Stored values: "light" | "dark" | "system". Absent means "system", which
 * is also the default for signed-out visitors and new accounts.
 */

export type ThemeChoice = "light" | "dark" | "system";

/** Must match THEME_INIT_SCRIPT in app/[locale]/layout.tsx. */
export const THEME_STORAGE_KEY = "halocore-theme";

/** Fired on window whenever this tab changes the choice, so every hook re-reads it. */
const THEME_EVENT = "halocore-theme-change";

export const THEME_FROM_DB: Record<ThemePreference, ThemeChoice> = { LIGHT: "light", DARK: "dark", SYSTEM: "system" };
export const THEME_TO_DB: Record<ThemeChoice, ThemePreference> = { light: "LIGHT", dark: "DARK", system: "SYSTEM" };

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Sets the `dark` class for a choice without storing it. */
export function paintTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** Stores a choice on this device, paints it, and tells every listener. */
export function applyThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode / blocked storage: the page still switches, it just
    // won't survive a reload on this device.
  }
  paintTheme(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** For useSyncExternalStore: this tab's changes, and other tabs' via `storage`. */
export function subscribeThemeChoice(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
