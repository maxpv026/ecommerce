"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";

/**
 * Shown while the basket is a quote: which one, until when, and the way back
 * to an ordinary basket. Drops the quote by itself the moment it lapses, so
 * the page never keeps showing a price checkout would now refuse.
 */
export default function QuoteCartBanner({ className = "" }: { className?: string }) {
  const t = useTranslations("Quotes");
  const format = useFormatter();
  const hydrated = useHydrated();
  const quote = useCartStore((s) => s.quote);
  const dropQuote = useCartStore((s) => s.dropQuote);

  useEffect(() => {
    if (!quote) return;
    const left = new Date(quote.validUntil).getTime() - Date.now();
    if (left <= 0) {
      dropQuote();
      return;
    }
    // setTimeout tops out at ~24.8 days; a quote lasts 48 hours.
    const timer = setTimeout(dropQuote, left);
    return () => clearTimeout(timer);
  }, [quote, dropQuote]);

  if (!hydrated || !quote) return null;

  return (
    <div
      data-quote-banner
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-blue-600/25 bg-blue-600/[.06] px-4 py-3 text-[12.5px] leading-[1.5] text-slate-700 dark:border-blue-400/25 dark:bg-blue-400/[.08] dark:text-slate-200 ${className}`}
    >
      <FileText size={16} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
      <span className="min-w-0 flex-1">
        {t.rich("bannerBody", {
          number: quote.quoteNumber,
          date: format.dateTime(new Date(quote.validUntil), {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          }),
          ref: (chunks) => (
            <Link href={`/profile/quotes/${quote.id}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
              {chunks}
            </Link>
          ),
        })}
      </span>
      <button
        type="button"
        onClick={dropQuote}
        className="flex-none font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
      >
        {t("bannerDrop")}
      </button>
    </div>
  );
}
