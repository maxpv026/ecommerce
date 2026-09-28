import type { CSSProperties, ReactNode } from "react";

/**
 * Shared shell, skeletons and the one stat card the dashboard repeats.
 *
 * All server components: none of this is interactive, so shipping it to the
 * browser as JavaScript would be paying for markup nobody clicks. Only the
 * chart canvas is a client component, because recharts measures the DOM.
 */

export const PANEL =
  "rounded-[22px] border border-slate-900/[.08] bg-white/70 shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass";

export const CAPTION =
  "text-[10.5px] font-semibold tracking-[.09em] text-slate-400 uppercase dark:text-slate-500";

export function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${PANEL} ${className}`}>
      <header className="flex items-baseline justify-between gap-4 border-b border-slate-900/[.06] px-6 py-4 dark:border-hairline">
        <h2 className="m-0 text-[14px] font-semibold tracking-[-.02em]">{title}</h2>
        {hint ? <span className={CAPTION}>{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEur(value: number): string {
  return eur.format(value);
}

/**
 * One headline figure.
 *
 * The trend is deliberately monochrome rather than the usual green/red. On a
 * B2B operations board "pending invoices down 20%" is good and "cylinders out
 * up 30%" is ambiguous — colouring a direction implies a judgement the number
 * alone does not support. Direction is carried by the arrow and the sign.
 */
export function StatCard({
  label,
  value,
  trendPercent,
  comparedTo,
  accent = false,
}: {
  label: string;
  value: string;
  trendPercent: number | null;
  comparedTo: string;
  accent?: boolean;
}) {
  const hasTrend = trendPercent !== null && Number.isFinite(trendPercent);
  const up = hasTrend && trendPercent > 0;
  const flat = hasTrend && trendPercent === 0;

  return (
    <div
      className={`${PANEL} p-5 ${accent ? "ring-1 ring-blue-700/[.18] dark:ring-blue-500/25" : ""}`}
      data-stat={label}
    >
      <div className={CAPTION}>{label}</div>
      <div
        className={`mt-2.5 text-[30px] font-semibold leading-none tracking-[-.045em] tabular-nums ${
          accent ? "text-blue-700 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
        {hasTrend ? (
          <>
            <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {flat ? "—" : `${up ? "↑" : "↓"} ${Math.abs(trendPercent).toFixed(1)}%`}
            </span>
            <span>vs {comparedTo}</span>
          </>
        ) : (
          // No baseline is not "0%". A point-in-time count has nothing to
          // compare against, and inventing a trend would be decoration.
          <span>as of {comparedTo}</span>
        )}
      </div>
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────
// Each mirrors the real block's height so the streamed content drops in
// without moving anything below it.

function Shimmer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-[10px] bg-black/[.05] dark:bg-white/[.07] ${className}`}
      style={style}
    />
  );
}

export function StatCardRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`${PANEL} p-5`}>
          <Shimmer className="h-2.5 w-24" />
          <Shimmer className="mt-3.5 h-7 w-28" />
          <Shimmer className="mt-3.5 h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <section className={PANEL} aria-hidden>
      <header className="border-b border-slate-900/[.06] px-6 py-4 dark:border-hairline">
        <Shimmer className="h-3.5 w-40" />
      </header>
      <div className="flex h-[260px] items-end gap-2 px-6 pb-6 pt-8">
        {[38, 62, 45, 78, 55, 88, 40, 70, 52, 84, 47, 66].map((h, i) => (
          <Shimmer key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </section>
  );
}

export function TableSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <section className={PANEL} aria-hidden>
      {title ? (
        <header className="border-b border-slate-900/[.06] px-6 py-4 dark:border-hairline">
          <Shimmer className="h-3.5 w-36" />
        </header>
      ) : null}
      <div className="divide-y divide-slate-900/[.05] dark:divide-hairline/60">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-6 py-[15px]">
            <Shimmer className="h-3 w-40" />
            <Shimmer className="h-3 w-14" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Shown when a panel has no data at all — never an error, just quiet. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center text-[13px] text-slate-500 dark:text-slate-400">{children}</div>
  );
}
