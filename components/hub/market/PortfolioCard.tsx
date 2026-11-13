"use client";

import { useFormatter, useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { EYEBROW, SUMMARY_CARD } from "@/components/home/ui";
import type { HubPortfolio } from "@/lib/hubData";
import { gasColor, gasSlot } from "./shared";

/**
 * The right card on the exchange and digest tabs: what this buyer has been
 * supplied (from the same ledger as the F-Gas logbook) — the gas mix and four
 * numbers. Compliance status and trust badges belong to /cart; comparing
 * gases is its own tab.
 */
export default function PortfolioCard({ portfolio, signedIn, onNeedSignIn }: { portfolio: HubPortfolio | null; signedIn: boolean; onNeedSignIn: () => void }) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const n2 = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const gases = [...(portfolio?.gases ?? [])].filter((g) => g.massKg > 0).sort((a, b) => gasSlot(a.gas) - gasSlot(b.gas));
  const mass = gases.reduce((s, g) => s + g.massKg, 0);
  const byMass = [...gases].sort((a, b) => b.massKg - a.massKg);
  const [a, b] = byMass;

  return (
    <div className={SUMMARY_CARD} data-hub-portfolio={signedIn ? (gases.length ? "data" : "empty") : "guest"}>
      <h2 className={EYEBROW}>{t("portfolioEyebrow")}</h2>

      {!signedIn ? (
        <div className="mt-3">
          <p className="m-0 text-[13px] leading-[1.55] text-slate-600 dark:text-slate-300">{t("portfolioGuest")}</p>
          <button type="button" onClick={onNeedSignIn} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-hub-signin>
            <LogIn size={14} strokeWidth={2.2} />
            {t("signIn")}
          </button>
        </div>
      ) : gases.length === 0 ? (
        <p className="m-0 mt-3 text-[13px] leading-[1.55] text-slate-600 dark:text-slate-300">{t("portfolioEmpty")}</p>
      ) : (
        <>
          {/* Segmented bar by kg supplied: one slot colour per gas, 2px gaps; the legend carries the values. */}
          <div className="hub-viz mt-4">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={t("mixAria")} data-hub-mix>
              {gases.map((g) => (
                <span key={g.gas} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(g.massKg / mass) * 100}%`, background: gasColor(g.gas) }} />
              ))}
            </div>
            <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0 text-[12px]">
              {gases.map((g) => (
                <li key={g.gas} className="flex min-w-0 items-center gap-1.5" data-hub-mix-gas={g.gas}>
                  <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: gasColor(g.gas) }} />
                  <span className="font-semibold">{g.gas}</span>
                  <span className="truncate text-slate-500 tabular-nums dark:text-ink-muted">
                    {Math.round((g.massKg / mass) * 100)}% · {t("kg", { value: n1(g.massKg) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="m-0 mt-4 grid grid-cols-2 gap-2">
            {[
              { k: "kg", label: t("kpiKg"), value: t("kg", { value: n1(portfolio!.massKg) }) },
              { k: "co2e", label: t("kpiCo2e"), value: t("tonnesShort", { value: n2(portfolio!.co2eTonnes) }) },
              { k: "spend", label: t("kpiSpend"), value: eur(portfolio!.spend12m) },
              { k: "share", label: b ? t("kpiShare", { a: a!.gas, b: b.gas }) : t("kpiShareOne"), value: b ? `${Math.round((a!.massKg / mass) * 100)} / ${Math.round((b.massKg / mass) * 100)}%` : `${a!.gas} 100%` },
            ].map((kpi) => (
              <div key={kpi.k} className="rounded-[14px] border border-slate-900/[.07] bg-white/60 px-3 py-2.5 dark:border-white/[.08] dark:bg-white/[.03]" data-hub-kpi={kpi.k}>
                <dt className="truncate text-[11px] text-slate-500 dark:text-ink-muted">{kpi.label}</dt>
                <dd className="m-0 mt-0.5 text-[15px] font-semibold tracking-[-.02em] tabular-nums">{kpi.value}</dd>
              </div>
            ))}
          </dl>

        </>
      )}

    </div>
  );
}
