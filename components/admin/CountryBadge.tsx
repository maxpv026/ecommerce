"use client";

import { useTranslations } from "next-intl";
import { flagEmoji } from "@/lib/country";

/**
 * Where an account is: 🇺🇦 Україна · Львів [UA]. The name is localised on the
 * server (Intl.DisplayNames in the admin's locale) and passed in, so server
 * and browser render the same text. `source` says how it is known; a guess
 * from the interface language reads as one.
 */
export default function CountryBadge({
  country,
  name,
  showSource = false,
  compact = false,
}: {
  country: { code: string; city: string | null; source: string } | null;
  name?: string;
  showSource?: boolean;
  /** No city: for narrow cells (orders list). */
  compact?: boolean;
}) {
  const t = useTranslations("AdminCountry");

  if (!country) {
    return (
      <span
        data-country-badge="unknown"
        title={t("unknownHint")}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-900/[.16] px-2 py-0.5 text-[11.5px] font-medium text-slate-500 dark:border-white/[.18] dark:text-slate-400"
      >
        <span aria-hidden className="text-[13px] leading-none">🌐</span>
        {t("unknown")}
      </span>
    );
  }

  const source = t(`source_${country.source}` as "source_ip");
  const label = name ?? country.code;
  const city = compact ? null : country.city;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <span
        data-country-badge={country.code}
        data-country-source={country.source}
        title={`${label}${country.city ? ` · ${country.city}` : ""} — ${source}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-900/[.1] bg-white py-0.5 pl-1.5 pr-1 text-[11.5px] font-semibold text-slate-800 dark:border-white/[.14] dark:bg-white/[.06] dark:text-slate-100"
      >
        <span aria-hidden className="text-[14px] leading-none">{flagEmoji(country.code)}</span>
        <span className="min-w-0 truncate" data-country-name>
          {label}
          {city && <span className="font-normal text-slate-500 dark:text-slate-400" data-country-city>{` · ${city}`}</span>}
        </span>
        <span data-country-iso className="rounded-full bg-slate-900/[.07] px-1.5 py-px font-mono text-[10px] font-semibold tracking-[.06em] text-slate-600 dark:bg-white/[.12] dark:text-slate-200">
          {country.code}
        </span>
      </span>
      {showSource && (
        <span className={`pl-1 text-[10.5px] ${country.source === "locale" ? "italic text-amber-700 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`} data-country-source-label>
          {source}
        </span>
      )}
    </span>
  );
}
