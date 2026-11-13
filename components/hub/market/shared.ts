/**
 * Shared bits for the market hub's client views.
 *
 * Gas colours: each gas owns one slot of the validated chart palette
 * (globals.css .hub-viz --hv-N) for the whole page, so R-410A is the same
 * orange in the portfolio bar and the legend. Slots follow identity, never
 * rank, and the order matches the palette's validated adjacency.
 */

const SLOT: Record<string, number> = { "R-32": 1, "R-410A": 2, "R-134a": 3, "R-404A": 4, "R-407C": 5, "R-1234yf": 6, "R-290": 7 };

export const gasSlot = (gas: string) => SLOT[gas] ?? 8;
export const gasColor = (gas: string) => `var(--hv-${gasSlot(gas)})`;

/** "R134a" (catalog mark) → "R-134a". */
export const markLabel = (mark: string) => mark.replace(/^R(?=\d)/, "R-");
/** "R-134a" → "R134a". */
export const labelMark = (label: string) => label.replace(/^R-/, "R");

/** Tab-pill classes, as /profile's section tabs. */
export const TAB_ON = "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900";
export const TAB_OFF =
  "border-slate-900/[.12] bg-white/70 text-slate-800 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]";

/** Small segmented-filter pill (as the Documents tab's filter bar). */
export const chip = (on: boolean) =>
  `inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
    on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.12] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-300 dark:hover:bg-white/[.06]"
  }`;
