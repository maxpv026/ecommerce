"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ToggleSwitch from "./ToggleSwitch";
import { DEFAULT_TOGGLE_STATE, SETTINGS_GROUPS, type SettingsToggleKey } from "@/lib/mobileSettings";
import { nativeLanguageName } from "@/lib/languageNames";

export default function MobileSettingsLayout() {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const [toggles, setToggles] = useState(DEFAULT_TOGGLE_STATE);

  const toggle = (key: SettingsToggleKey) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header: ambient mesh gradient strictly at the top, behind the header row only */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-40 blur-[80px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.38] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.44]" />
          <div className="absolute -top-[140px] left-[32%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />
        </div>

        <div className="relative flex items-center gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <Link
            href="/profile"
            aria-label="Back to Profile"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </Link>
          <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">{t("title")}</span>
          <span className="w-11 flex-none" />
        </div>
      </div>

      {/* Setting groups */}
      <div className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.labelKey} className="mb-6 px-4">
            <div className="mb-2.5 px-1.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
              {t(group.labelKey)}
            </div>
            <div className="overflow-hidden rounded-[18px] border border-slate-900/[.05] bg-white shadow-[0_8px_22px_-20px_rgba(15,23,42,0.4)] dark:border-white/[.06] dark:bg-slate-900">
              {group.items.map((item, idx) => {
                const isLast = idx === group.items.length - 1;
                const labelColor = item.danger ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50";
                const rowClasses = `flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                  item.href ? "transition-colors hover:bg-slate-900/[.02] dark:hover:bg-white/[.03]" : ""
                } ${isLast ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"}`;

                const rowContent = (
                  <>
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${
                        item.danger
                          ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                      }`}
                    >
                      <item.icon size={16} strokeWidth={1.8} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] font-semibold tracking-[-.02em] ${labelColor}`}>
                        {t(item.labelKey)}
                      </span>
                    </span>

                    {(item.value || item.valueKey || item.id === "lang") && (
                      <span
                        className={`max-w-[150px] flex-none truncate text-xs ${
                          item.valueGreen
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {item.id === "lang"
                          ? nativeLanguageName(locale)
                          : item.valueKey
                            ? t(item.valueKey)
                            : item.value}
                      </span>
                    )}

                    {item.toggleKey ? (
                      <ToggleSwitch
                        checked={toggles[item.toggleKey]}
                        onChange={() => toggle(item.toggleKey!)}
                        ariaLabel={t(item.labelKey)}
                        activeClassName={item.toggleActiveClassName}
                      />
                    ) : (
                      <span
                        className={`flex flex-none items-center justify-center ${
                          item.danger ? "text-red-600/55 dark:text-red-400/55" : "text-slate-300 dark:text-slate-600"
                        }`}
                      >
                        <ChevronRight size={16} strokeWidth={2} />
                      </span>
                    )}
                  </>
                );

                if (item.href) {
                  return (
                    <Link key={item.id} href={item.href} className={rowClasses}>
                      {rowContent}
                    </Link>
                  );
                }

                return (
                  <div key={item.id} className={rowClasses}>
                    {rowContent}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="px-4 text-center text-[11px] text-slate-400 dark:text-slate-500">{t("version")}</div>
      </div>
    </div>
  );
}
