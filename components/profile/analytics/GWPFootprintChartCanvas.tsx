"use client";

import { useLocale, useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/** One slice: a refrigerant's share of the account's CO2e. */
export interface FootprintSlice {
  refrigerant: string;
  gwp: number | null;
  massKg: number;
  co2eTonnes: number;
  share: number;
  /** At or above the Art. 13 GWP limit. */
  highGwp: boolean;
}

/**
 * Monochrome ramp with one exception: gases under the Article 13 service ban
 * are amber.
 *
 * A rainbow palette would give five gases five arbitrary meanings. Here the
 * only colour that carries information is the one that flags a regulatory
 * restriction — everything else is a shade of ink ordered by size, which is
 * the same ranking the legend prints.
 */
const INK_RAMP = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1"];
const WARN = "#b45309";

const sliceFill = (s: FootprintSlice, i: number) =>
  s.highGwp ? WARN : INK_RAMP[Math.min(i, INK_RAMP.length - 1)];

export default function GWPFootprintChartCanvas({
  data,
  totalTonnes,
}: {
  data: FootprintSlice[];
  totalTonnes: number;
}) {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  const num = new Intl.NumberFormat(locale);
  const tonnes = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // Declared in scope so it closes over the translator and the locale
  // formatters; recharts clones whatever `content` receives.
  const ChartTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: FootprintSlice }>;
  }) => {
    if (!active || !payload?.length) return null;
    const s = payload[0]?.payload;
    if (!s) return null;
    return (
      <div className="rounded-[12px] border border-slate-900/[.10] bg-white/95 px-3 py-2.5 shadow-[0_18px_40px_-20px_rgba(2,4,10,.5)] backdrop-blur dark:border-white/[.14] dark:bg-slate-900/95">
        <div className="text-[12px] font-semibold tracking-[-.01em]">{s.refrigerant}</div>
        <div className="mt-1 text-[15px] font-semibold tabular-nums tracking-[-.02em]">
          {t("tonnesShort", { value: tonnes.format(s.co2eTonnes) })}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {t("carbonTooltipDetail", {
            share: pct.format(s.share),
            mass: num.format(s.massKg),
            gwp: s.gwp === null ? "—" : num.format(s.gwp),
          })}
        </div>
        {s.highGwp ? (
          <div className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-500">
            {t("carbonArt13")}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4 px-5 pb-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-[200px] w-[200px] flex-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="co2eTonnes"
              nameKey="refrigerant"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((s, i) => (
                <Cell key={s.refrigerant} fill={sliceFill(s, i)} />
              ))}
            </Pie>
            {/* zIndex on the wrapper, because the centre total below is a
                sibling that comes LATER in the DOM.

                Neither box carries a z-index of its own, so paint order falls
                back to document order and the total won — it drew straight
                over any tooltip that reached the middle of the donut, which is
                most of them, since the tooltip is anchored to the cursor and
                the slices surround the hole. 100 puts the tooltip in a
                positive stacking layer, above everything at `auto`.

                Fixing it here rather than by reordering the JSX: the overlay
                has to stay after the chart to sit on top of the SLICES, which
                is the whole point of it. */}
            <Tooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 100 }} />
          </PieChart>
        </ResponsiveContainer>

        {/* The total sits in the hole: a donut with an empty centre makes the
            reader add the slices up themselves.

            `pointer-events-none` so it never eats a hover meant for a slice —
            without it, the text is a dead zone that cancels the tooltip
            instead of merely covering it. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-semibold leading-none tracking-[-.045em] tabular-nums">
            {tonnes.format(totalTonnes)}
          </span>
          <span className="mt-1 text-[10px] tracking-[.09em] text-slate-400 dark:text-slate-500">
            {t("carbonUnit")}
          </span>
        </div>
      </div>

      {/* Legend as a list, not recharts' own: it has to carry tonnes and share
          per row, which the built-in legend cannot. */}
      <ul className="m-0 grid w-full min-w-0 list-none grid-cols-1 gap-1.5 p-0">
        {data.map((s, i) => (
          <li key={s.refrigerant} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 flex-none rounded-[3px]"
              style={{ background: sliceFill(s, i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-[-.015em]">
              {s.refrigerant}
            </span>
            <span className="flex-none text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
              {t("tonnesShort", { value: tonnes.format(s.co2eTonnes) })}
            </span>
            <span className="w-[46px] flex-none text-right text-[11.5px] tabular-nums text-slate-400 dark:text-slate-500">
              {pct.format(s.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
