"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateThemePreference } from "@/lib/actions/theme";
import {
  THEME_TO_DB,
  applyThemeChoice,
  readThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

function subscribeDarkClass(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * The one way to change the theme — the settings card, the header toggle and
 * the mobile profile all go through it, so none of them can save to the
 * device while forgetting the account (ThemeSync would then undo it on the
 * next load from the stale account value).
 *
 * Optimistic: the page switches on click; for a signed-in user the server
 * action runs in the background, and a failure rolls the switch back.
 */
export function useThemeChoice() {
  const t = useTranslations("Theme");
  const { status, update } = useSession();
  const [saving, startTransition] = useTransition();

  // Server snapshots match what the inline script assumes before it has run:
  // "system", and light until the class says otherwise.
  const choice = useSyncExternalStore(subscribeThemeChoice, readThemeChoice, () => "system" as const);
  const isDark = useSyncExternalStore(
    subscribeDarkClass,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

  const setChoice = (next: ThemeChoice) => {
    const previous = readThemeChoice();
    if (next === previous) return;
    applyThemeChoice(next);
    if (status !== "authenticated") return;

    startTransition(async () => {
      const result = await updateThemePreference(THEME_TO_DB[next]);
      if (result.ok) {
        // Refresh the token, or ThemeSync re-applies the old value from it
        // on the next full page load. The argument matters: update() with
        // none is a plain GET that never runs the trigger === "update" re-read.
        await update({});
        return;
      }
      // Roll back only if nothing newer was picked while this was in flight.
      if (readThemeChoice() === next) applyThemeChoice(previous);
      toast.error(t("saveFailed"));
    });
  };

  return { choice, isDark, setChoice, saving, synced: status === "authenticated" };
}
