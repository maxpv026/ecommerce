import type { ReactNode } from "react";

/**
 * Shared shell for the analytics panels on /profile/compliance.
 *
 * Deliberately NOT importing components/admin/analytics/primitives: that shell
 * belongs to the admin dashboard and is free to change with it. These two
 * surfaces look similar today and answer to different owners.
 */

export const PANEL =
  "rounded-[22px] border border-slate-900/[.08] bg-white/70 dark:border-hairline dark:bg-glass";

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} overflow-hidden`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-4">
        <h2 className="m-0 text-[13px] font-semibold tracking-[-.02em]">{title}</h2>
        {hint ? (
          <span className="text-[11px] tracking-[.06em] text-slate-400 dark:text-slate-500">
            {hint}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 pb-6 pt-2 text-[12.5px] leading-[1.6] text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}

/**
 * Suspense fallback for a panel.
 *
 * Takes the height of the chart it stands in for, so the sections below do not
 * jump when the real one streams in — the same reason the dynamic import
 * carries a `loading` skeleton of matching height.
 */
export function PanelSkeleton({ height = 260, title }: { height?: number; title?: string }) {
  return (
    <section className={`${PANEL} overflow-hidden`} aria-hidden>
      <header className="px-5 pb-3 pt-4">
        {title ? (
          <h2 className="m-0 text-[13px] font-semibold tracking-[-.02em] text-slate-300 dark:text-slate-600">
            {title}
          </h2>
        ) : (
          <div className="h-[13px] w-40 animate-pulse rounded bg-black/[.06] dark:bg-white/[.08]" />
        )}
      </header>
      <div className="px-5 pb-5">
        <div
          className="w-full animate-pulse rounded-[14px] bg-black/[.04] dark:bg-white/[.06]"
          style={{ height }}
        />
      </div>
    </section>
  );
}
