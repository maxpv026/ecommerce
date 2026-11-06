"use client";

import { Moon, Sun } from "lucide-react";
import { useThemeChoice } from "@/lib/hooks/useThemeChoice";

const DEFAULT_CLASSNAME =
  "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-slate-900/[.12] bg-white text-slate-600 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/30";

interface ThemeToggleProps {
  className?: string;
  iconSize?: number;
}

/**
 * The header's one-click flip. Picks an explicit Light or Dark (leaving
 * "System"); the three-way choice lives on the settings page. Saves through
 * the same hook as settings, so a signed-in flip reaches the account too.
 */
export default function ThemeToggle({ className, iconSize = 15 }: ThemeToggleProps) {
  const { isDark, setChoice } = useThemeChoice();

  return (
    <button
      type="button"
      onClick={() => setChoice(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={className ?? DEFAULT_CLASSNAME}
    >
      {isDark ? <Sun size={iconSize} strokeWidth={2} /> : <Moon size={iconSize} strokeWidth={2} />}
    </button>
  );
}
