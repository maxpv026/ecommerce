"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { GasIndex } from "@/lib/priceHistory";
import type { PricePoint } from "@/lib/priceHistory";

/**
 * The index strip: one pill per refrigerant the catalog sells (deduplicated
 * by mark; blends without a single gas are left out), its lowest buyable
 * €/kg, GWP, and — only where two recorded days exist — the change since the
 * previous recorded day. Click selects the gas in the terminal. A static
 * strip that scrolls sideways when it doesn't fit, so nothing is clipped.
 */
export default function Ticker({ index, history, selected, onSelect }: { index: GasIndex[]; history: Record<string, PricePoint[]>; selected: string; onSelect: (mark: string) => void }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto rounded-[22px] sm:flex-wrap sm:overflow-visible border border-slate-900/[.08] bg-white/75 p-2 backdrop-blur-xl [scrollbar-width:none] dark:border-white/[.08] dark:bg-white/[.03] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={t("tickerAria")}
      data-hub-ticker
    >
      <span className="flex flex-none items-center gap-2 pl-2 pr-1 text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-500 dark:text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_1px_rgba(16,185,129,.7)]" />
        {t("tickerKicker")}
      </span>
      {index.map((g) => {
        const on = g.mark === selected;
        const pts = history[g.mark] ?? [];
        const prev = pts.length >= 2 ? pts[pts.length - 2]!.perKg : null;
        const change = prev ? ((g.perKg - prev) / prev) * 100 : null;
        return (
          <button
            key={g.mark}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(g.mark)}
            data-hub-ticker-gas={g.mark}
            className={`flex flex-none items-baseline gap-2 rounded-full border px-3.5 py-2 text-left transition-colors ${
              on
                ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900"
                : "border-slate-900/[.1] bg-white/60 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:bg-white/[.03] dark:hover:bg-white/[.07]"
            } ${g.available ? "" : "opacity-60"}`}
            title={g.available ? undefined : t("unavailable")}
          >
            <span className="text-[13px] font-semibold tracking-[-.015em]">{g.label}</span>
            <span className="text-[13px] font-semibold tabular-nums">{eur(g.perKg)}</span>
            {change !== null && Math.abs(change) >= 0.05 && (
              <span className={`text-[11px] font-semibold tabular-nums ${change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {change < 0 ? "▼" : "▲"} {format.number(Math.abs(change), { maximumFractionDigits: 1 })}%
              </span>
            )}
            {g.gwp !== null && <span className={`text-[11px] tabular-nums ${on ? "opacity-70" : "text-slate-500 dark:text-ink-muted"}`}>{t("gwpShort", { value: g.gwp })}</span>}
            {!g.available && <span className={`text-[10.5px] font-semibold uppercase tracking-[.05em] ${on ? "opacity-70" : "text-slate-500 dark:text-ink-muted"}`}>{t("outShort")}</span>}
          </button>
        );
      })}
    </div>
  );
}
