"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The spend/volume canvas. Client-only, loaded through UserSpendChartMount.
 *
 * Kept apart from anything that fetches so the whole recharts bundle sits
 * behind one dynamic import and never lands on a page with no chart.
 *
 * ── Why the formatters are built here, not taken from useFormatter ─────
 *
 * recharts wants plain `(value) => string` callbacks for its tick and tooltip
 * formatters, and it calls them during its own render pass. Building two
 * `Intl` objects from `useLocale()` once per mount is both simpler and
 * cheaper than routing every axis tick through next-intl's formatter — and it
 * keeps the axis, the tooltip and the panel header all reading the same
 * locale, which a hardcoded "en-IE" did not.
 */

export interface SpendPoint {
  month: string;
  spend: number;
  orders: number;
  cylinders: number;
  massKg: number;
  co2eTonnes: number;
}

// Tech-Luxury on a chart is restraint: ink and one blue, hairline grid, no
// legend chrome, no default palette.
const INK = "#0f172a";
const MUTED = "#94a3b8";
const GRID = "rgba(15,23,42,.07)";
const ACCENT = "#1d4ed8";

/** "Mar" — or "Mar 25" in January, so a 12-month window spanning a year reads correctly. */
function makeMonthLabel(locale: string) {
  const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  return (key: string): string => {
    const [y, m] = key.split("-").map(Number);
    const name = short.format(new Date(Date.UTC(y, m - 1, 1)));
    return m === 1 ? `${name} ${String(y).slice(2)}` : name;
  };
}

export default function UserSpendChartCanvas({ data }: { data: SpendPoint[] }) {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  const eur0 = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  /** Axis ticks: the magnitude only. See the YAxis comment for why. */
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const monthLabel = makeMonthLabel(locale);

  /* Declared inside the component so it closes over the translator and the
     locale formatters. recharts clones whatever is passed to `content`, so
     this is a normal component as far as it is concerned. */
  const ChartTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: SpendPoint }>;
    label?: string | number;
  }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;

    return (
      <div className="rounded-[12px] border border-slate-900/[.10] bg-white/95 px-3 py-2.5 shadow-[0_18px_40px_-20px_rgba(2,4,10,.5)] backdrop-blur dark:border-white/[.14] dark:bg-slate-900/95">
        <div className="text-[10.5px] font-semibold tracking-[.08em] text-slate-400 uppercase dark:text-slate-500">
          {monthLabel(String(label))}
        </div>
        <div className="mt-1.5 text-[15px] font-semibold tabular-nums tracking-[-.02em]">
          {eur0.format(p.spend)}
        </div>
        {p.orders > 0 ? (
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("spendTooltipDetail", {
              orders: p.orders,
              cylinders: p.cylinders,
              co2e: p.co2eTonnes,
            })}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("spendTooltipNoOrders")}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-[240px] w-full px-2 pb-4 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            /* Was interval={0} minTickGap={0}, which forced all twelve month
               labels to draw at any width. In a wide panel they fit; in the
               narrow column this chart now also occupies on /hub they
               collided into "DecJan 26" and "AugSept". Letting recharts drop
               the ones that do not fit keeps the ends anchored, so the range
               the axis covers still reads correctly.

               4px, measured rather than picked: at 8 a 1440px viewport
               dropped "Jan 26" — the one label showing where the year turns
               over. At 4 it keeps all twelve, and 390px thins to seven, with
               no overlap at either width. */
            interval="preserveStartEnd"
            minTickGap={4}
          />
          {/* Bare numbers, no currency symbol — and that is a fix, not a
              shortcut. `width` here is a fixed pixel gutter, and currency
              strings are not a fixed width across locales: en-IE renders
              "€3,800" while uk renders "3 800 EUR", which overran the 64px
              gutter and clipped every label on the axis to "і 800 EUR".
              Widening the gutter only moves the problem to whichever locale is
              widest. The panel's own hint and the tooltip both carry the
              currency, so the axis does not need to repeat it. */}
          <YAxis
            tickFormatter={(v: number) => (v === 0 ? "" : plain.format(v))}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            width={52}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "rgba(15,23,42,.04)" }}
          />
          {/* One series. A stacked spend+volume bar would put euros and
              cylinder counts on the same axis, which compares nothing. */}
          <Bar dataKey="spend" fill={ACCENT} radius={[6, 6, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
