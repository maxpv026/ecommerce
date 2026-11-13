"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Calculator, Download, FileSpreadsheet, Leaf, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, PILL, SURFACE, safetyTone } from "@/components/home/ui";
import type { ComplianceDashboardData, SummaryPeriod } from "@/lib/compliance";
import { SERVICE_BAN_GWP as HIGH_GWP_THRESHOLD } from "@/lib/regulation";
import { complianceInsight, SHIFT_SHARE } from "@/lib/complianceInsight";
import LeakCheckCalculator from "./LeakCheckCalculator";
import PurchaseLedger from "./PurchaseLedger";

/**
 * /profile/compliance — the buyer's CO₂e record, in the Cart / Profile
 * language: the single-row header bar with the period switch and both exports
 * on it, a 4-card KPI strip, the breakdown by refrigerant with a deterministic
 * note beside the Art. 5 leak-check calculator, then the purchase ledger.
 * Every figure comes from lib/compliance (the same rows the PDF, the CSV and
 * /profile?tab=fgas use); 0 model calls.
 */

/** Colour follows the gas, never its rank (validated palette, light + dark). Others fold into slate. */
export const GAS_SWATCH: Record<string, string> = {
  "R-134a": "bg-[#1d4ed8] dark:bg-[#3b82f6]",
  "R-32": "bg-[#059669]",
  "R-410A": "bg-[#d97706]",
  "R-404A": "bg-[#db2777] dark:bg-[#ec4899]",
  "R-407C": "bg-[#0891b2]",
};
export const OTHER_SWATCH = "bg-slate-400 dark:bg-slate-500";
const swatch = (gas: string) => GAS_SWATCH[gas] ?? OTHER_SWATCH;

const KPI = "rounded-[22px] border border-slate-900/[.08] bg-white/75 p-5 backdrop-blur-xl dark:border-white/[.08] dark:bg-white/[.03]";
const KPI_LABEL = "m-0 text-[12.5px] font-semibold text-slate-500 dark:text-ink-muted";
const KPI_VALUE = "m-0 mt-2 text-[26px] font-semibold leading-none tracking-[-.035em] tabular-nums";
const PRIMARY_PILL = "inline-flex min-h-[38px] items-center gap-2 rounded-full bg-blue-700 px-4 text-[13px] font-semibold tracking-[-.01em] text-white transition-colors hover:bg-blue-800";

export default function ComplianceHub({ data, period }: { data: ComplianceDashboardData | null; period: SummaryPeriod }) {
  const t = useTranslations("Compliance");
  const format = useFormatter();
  const n = (v: number, dp = 2) => format.number(v, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const int = (v: number) => format.number(v, { maximumFractionDigits: 0 });
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" });

  const summary = data?.summary ?? null;
  const totals = summary ? (period === "all" ? summary.allTime : summary.yearToDate) : null;
  const ledger = summary?.ledger ?? [];
  const rows = summary?.byRefrigerant ?? [];
  const periodText = period === "all" ? t("periodAll") : t("periodYtd");
  const avgGwp = totals && totals.massKg > 0 ? totals.co2eKg / totals.massKg : null;
  const high = summary?.highGwp ?? null;
  const fgas = data?.fgas ?? null;
  const cyl = data?.cylinders ?? null;
  const insight = complianceInsight(rows);
  const safetyOf = new Map(ledger.filter((l) => l.safety).map((l) => [l.refrigerant, l.safety!]));
  const pct = (share: number) => `${n(share * 100, 1)} %`;

  // Bar: the five named gases as their own segments, the rest folded into one.
  const named = rows.filter((r) => GAS_SWATCH[r.refrigerant]);
  const otherShare = rows.filter((r) => !GAS_SWATCH[r.refrigerant]).reduce((s, r) => s + r.share, 0);

  const certLine = !fgas || fgas.status === "NONE"
    ? { ok: false, text: t("kpiCertNone") }
    : fgas.status === "VERIFIED"
      ? { ok: true, text: fgas.expiresAt ? t("kpiCertValid", { date: day(fgas.expiresAt) }) : t("kpiCertVerified") }
      : fgas.status === "EXPIRED"
        ? { ok: false, text: t("kpiCertExpired", { date: fgas.expiresAt ? day(fgas.expiresAt) : "—" }) }
        : fgas.status === "PENDING_REVIEW"
          ? { ok: false, text: t("kpiCertPending") }
          : { ok: false, text: t("kpiCertRejected") };

  const periodTab = (id: SummaryPeriod, label: string) => (
    <Link
      key={id}
      href={{ pathname: "/profile/compliance", query: id === "ytd" ? {} : { period: id } }}
      aria-current={period === id ? "page" : undefined}
      data-period={id}
      className={`inline-flex h-[30px] items-center rounded-full px-3 text-[12.5px] font-semibold transition-colors ${
        period === id ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="relative overflow-x-clip">
      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-compliance-page={period}>
        {/* ── Header bar (cart layout): title left; period, exports and the way back on the same row ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-compliance-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("pageTitle").replace(/F-Gas/g, "F\u2011Gas") /* keep "F-Gas" whole when the title wraps */}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted">{t("pageSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            <Link href="/profile?tab=fgas" className={PILL} data-compliance-action="back">
              <ArrowLeft size={14} strokeWidth={2.2} />
              {t("backToProfile")}
            </Link>
            <div role="group" aria-label={t("periodLabel")} className="inline-flex h-[38px] items-center gap-0.5 rounded-full border border-slate-900/[.12] bg-white/70 p-[3px] dark:border-white/[.14] dark:bg-white/[.04]" data-compliance-period>
              {periodTab("ytd", t("tabYtd"))}
              {periodTab("all", t("tabAll"))}
            </div>
            {/* Plain anchors: /api is not locale-prefixed, and a download must not go through the client router. */}
            <a href={`/api/compliance/ledger?period=${period}`} download className={PILL} data-compliance-action="csv">
              <FileSpreadsheet size={14} strokeWidth={2.2} />
              {t("exportCsv")}
            </a>
            {ledger.length > 0 && (
              <a href={`/api/compliance/report?period=${period}`} download className={PRIMARY_PILL} data-compliance-action="pdf">
                <Download size={14} strokeWidth={2.2} />
                {t("exportPdf")}
              </a>
            )}
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-compliance-kpis>
          <div className={KPI} data-kpi="co2e">
            <p className={KPI_LABEL}>{t("kpiCo2e")}</p>
            <p className={`${KPI_VALUE} text-blue-700 dark:text-blue-400`}>{t("kpiTonnes", { value: n((totals?.co2eKg ?? 0) / 1000, 2) }) /* from kg: co2eTonnes is already rounded to 3 dp, and rounding twice reads 102.8746 as 102,88 */}</p>
            <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("kpiCo2eHint", { orders: totals?.orderCount ?? 0, lines: ledger.length })}</p>
          </div>
          <div className={KPI} data-kpi="mass">
            <p className={KPI_LABEL}>{t("kpiMass")}</p>
            <p className={KPI_VALUE}>{t("kpiKg", { value: n(totals?.massKg ?? 0, 2) })}</p>
            <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-ink-muted">{avgGwp !== null ? t("kpiMassHint", { gwp: int(avgGwp) }) : "—"}</p>
          </div>
          <div className={KPI} data-kpi="art13">
            <p className={KPI_LABEL}>{t("kpiArt13", { threshold: int(HIGH_GWP_THRESHOLD) })}</p>
            <p className={`${KPI_VALUE} ${high && high.share > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{pct(high?.share ?? 0)}</p>
            <p className={`m-0 mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold ${high && high.share > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {high && high.share > 0 ? <ShieldAlert size={13} strokeWidth={2.3} /> : <ShieldCheck size={13} strokeWidth={2.3} />}
              {high && high.share > 0 ? t("kpiArt13Exposed", { tonnes: n(high.co2eTonnes, 2), refrigerants: high.refrigerants.join(", ") }) : t("kpiArt13Clear")}
            </p>
          </div>
          <div className={KPI} data-kpi="cert">
            <p className={KPI_LABEL}>{t("kpiCert")}</p>
            <p className={`${KPI_VALUE} truncate !text-[19px] !leading-[26px] font-mono`} title={fgas?.certificateNumber ?? undefined}>
              {fgas?.certificateNumber ?? "—"}
            </p>
            <p className={`m-0 mt-1.5 text-[12.5px] font-semibold ${certLine.ok ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-ink-muted"}`} data-kpi-cert-status={fgas?.status ?? "NONE"}>
              {certLine.text}
            </p>
            <Link href="/profile?tab=cylinders" className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-blue-700 hover:underline dark:text-ink-muted dark:hover:text-blue-400" data-kpi-cylinders>
              {cyl && cyl.inPossession > 0 ? t("kpiCylinders", { count: cyl.inPossession, amount: format.number(cyl.depositHeldEur, { style: "currency", currency: "EUR" }) }) : t("kpiCylindersNone")}
              <ArrowRight size={12} strokeWidth={2.4} />
            </Link>
          </div>
        </div>

        {/* ── Breakdown + note | Art. 5 calculator ── */}
        <div className="mb-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <section className={`${SURFACE} lg:col-span-7`} data-compliance-breakdown>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
              <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("breakdownHeading")}</h2>
              <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{t("breakdownMeta", { period: periodText })}</span>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[12px] border border-slate-900/[.08] bg-slate-50 text-slate-400 dark:border-white/[.1] dark:bg-white/[.05]">
                  <Leaf size={18} strokeWidth={1.8} />
                </span>
                <p className="mx-auto mt-3 max-w-[44ch] text-[13px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-compliance-empty>
                  {t("breakdownEmpty", { period: periodText })}
                </p>
                <Link href="/products" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                  {t("emptyCta")}
                  <ArrowRight size={13} strokeWidth={2.4} />
                </Link>
              </div>
            ) : (
              <>
                {/* Proportion bar: 2px surface gaps between segments; identity is also in the rows below. */}
                <div className="px-5 pt-4">
                  <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={rows.map((r) => `${r.refrigerant} ${pct(r.share)}`).join(", ")} data-compliance-bar>
                    {named.map((r) => (
                      <span key={r.refrigerant} className={`h-full ${swatch(r.refrigerant)}`} style={{ width: `${r.share * 100}%`, minWidth: r.share > 0 ? 3 : 0 }} title={`${r.refrigerant} · ${pct(r.share)}`} data-bar-gas={r.refrigerant} />
                    ))}
                    {otherShare > 0 && <span className={`h-full ${OTHER_SWATCH}`} style={{ width: `${otherShare * 100}%`, minWidth: 3 }} title={`${t("othersLabel")} · ${pct(otherShare)}`} data-bar-gas="other" />}
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[540px] border-collapse text-[13px] tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-900/[.06] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-500 dark:border-white/[.06] dark:text-ink-muted">
                        <th className="px-5 py-2 text-left font-semibold">{t("colRefrigerant")}</th>
                        <th className="px-2 py-2 text-left font-semibold">{t("colSafety")}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t("colGwp")}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t("colMass")}</th>
                        <th className="px-2 py-2 text-right font-semibold normal-case">{t("unitTonnesCo2e")}</th>
                        <th className="px-5 py-2 text-right font-semibold">{t("colShare")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
                      {rows.map((r) => (
                        <tr key={r.refrigerant} data-breakdown-row={r.refrigerant}>
                          <td className="px-5 py-2.5">
                            <span className="flex items-center gap-2">
                              <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-[3px] ${swatch(r.refrigerant)}`} />
                              <span className="font-semibold">{r.refrigerant}</span>
                              {r.highGwp && (
                                <span title={t("art13BadgeTitle", { threshold: int(HIGH_GWP_THRESHOLD) })}>
                                  <MicroBadge tone="warn">{t("art13Badge")}</MicroBadge>
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">{safetyOf.get(r.refrigerant) ? <MicroBadge tone={safetyTone(safetyOf.get(r.refrigerant))}>{safetyOf.get(r.refrigerant)}</MicroBadge> : "—"}</td>
                          <td className="px-2 py-2.5 text-right text-slate-600 dark:text-slate-300">{r.avgGwp === null ? "—" : int(r.avgGwp)}</td>
                          <td className="px-2 py-2.5 text-right">{n(r.massKg)}</td>
                          <td className="px-2 py-2.5 text-right font-semibold">{n(r.co2eTonnes, 3)}</td>
                          <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-300">{pct(r.share)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Deterministic note */}
                {insight && (
                  <div className="m-5 rounded-[16px] border border-slate-900/[.08] bg-slate-50/80 p-4 dark:border-white/[.08] dark:bg-white/[.03]" data-compliance-insight>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="m-0 flex items-center gap-1.5 text-[13.5px] font-semibold">
                        <Calculator size={14} strokeWidth={2.2} className="text-blue-700 dark:text-blue-400" />
                        {t("insightTitle")}
                      </h3>
                      <span className="text-[11.5px] text-slate-500 dark:text-ink-muted">{t("insightDeterministic")}</span>
                    </div>
                    <p className="m-0 mt-2 text-[13px] leading-[1.55]" data-insight="top">
                      {t("insightTop", { share: pct(insight.top.share), gas: insight.top.gas, gwp: insight.top.gwp === null ? "—" : int(insight.top.gwp) })}
                    </p>
                    {insight.shift ? (
                      <p className="m-0 mt-1.5 text-[13px] leading-[1.55]" data-insight="shift">
                        {t("insightShift", {
                          part: `${int(SHIFT_SHARE * 100)} %`,
                          alt: insight.shift.alt,
                          altGwp: int(insight.shift.altGwp),
                          savedPart: n(insight.shift.savedPartT, 2),
                          savedAll: n(insight.shift.savedAllT, 2),
                        })}
                      </p>
                    ) : (
                      <p className="m-0 mt-1.5 text-[13px] leading-[1.55]" data-insight="noalt">
                        {t("insightNoAlt", { gas: insight.top.gas })}
                      </p>
                    )}
                    {high && high.share > 0 && (
                      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-amber-800 dark:text-amber-300" data-insight="art13">
                        {t("insightArt13", { share: pct(high.share), threshold: int(HIGH_GWP_THRESHOLD) })}
                      </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11.5px] text-slate-500 dark:text-ink-muted">{t("insightCaveat")}</span>
                      <Link href="/hub?tab=compare" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-insight-compare>
                        {t("insightCompare")}
                        <ArrowRight size={13} strokeWidth={2.4} />
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <div className="min-w-0 lg:col-span-5">
            <LeakCheckCalculator />
          </div>
        </div>

        {/* ── Purchase ledger ── */}
        <PurchaseLedger lines={ledger} period={period} totalTonnes={totals?.co2eTonnes ?? 0} record={summary?.record ?? null} />

        <p className="m-0 mt-4 flex items-start gap-2 px-1 text-[12px] leading-[1.55] text-slate-500 dark:text-ink-muted">
          <ShieldAlert size={13} className="mt-[2px] flex-none" strokeWidth={2} />
          {t("scopeNote")}
        </p>
      </main>
    </div>
  );
}
