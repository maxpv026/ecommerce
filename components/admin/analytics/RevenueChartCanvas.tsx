"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The recharts canvas. Client-only, loaded through RevenueChartMount.
 *
 * Kept apart from anything that fetches so the whole recharts bundle is
 * behind one dynamic import and never lands on a page that has no chart.
 */

export interface RevenuePoint {
  date: string;
  booked: number;
  paid: number;
  orders: number;
}

// Tech-Luxury on a chart means restraint: ink and a single blue, hairline
// grid, no legend chrome, no default rainbow palette.
const INK = "#0f172a";
const MUTED = "#94a3b8";
const GRID = "rgba(15,23,42,.07)";
const ACCENT = "#1d4ed8";

const eur0 = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** "16 Sep" — the axis has no room for a year, and the range is at most 12 months. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: RevenuePoint }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-[12px] border border-slate-900/[.10] bg-white/95 px-3 py-2.5 shadow-[0_18px_40px_-20px_rgba(2,4,10,.5)] backdrop-blur dark:border-white/[.14] dark:bg-slate-900/95">
      <div className="text-[10.5px] font-semibold tracking-[.08em] text-slate-400 uppercase dark:text-slate-500">
        {shortDay(String(label))}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tabular-nums tracking-[-.02em]">
          {eur0.format(point.booked)}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">booked</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[12.5px] font-semibold tabular-nums text-blue-700 dark:text-blue-400">
          {eur0.format(point.paid)}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">settled</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        {point.orders} order{point.orders === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export default function RevenueChartCanvas({ data }: { data: RevenuePoint[] }) {
  // Thin the X labels rather than rotating them: a 90-day range would
  // otherwise print 90 overlapping dates.
  const tickGap = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="h-[260px] w-full px-2 pb-4 pt-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 18, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="bookedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INK} stopOpacity={0.12} />
              <stop offset="100%" stopColor={INK} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Horizontal hairlines only — vertical rules add noise, not reading. */}
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            interval={tickGap - 1}
            tick={{ fill: MUTED, fontSize: 10.5 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            dy={6}
          />
          <YAxis
            tickFormatter={(v: number) => (v === 0 ? "0" : eur0.format(v))}
            tick={{ fill: MUTED, fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            width={62}
            // 10% headroom. Recharts' default domain ends exactly at the
            // maximum, so the best day of the month is drawn touching the top
            // edge and reads as clipped rather than as a peak.
            domain={[0, (dataMax: number) => (dataMax <= 0 ? 10 : Math.ceil(dataMax * 1.1))]}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: GRID, strokeWidth: 1 }}
          />

          {/* Booked sits behind in ink; settled sits in front in the accent,
              so the gap between the two IS the outstanding receivable. */}
          <Area
            type="monotone"
            dataKey="booked"
            stroke={INK}
            strokeWidth={1.6}
            fill="url(#bookedFill)"
            dot={false}
            activeDot={{ r: 3, fill: INK, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="paid"
            stroke={ACCENT}
            strokeWidth={1.6}
            fill="url(#paidFill)"
            dot={false}
            activeDot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
