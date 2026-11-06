import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, ChevronRight, Receipt } from "lucide-react";
import { auth } from "@/auth";
import { Link, redirect } from "@/i18n/navigation";
import AppChrome from "@/components/AppChrome";
import { getUserQuotes, type QuoteView } from "@/lib/quotes";

export const metadata: Metadata = {
  title: "My Quotes — My Energy",
  description: "Your active and past My Energy price quotes.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_CLS = {
  PENDING: "border-emerald-500/30 bg-emerald-500/[.1] text-emerald-700 dark:text-emerald-400",
  ACCEPTED: "border-blue-500/30 bg-blue-500/[.1] text-blue-700 dark:text-blue-400",
  EXPIRED: "border-slate-400/40 bg-slate-400/[.12] text-slate-600 dark:text-slate-300",
} as const;

export default async function QuotesPage({ params }: PageProps<"/[locale]/profile/quotes">) {
  const { locale } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect({ href: { pathname: "/auth", query: { callbackUrl: "/profile/quotes" } }, locale });

  const [quotes, t, format] = await Promise.all([getUserQuotes(userId!), getTranslations("Quotes"), getFormatter()]);
  const active = quotes.filter((q) => q.status === "PENDING");
  const past = quotes.filter((q) => q.status !== "PENDING");

  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const status = (q: QuoteView) => ({ PENDING: t("statusPending"), ACCEPTED: t("statusAccepted"), EXPIRED: t("statusExpired") })[q.status];

  const row = (q: QuoteView) => (
    <Link
      key={q.id}
      href={`/profile/quotes/${q.id}`}
      data-quote-row={q.quoteNumber}
      className="flex items-center gap-3 rounded-[18px] border border-slate-900/[.08] bg-white/70 px-4 py-3.5 backdrop-blur-xl transition-colors hover:border-blue-600/30 dark:border-hairline dark:bg-white/[.04]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13.5px] font-semibold">{q.quoteNumber}</span>
          <span className={`inline-flex rounded-full border px-2 py-px text-[10.5px] font-semibold ${STATUS_CLS[q.status]}`}>{status(q)}</span>
        </span>
        <span className="mt-1 block truncate text-[12px] text-slate-500 dark:text-slate-400">
          {t("itemsCount", { count: q.items.reduce((n, i) => n + i.quantity, 0) })} ·{" "}
          {q.status === "PENDING"
            ? t("validUntilShort", { date: when(q.validUntil) })
            : q.status === "ACCEPTED" && q.orderNumber
              ? t("orderedAs", { number: q.orderNumber })
              : t("issuedShort", { date: when(q.createdAt) })}
        </span>
      </span>
      <span className="flex-none text-[14px] font-semibold tabular-nums">{eur(q.totalAmount)}</span>
      <ChevronRight size={16} strokeWidth={2} className="flex-none text-slate-400" />
    </Link>
  );

  return (
    <AppChrome>
      <div className="flex-1 bg-slate-50 dark:bg-canvas">
        <div className="mx-auto w-full max-w-[820px] px-4 py-6 pb-[calc(120px+env(safe-area-inset-bottom))] md:px-8 md:py-12">
          <div className="mb-6 flex items-start gap-2">
            <Link
              href="/profile"
              aria-label={t("backToProfile")}
              className="-ml-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 hover:bg-slate-900/[.06] dark:text-slate-200 dark:hover:bg-white/[.08]"
            >
              <ArrowLeft size={20} strokeWidth={2.2} />
            </Link>
            <div>
              <h1 className="m-0 text-[26px] font-semibold tracking-[-.04em] md:text-[32px]">{t("listTitle")}</h1>
              <p className="m-0 mt-1.5 max-w-[560px] text-[13px] leading-[1.6] text-slate-600 dark:text-slate-400">{t("listIntro")}</p>
            </div>
          </div>

          {quotes.length === 0 ? (
            <div className="flex flex-col items-center rounded-[22px] border border-dashed border-slate-900/[.14] px-6 py-12 text-center dark:border-hairline-strong" data-quotes-empty>
              <Receipt size={26} strokeWidth={1.7} className="text-slate-400" />
              <p className="m-0 mt-3 text-[14px] font-semibold">{t("emptyTitle")}</p>
              <p className="m-0 mt-1 max-w-[380px] text-[12.5px] text-slate-500 dark:text-slate-400">{t("emptyBody")}</p>
              <Link href="/cart" className="mt-4 inline-flex h-10 items-center rounded-[12px] bg-blue-700 px-4 text-[13px] font-semibold text-white hover:bg-blue-800">
                {t("emptyCta")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-7">
              <section data-quotes-active>
                <h2 className="m-0 mb-2.5 text-[12px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-slate-400">
                  {t("activeHeading", { count: active.length })}
                </h2>
                {active.length > 0 ? (
                  <div className="flex flex-col gap-2">{active.map(row)}</div>
                ) : (
                  <p className="m-0 text-[12.5px] text-slate-500 dark:text-slate-400">{t("noActive")}</p>
                )}
              </section>
              {past.length > 0 && (
                <section data-quotes-past>
                  <h2 className="m-0 mb-2.5 text-[12px] font-semibold tracking-[.08em] text-slate-500 uppercase dark:text-slate-400">
                    {t("pastHeading", { count: past.length })}
                  </h2>
                  <div className="flex flex-col gap-2">{past.map(row)}</div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </AppChrome>
  );
}
