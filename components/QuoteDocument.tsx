"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Printer, ShoppingCart } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { VAT_RATE } from "@/lib/cart";
import { formatKg } from "@/lib/pricing";
import { useCartStore } from "@/lib/store/cart";
import type { QuoteView } from "@/lib/quotes";

export interface QuoteSeller {
  name: string;
  addressLines: string[];
  vatId?: string;
  email?: string;
}

/**
 * The quote as a document. On screen: a sheet with a toolbar. On paper (or
 * "Save as PDF"): the sheet alone — the toolbar, app header and nav are
 * removed by the print rules in globals.css, and everything that carries
 * meaning is ink-only so it survives a black-and-white printer.
 *
 * Every figure is the quote's frozen snapshot; nothing here re-reads the
 * live catalog.
 */
export default function QuoteDocument({ quote, seller }: { quote: QuoteView; seller: QuoteSeller }) {
  const t = useTranslations("Quotes");
  const format = useFormatter();
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const cartQuote = useCartStore((s) => s.quote);
  const loadQuote = useCartStore((s) => s.loadQuote);
  // Loading the quote replaces the basket — a non-empty, different basket
  // takes a second click so nothing is thrown away by surprise.
  const [confirmReplace, setConfirmReplace] = useState(false);

  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long" });
  // With the zone: "valid until 2:10" means nothing on paper without it.
  const dateTime = (iso: string) =>
    format.dateTime(new Date(iso), { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

  const pending = quote.status === "PENDING";

  const orderQuote = () => {
    const replacing = items.length > 0 && cartQuote?.id !== quote.id;
    if (replacing && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    loadQuote(
      { id: quote.id, quoteNumber: quote.quoteNumber, validUntil: quote.validUntil },
      quote.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        variant: i.variant,
        pricePerKg: i.pricePerKg,
        weightKg: i.weightKg,
        deposit: i.deposit,
        qty: i.quantity,
      }))
    );
    toast.success(t("loaded", { number: quote.quoteNumber }));
    router.push("/cart");
  };

  const statusLabel = { PENDING: t("statusPending"), ACCEPTED: t("statusAccepted"), EXPIRED: t("statusExpired") }[quote.status];
  const statusCls = {
    PENDING: "border-emerald-500/30 bg-emerald-500/[.1] text-emerald-700 dark:text-emerald-400",
    ACCEPTED: "border-blue-500/30 bg-blue-500/[.1] text-blue-700 dark:text-blue-400",
    EXPIRED: "border-slate-400/40 bg-slate-400/[.12] text-slate-600 dark:text-slate-300",
  }[quote.status];

  return (
    <div className="flex-1 bg-slate-50 dark:bg-canvas">
      {/* Screen toolbar — never printed. */}
      <header className="relative z-40 border-b border-slate-900/[.07] bg-white/80 backdrop-blur-xl backdrop-saturate-150 max-md:sticky max-md:top-0 print:hidden dark:border-hairline dark:bg-glass">
        <div className="mx-auto flex min-h-14 max-w-[920px] flex-wrap items-center gap-2 px-2 py-2 md:min-h-16 md:px-4">
          <Link
            href="/profile/quotes"
            aria-label={t("back")}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-900/[.06] dark:text-slate-200 dark:hover:bg-white/[.08]"
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </Link>
          <h1 className="m-0 min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-.03em] md:text-[17px]">
            {quote.quoteNumber}
          </h1>
          <button
            type="button"
            onClick={() => window.print()}
            data-print-quote
            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-slate-900/[.14] px-3.5 text-[13px] font-semibold transition-colors hover:bg-slate-900/[.04] dark:border-hairline-strong dark:hover:bg-white/[.06]"
          >
            <Printer size={15} strokeWidth={2} />
            {t("print")}
          </button>
          {pending && (
            <button
              type="button"
              onClick={orderQuote}
              onBlur={() => setConfirmReplace(false)}
              data-order-quote
              className={`inline-flex h-10 items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-semibold text-white transition-colors ${
                confirmReplace ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-700 hover:bg-blue-800"
              }`}
            >
              <ShoppingCart size={15} strokeWidth={2} />
              {confirmReplace ? t("orderReplaceConfirm") : t("orderQuote")}
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[920px] px-4 py-6 pb-[calc(120px+env(safe-area-inset-bottom))] md:px-8 md:py-10 print:p-0">
        {quote.status !== "PENDING" && (
          <p className="m-0 mb-4 rounded-[14px] border border-slate-900/[.08] bg-white/70 px-4 py-3 text-[13px] leading-[1.55] text-slate-600 print:hidden dark:border-hairline dark:bg-white/[.04] dark:text-slate-300">
            {quote.status === "EXPIRED"
              ? t("expiredNote")
              : quote.orderId
                ? t.rich("acceptedNote", {
                    number: quote.orderNumber ?? "",
                    link: (chunks) => (
                      <Link href={`/profile/orders/${quote.orderId}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
                        {chunks}
                      </Link>
                    ),
                  })
                : t("acceptedNoOrder")}
          </p>
        )}

        <article
          data-quote-sheet
          className="rounded-[20px] border border-slate-900/[.08] bg-white p-6 text-slate-900 shadow-[0_24px_60px_-40px_rgba(15,23,42,.45)] md:p-10 dark:border-white/[.08] dark:bg-[#11141a] dark:text-slate-100"
        >
          {/* Letterhead */}
          <div className="flex flex-col gap-6 border-b border-slate-900/[.12] pb-6 sm:flex-row sm:justify-between dark:border-white/[.12]">
            <div>
              <div className="text-[22px] font-semibold tracking-[-.035em]">{seller.name}</div>
              <div className="mt-2 text-[12px] leading-[1.6] text-slate-600 dark:text-slate-400">
                {seller.addressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {seller.vatId && <div>{t("vatId", { id: seller.vatId })}</div>}
                {seller.email && <div>{seller.email}</div>}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold tracking-[.14em] text-slate-500 uppercase dark:text-slate-400">{t("docTitle")}</div>
              <div className="mt-1 font-mono text-[18px] font-semibold tracking-[-.01em]" data-quote-number>
                {quote.quoteNumber}
              </div>
              <dl className="m-0 mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[12px] sm:justify-end">
                <dt className="text-slate-500 dark:text-slate-400">{t("issued")}</dt>
                <dd className="m-0">{date(quote.createdAt)}</dd>
                <dt className="text-slate-500 dark:text-slate-400">{t("validUntil")}</dt>
                <dd className="m-0 font-semibold" data-valid-until>
                  {dateTime(quote.validUntil)}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">{t("status")}</dt>
                <dd className="m-0">
                  <span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-semibold print:border-black ${statusCls}`} data-quote-status>
                    {statusLabel}
                  </span>
                </dd>
              </dl>
            </div>
          </div>

          {/* Buyer */}
          <section className="border-b border-slate-900/[.12] py-6 dark:border-white/[.12]" data-quote-buyer>
            <div className="text-[11px] font-semibold tracking-[.12em] text-slate-500 uppercase dark:text-slate-400">{t("preparedFor")}</div>
            <div className="mt-2 grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2">
              <Field label={t("buyerName")} value={quote.buyerName} missing={t("notOnFile")} />
              <Field label={t("buyerCompany")} value={quote.companyName} missing={t("notOnFile")} />
              <Field label={t("buyerVat")} value={quote.vatNumber} missing={t("notOnFile")} />
              <Field label={t("buyerEmail")} value={quote.buyerEmail} missing={t("notOnFile")} />
            </div>
            {(!quote.companyName || !quote.vatNumber) && (
              <p className="m-0 mt-3 text-[12px] text-amber-700 print:hidden dark:text-amber-400">
                {t.rich("missingCompany", {
                  link: (chunks) => (
                    <Link href="/profile/company" className="font-semibold underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </section>

          {/* Lines */}
          <section className="py-6" data-quote-items>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-900/[.2] text-left text-[10.5px] tracking-[.08em] text-slate-500 uppercase dark:border-white/[.2] dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">{t("colItem")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t("colQty")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t("colPerKg")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t("colUnit")}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t("colDeposit")}</th>
                    <th className="py-2 text-right font-semibold">{t("colTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-900/[.08] align-top dark:border-white/[.08]" data-quote-line={item.sku}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold">{item.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {item.sku} · {item.variant}
                          {item.weightKg !== 1 ? ` · ${formatKg(item.weightKg)}` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{item.weightKg !== 1 ? eur(item.pricePerKg) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{eur(item.unitPrice)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{item.deposit > 0 ? eur(item.deposit) : "—"}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{eur(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals — the same breakdown checkout charges. */}
            <dl className="m-0 mt-5 ml-auto grid w-full max-w-[340px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13px]" data-quote-totals>
              <dt className="text-slate-600 dark:text-slate-400">{t("subtotal")}</dt>
              <dd className="m-0 text-right tabular-nums">{eur(quote.subtotal)}</dd>
              <dt className="text-slate-600 dark:text-slate-400">{t("shipping")}</dt>
              <dd className="m-0 text-right tabular-nums">{quote.shippingAmount > 0 ? eur(quote.shippingAmount) : t("shippingFree")}</dd>
              <dt className="text-slate-600 dark:text-slate-400">{t("vat", { pct: Math.round(VAT_RATE * 100) })}</dt>
              <dd className="m-0 text-right tabular-nums">{eur(quote.vatAmount)}</dd>
              <dt className="text-slate-600 dark:text-slate-400">{t("deposit")}</dt>
              <dd className="m-0 text-right tabular-nums">{eur(quote.depositTotal)}</dd>
              <div aria-hidden className="col-span-2 mt-1.5 border-t border-slate-900/[.2] dark:border-white/[.2]" />
              <dt className="pt-0.5 font-semibold">{t("total")}</dt>
              <dd className="m-0 pt-0.5 text-right text-[17px] font-semibold tabular-nums" data-quote-total>
                {eur(quote.totalAmount)}
              </dd>
            </dl>
          </section>

          {/* Terms */}
          <section className="border-t border-slate-900/[.12] pt-5 text-[11.5px] leading-[1.65] text-slate-600 dark:border-white/[.12] dark:text-slate-400" data-quote-terms>
            <div className="mb-1.5 text-[11px] font-semibold tracking-[.12em] text-slate-500 uppercase dark:text-slate-400">{t("termsTitle")}</div>
            <ol className="m-0 list-decimal pl-4">
              <li>{t("termValidity", { date: dateTime(quote.validUntil) })}</li>
              <li>{t("termAccept")}</li>
              <li>{t("termStock")}</li>
              <li>{t("termFgas")}</li>
              <li>{t("termDeposit")}</li>
              <li>{t("termPayment")}</li>
            </ol>
          </section>
        </article>
      </div>
    </div>
  );
}

function Field({ label, value, missing }: { label: string; value: string | null; missing: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-[92px] flex-none text-slate-500 dark:text-slate-400">{label}</span>
      <span className={value ? "font-medium" : "text-slate-400 italic dark:text-slate-500"}>{value || missing}</span>
    </div>
  );
}
