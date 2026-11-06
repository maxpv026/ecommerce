"use client";

import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useThemeChoice } from "@/lib/hooks/useThemeChoice";
import type { ThemeChoice } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemeChoice; icon: typeof Sun; labelKey: string; noteKey: string }> = [
  { value: "light", icon: Sun, labelKey: "themeLight", noteKey: "themeLightNote" },
  { value: "dark", icon: Moon, labelKey: "themeDark", noteKey: "themeDarkNote" },
  { value: "system", icon: Monitor, labelKey: "themeSystem", noteKey: "themeSystemNote" },
];

/**
 * Settings → Appearance: Light / Dark / System.
 *
 * Real radio inputs (visually hidden) inside the cards, so arrow keys, Tab
 * and screen readers get native radio-group behaviour for free.
 */
export default function ThemePreferenceCard({ className = "" }: { className?: string }) {
  const t = useTranslations("AccountSettings");
  const { choice, setChoice, saving, synced } = useThemeChoice();

  return (
    <section data-theme-prefs className={`p-[26px] ${className}`}>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#4f46e5,#0891b2)] text-white shadow-[0_12px_26px_-14px_rgba(79,70,229,.9)]">
          <Palette size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
            {t("appearanceHeading")}
          </h2>
          <p className="mb-0 mt-1 text-[12.5px] leading-[1.5] text-slate-500 dark:text-slate-400">
            {t("appearanceBody")}
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-label={t("appearanceHeading")} className="grid grid-cols-3 gap-2.5">
        {OPTIONS.map(({ value, icon: Icon, labelKey, noteKey }) => {
          const active = choice === value;
          return (
            <label
              key={value}
              data-theme-option={value}
              data-active={active}
              className={`relative flex cursor-pointer flex-col items-start gap-3 rounded-[16px] border p-3.5 transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-500/50 ${
                active
                  ? "border-cyan-600/40 bg-cyan-50/70 shadow-[0_10px_24px_-18px_rgba(8,145,178,.9)] dark:border-cyan-400/40 dark:bg-cyan-400/[.08]"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[.03] dark:hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="theme-preference"
                value={value}
                checked={active}
                onChange={() => setChoice(value)}
                className="sr-only"
              />
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-[12px] border transition-colors duration-200 ${
                  active
                    ? "border-cyan-600/25 bg-white text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300"
                    : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-400"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
                  {t(labelKey)}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
                  {t(noteKey)}
                </span>
              </span>
              {active && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0891b2,#059669)] text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>

      <p
        data-theme-sync-note
        aria-live="polite"
        className="mb-0 mt-4 border-t border-slate-200 pt-4 text-[11.5px] leading-[1.5] text-slate-500 dark:border-white/10 dark:text-slate-400"
      >
        {saving ? t("themeSaving") : synced ? t("themeSynced") : t("themeDeviceOnly")}
      </p>
    </section>
  );
}
