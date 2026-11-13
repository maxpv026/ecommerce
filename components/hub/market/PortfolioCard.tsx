"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EYEBROW, PRIMARY, SUMMARY_CARD, TrustChips } from "@/components/home/ui";
import { HFC_QUOTA } from "@/lib/regulation";
import type { HubPortfolio } from "@/lib/hubData";
import type { PricePoint } from "@/lib/priceHistory";
import { gasColor, gasSlot, labelMark } from "./shared";

/**
 * The right card on the exchange and digest tabs: what this buyer has been
 * supplied (from the same ledger as the F-Gas logbook), its CO₂e, 12-month
 * spend, and a brief built by rules from those figures — the regulation that
 * touches each gas they hold (lib/regulation), the Annex VII quota step, and
 * their gases' recorded price movement. No model, no invented outlook.
 */
export default function PortfolioCard({
  portfolio,
  signedIn,
  history,
  onCompare,
  onNeedSignIn,
}: {
  portfolio: HubPortfolio | null;
  signedIn: boolean;
  history: Record<string, PricePoint[]>;
  onCompare: () => void;
  onNeedSignIn: () => void;
}) {
  const t = useTranslations("MarketHub");
  const format = useFormatter();
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const n2 = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const gases = [...(portfolio?.gases ?? [])].filter((g) => g.massKg > 0).sort((a, b) => gasSlot(a.gas) - gasSlot(b.gas));
  const mass = gases.reduce((s, g) => s + g.massKg, 0);
  const byMass = [...gases].sort((a, b) => b.massKg - a.massKg);
  const [a, b] = byMass;

  // ── The brief: at most three lines, each from a rule ──
  const brief: string[] = [];
  if (portfolio && byMass.length > 0) {
    const top = [...gases].sort((x, y) => y.co2eTonnes - x.co2eTonnes)[0]!;
    const share = portfolio.co2eTonnes > 0 ? Math.round((top.co2eTonnes / portfolio.co2eTonnes) * 100) : 0;
    if (share > 0) brief.push(t("brief_top", { gas: top.gas, share }));
    const banned = gases.find((g) => (g.gwp ?? 0) >= 2500);
    const restricted = gases.find((g) => (g.gwp ?? 0) >= 750 && (g.gwp ?? 0) < 2500);
    if (banned) brief.push(t("brief_2500", { gas: banned.gas, gwp: banned.gwp ?? 0 }));
    else if (restricted) brief.push(t("brief_750", { gas: restricted.gas, gwp: restricted.gwp ?? 0 }));
    const moved = gases
      .map((g) => ({ g, pts: history[labelMark(g.gas)] ?? [] }))
      .find(({ pts }) => pts.length >= 2 && pts[0]!.perKg !== pts[pts.length - 1]!.perKg);
    if (moved) {
      const first = moved.pts[0]!;
      const last = moved.pts[moved.pts.length - 1]!;
      const pct = ((last.perKg - first.perKg) / first.perKg) * 100;
      brief.push(t("brief_price", { gas: moved.g.gas, pct: `${pct > 0 ? "+" : ""}${n1(pct)}`, date: format.dateTime(new Date(`${first.day}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) }));
    } else if (gases.some((g) => (g.gwp ?? 0) >= 150)) {
      brief.push(t("brief_quota", { from: n1(HFC_QUOTA[0]!.tonnes / 1e6), to: n1(HFC_QUOTA[1]!.tonnes / 1e6) }));
    }
  }

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

          {brief.length > 0 && (
            <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0" data-hub-brief>
              {brief.map((line) => (
                <li key={line} className="flex gap-2 text-[12.5px] leading-[1.5] text-slate-700 dark:text-slate-300">
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-blue-600 dark:bg-blue-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/profile?tab=documents&docs=fgas"
            className="mt-4 flex items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 py-2.5 pl-3 pr-3.5 text-[11.5px] font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300"
            data-hub-compliance
          >
            <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
            <span>{t("complianceBox", { lines: portfolio!.lines })}</span>
          </Link>
        </>
      )}

      <button type="button" onClick={onCompare} className={`${PRIMARY} mt-4`} data-hub-cta-compare>
        {t("ctaCompare")}
        <ArrowRight size={16} strokeWidth={2.4} />
      </button>
      <div className="mt-4">
        <TrustChips />
      </div>
    </div>
  );
}
