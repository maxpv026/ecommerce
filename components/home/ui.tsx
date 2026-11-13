"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * The Cart / Settings design language, as primitives for the home page.
 * Class strings are copied from components/CartPage.tsx, not approximated —
 * a home section and a cart section side by side should differ in content
 * only. Change one, change both.
 */

/** Divided list surface (cart lines). */
export const SURFACE =
  "overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/75 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.08] dark:bg-white/[.03]";

/** One row inside SURFACE. */
export const ROW = "border-b border-slate-900/[.06] px-5 py-4 last:border-b-0 dark:border-white/[.06]";

/** The monolithic right card (cart ORDER SUMMARY). */
export const SUMMARY_CARD =
  "rounded-[22px] border border-slate-900/[.1] bg-white/80 p-5 shadow-[0_24px_60px_-44px_rgba(2,4,10,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[.1] dark:bg-white/[.04]";

/** Uppercase eyebrow inside SUMMARY_CARD. */
export const EYEBROW = "m-0 text-[12px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted";

const PILL_BASE = "inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold tracking-[-.01em] transition-colors disabled:opacity-70";

/** Header-toolbar pill (cart "AI audit" / "Bulk import"). */
export const PILL = `${PILL_BASE} border-slate-900/[.12] bg-white/70 text-slate-800 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]`;

/** A PILL used as a filter tab in its selected state (a full class string, not an add-on: two bg-* utilities don't override each other by order). */
export const PILL_ON = `${PILL_BASE} border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900`;

/** Primary CTA (cart "Proceed to checkout"). */
export const PRIMARY =
  "flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-blue-700 text-[15px] font-semibold tracking-[-.02em] text-white transition-[background-color,opacity] hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45";

/** Secondary outline (cart "Generate quote"). */
export const SECONDARY =
  "flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-slate-900/[.12] text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]";

/** Compact inline action inside a row. */
export const ROW_ACTION =
  "inline-flex h-9 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition-colors";
export const ROW_ACTION_PRIMARY = `${ROW_ACTION} bg-blue-700 text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45`;
export const ROW_ACTION_DONE = `${ROW_ACTION} bg-emerald-600 text-white`;
export const ROW_ACTION_GHOST = `${ROW_ACTION} border border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]`;

/** Neutral 40×40 icon tile (replaces the old gradient squares). */
export const ICON_TILE =
  "flex h-10 w-10 flex-none items-center justify-center rounded-[12px] border border-slate-900/[.08] bg-slate-50 text-slate-600 dark:border-white/[.1] dark:bg-white/[.05] dark:text-slate-300";

export const BADGE_TONE = {
  warn: "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]",
  ok: "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]",
  bad: "border-red-500/25 bg-red-500/[.08] text-red-700 dark:text-red-300",
  info: "border-blue-600/20 bg-blue-600/[.07] text-blue-800 dark:border-blue-400/25 dark:bg-blue-500/[.12] dark:text-blue-200",
  muted: "border-slate-900/[.07] bg-slate-100 text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted",
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;

export function MicroBadge({ tone = "muted", children, ...data }: { tone?: BadgeTone; children: ReactNode } & { [attr: `data-${string}`]: string | undefined }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-[10.5px] font-semibold tabular-nums ${BADGE_TONE[tone]}`} {...data}>
      {children}
    </span>
  );
}

/** Safety class → tone, as the cart tags lines: A2L/A3 amber (flammable), A1 green. */
export const safetyTone = (cls: string | null | undefined): BadgeTone => (cls === "A1" ? "ok" : cls === "A2L" || cls === "A3" ? "warn" : "muted");

/** The cart's `- 1 +` stepper. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  decreaseLabel,
  increaseLabel,
  ...data
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
} & { [attr: `data-${string}`]: string | undefined }) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/[.07] disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10";
  return (
    <div className="flex h-9 flex-none items-center gap-0.5 rounded-full border border-slate-900/[.1] bg-slate-50 px-0.5 dark:border-white/[.12] dark:bg-white/[.05]" {...data}>
      <button type="button" aria-label={decreaseLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={btn}>
        <Minus size={14} strokeWidth={2.2} />
      </button>
      <span className="min-w-[24px] text-center text-sm font-semibold tabular-nums" data-stepper-value>
        {value}
      </span>
      <button type="button" aria-label={increaseLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={btn}>
        <Plus size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/** Section header, cart style: bold title + middle-dot metadata left, pill actions right — one row. */
export function SectionHeader({ title, meta, actions, id }: { title: string; meta: Array<string | null | false>; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4" data-section-header={id}>
      <div className="min-w-0">
        <h2 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em]">{title}</h2>
        <p className="m-0 mt-2 text-[14px] text-slate-500 dark:text-ink-muted">{meta.filter(Boolean).join(" · ")}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Stock state of a catalog product, as a badge. */
export function stockBadge(p: { stockLevel: "in" | "low" | "order" | "out" }): { tone: BadgeTone; key: "inStock" | "lowStock" | "onOrder" | "outOfStock" } {
  return p.stockLevel === "out"
    ? { tone: "bad", key: "outOfStock" }
    : p.stockLevel === "low"
      ? { tone: "warn", key: "lowStock" }
      : p.stockLevel === "order"
        ? { tone: "info", key: "onOrder" }
        : { tone: "ok", key: "inStock" };
}
