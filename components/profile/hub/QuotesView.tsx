"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ICON_TILE, MicroBadge, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE, type BadgeTone } from "@/components/home/ui";
import { useCartStore } from "@/lib/store/cart";
import type { QuoteView } from "@/lib/quotes";
import { Receipt } from "lucide-react";
import { EmptyRow, SurfaceHead } from "./parts";

const TONE: Record<string, BadgeTone> = { PENDING: "ok", ACCEPTED: "info", EXPIRED: "muted" };

/** Saved quotes; a valid one goes into the cart at its quoted prices in one click (as on the quote page). */
export default function QuotesView({ quotes }: { quotes: QuoteView[] }) {
  const t = useTranslations("ProfileHub");
  const tq = useTranslations("Quotes");
  const format = useFormatter();
  const router = useRouter();
  const loadQuote = useCartStore((s) => s.loadQuote);
  const cartItems = useCartStore((s) => s.items.length);
  const [confirm, setConfirm] = useState<string | null>(null);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });

  const toCart = (q: QuoteView) => {
    if (cartItems > 0 && confirm !== q.id) {
      setConfirm(q.id);
      return;
    }
    loadQuote(
      { id: q.id, quoteNumber: q.quoteNumber, validUntil: q.validUntil },
      q.items.map((i) => ({ sku: i.sku, name: i.name, variant: i.variant, pricePerKg: i.pricePerKg, weightKg: i.weightKg, deposit: i.deposit, qty: i.quantity }))
    );
    toast.success(tq("loaded", { number: q.quoteNumber }));
    router.push("/cart");
  };

  return (
    <div className={SURFACE} data-profile-quotes>
      <SurfaceHead title={t("quotesTitle")} meta={[t("quotesMeta")]} id="quotes">
        <Link href="/profile/quotes" className={ROW_ACTION_GHOST}>
          {t("quotesAll")}
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </SurfaceHead>
      {quotes.length === 0 ? (
        <EmptyRow>{t("quotesEmpty")}</EmptyRow>
      ) : (
        quotes.map((q) => (
          <div key={q.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-slate-900/[.06] px-5 py-4 last:border-b-0 dark:border-white/[.06]" data-quote-row={q.quoteNumber}>
            <span className={ICON_TILE}>
              <Receipt size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/profile/quotes/${q.id}`} className="font-mono text-[13.5px] font-semibold hover:text-blue-700 dark:hover:text-blue-400">
                  {q.quoteNumber}
                </Link>
                <MicroBadge tone={TONE[q.status] ?? "muted"}>{tq(`status${q.status[0]}${q.status.slice(1).toLowerCase()}`)}</MicroBadge>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                {t("quoteLines", { count: q.items.length })} · {t("validUntil", { date: format.dateTime(new Date(q.validUntil), { dateStyle: "medium" }) })}
              </div>
            </div>
            <div className="text-right text-[15px] font-semibold tabular-nums">{eur(q.totalAmount)}</div>
            {q.status === "PENDING" ? (
              <button type="button" onClick={() => toCart(q)} className={ROW_ACTION_PRIMARY} data-quote-to-cart>
                <ShoppingCart size={14} strokeWidth={2.2} />
                {confirm === q.id ? tq("orderReplaceConfirm") : t("quoteToCart")}
              </button>
            ) : (
              <Link href={`/profile/quotes/${q.id}`} className={ROW_ACTION_GHOST}>
                {t("open")}
              </Link>
            )}
          </div>
        ))
      )}
    </div>
  );
}
