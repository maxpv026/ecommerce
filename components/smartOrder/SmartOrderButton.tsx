"use client";

import { useTranslations } from "next-intl";
import { FileSpreadsheet, Sparkles } from "lucide-react";
import { useSmartOrderUi } from "@/lib/smartOrderEvents";

/**
 * Entry points to Smart Bulk Order.
 *
 *   "panel"  — the cart: a full-width card with the one-line explanation
 *   "pill"   — the catalogue header: a compact button
 *   "link"   — inside a dashboard card: a text action
 *   "icon"   — the mobile catalogue's top bar
 */
export default function SmartOrderButton({
  variant,
  source,
  className = "",
  label,
}: {
  variant: "panel" | "pill" | "link" | "icon";
  source: "cart" | "catalog" | "dashboard";
  className?: string;
  /** Overrides the pill / link text where the context needs other words. */
  label?: string;
}) {
  const t = useTranslations("SmartOrder");
  const show = useSmartOrderUi((s) => s.show);
  const open = () => show(source);

  if (variant === "panel") {
    return (
      <button
        type="button"
        onClick={open}
        data-smart-order-launch={source}
        className={`group flex w-full items-center gap-3 rounded-[20px] border border-slate-900/[.08] bg-white/70 p-4 text-left backdrop-blur-xl backdrop-saturate-150 transition-colors hover:border-blue-700/30 hover:bg-white dark:border-hairline dark:bg-glass dark:hover:border-blue-400/30 dark:hover:bg-white/[.07] ${className}`}
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,.8)]">
          <FileSpreadsheet size={18} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold tracking-[-.015em]">{t("launch")}</span>
          <span className="mt-0.5 block text-[12px] text-slate-500 dark:text-ink-muted">{t("launchHint")}</span>
        </span>
        <Sparkles size={15} strokeWidth={2} className="flex-none text-blue-700 transition-transform group-hover:scale-110 dark:text-blue-400" />
      </button>
    );
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={t("launch")}
        data-smart-order-launch={source}
        className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-blue-700 transition-colors hover:bg-slate-900/[.06] dark:text-blue-400 dark:hover:bg-white/10 ${className}`}
      >
        <FileSpreadsheet size={18} strokeWidth={1.9} />
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={open}
        data-smart-order-launch={source}
        className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border border-blue-700/25 bg-blue-700/[.07] px-4 text-[13px] font-semibold tracking-[-.01em] text-blue-800 transition-colors hover:bg-blue-700/[.12] dark:border-blue-400/30 dark:bg-blue-500/[.12] dark:text-blue-200 dark:hover:bg-blue-500/[.2] ${className}`}
      >
        <FileSpreadsheet size={15} strokeWidth={2} />
        {label ?? t("launch")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      data-smart-order-launch={source}
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400 ${className}`}
    >
      <FileSpreadsheet size={13} strokeWidth={2.2} />
      {label ?? t("dashboardCta")}
    </button>
  );
}
