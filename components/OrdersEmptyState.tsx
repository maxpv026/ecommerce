"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, PackageOpen } from "lucide-react";

/**
 * "No orders yet" for /profile/orders, shared by the desktop history page
 * and the mobile layout so the two can never say different things.
 *
 * The icon is deliberately low-opacity: it should read as a placeholder for
 * something that isn't there, not as a graphic competing with the CTA.
 */
export default function OrdersEmptyState({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("OrderHistory");

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      data-orders-empty
      className={`rounded-[28px] border border-dashed border-slate-900/[.14] bg-white/70 text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass ${
        compact ? "px-5 py-[52px]" : "px-7 py-[84px]"
      }`}
    >
      <span
        className={`relative inline-flex items-center justify-center rounded-[32px] border border-slate-900/[.07] bg-slate-100 [animation:hc-bob_6s_ease-in-out_infinite] dark:border-hairline dark:bg-surface-3 ${
          compact ? "h-20 w-20" : "h-24 w-24"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[30px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_68%)] opacity-40 blur-[34px] [animation:hc-breathe_5s_ease-in-out_infinite]"
        />
        <PackageOpen
          size={compact ? 34 : 40}
          strokeWidth={1.6}
          className="relative text-slate-900 opacity-25 dark:text-slate-50 dark:opacity-30"
        />
      </span>

      <h2 className={`m-0 mt-[26px] font-semibold tracking-[-.04em] ${compact ? "text-[19px]" : "text-[23px]"}`}>
        {t("emptyTitle")}
      </h2>
      <p className="mx-auto mb-[26px] mt-3 max-w-[380px] text-[13.5px] leading-[1.62] text-slate-600 dark:text-ink-muted">
        {t("emptyBody")}
      </p>

      <Link
        href="/products"
        data-orders-empty-cta
        className="inline-flex h-[50px] items-center justify-center gap-2.5 rounded-2xl bg-blue-700 px-[26px] text-[14.5px] font-semibold tracking-[-.02em] text-white shadow-[0_22px_46px_-18px_#1d4ed8,0_0_30px_-10px_#1d4ed8] transition-colors hover:bg-blue-800"
      >
        {t("emptyCta")}
        <ArrowRight size={16} strokeWidth={2} />
      </Link>
    </motion.div>
  );
}
