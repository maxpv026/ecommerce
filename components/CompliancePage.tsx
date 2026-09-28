import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AIAuditCard from "./profile/analytics/AIAuditCard";
import UserSpendChart from "./profile/analytics/UserSpendChart";
import GWPFootprintChart from "./profile/analytics/GWPFootprintChart";
import { PanelSkeleton } from "./profile/analytics/primitives";
import { Download, FileWarning, Leaf, ShieldAlert } from "lucide-react";
import {
  HIGH_GWP_THRESHOLD,
  LEAK_CHECK_THRESHOLDS_TONNES,
  type ComplianceDashboardData,
  type SummaryPeriod,
} from "@/lib/compliance";

/**
 * /profile/compliance — the buyer's carbon record.
 *
 * A server component: the only interactions are links (the period switch is a
 * query param, the export is an href), so none of this needs to ship as
 * JavaScript. The period selector deliberately round-trips rather than
 * filtering client-side — the figures are recomputed from order rows, and
 * shipping the whole ledger to the browser to re-total it would be both
 * slower and a way for the two views to disagree.
 *
 * On what is NOT on this page: no "Compliant" badge. Quotas bind importers,
 * not buyers, and the leak-check thresholds are per installed system — see
 * lib/compliance.ts. The risk signal here is Art. 13 exposure, which is a
 * property of the gas purchased and therefore something we can actually
 * state; the quality signal is how much of our own record is complete.
 */

/**
 * Locale-aware formatters, built per render from `useLocale()`.
 *
 * These were module-level `Intl` objects pinned to "en-IE", which printed
 * "483.237" and "€900.00" to every reader — including the ones whose own
 * notation makes that "483,237" a number a thousand times larger.
 */
function formatters(locale: string) {
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const num = (v: number, dp = 2) =>
    v.toLocaleString(locale, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const plain = new Intl.NumberFormat(locale);
  return { eur, num, plain };
}

const CARD =
  "rounded-[20px] border border-slate-900/[.08] bg-white/70 p-5 dark:border-hairline dark:bg-glass";

function MetricCard({
  label,
  value,
  unit,
  hint,
  accent,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  accent?: boolean;
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={`rounded-[20px] border p-5 ${
        accent
          ? "border-blue-700/[.22] bg-blue-50/70 dark:border-blue-500/25 dark:bg-blue-600/[.12]"
          : "border-slate-900/[.08] bg-white/70 dark:border-hairline dark:bg-glass"
      }`}
    >
      {/* `uppercase` in CSS, not `.toUpperCase()` in JS. The label used to be
          uppercased in code, which is wrong once it is translated: JS casing
          is locale-blind, so Turkish "i" becomes "I" instead of "İ". The
          browser's text-transform respects the document language. */}
      <div className="text-[10.5px] uppercase tracking-[.09em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`text-[32px] font-semibold leading-none tracking-[-.045em] tabular-nums ${
            accent ? "text-blue-700 dark:text-blue-400" : tone === "warn" ? "text-amber-700 dark:text-amber-500" : ""
          }`}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{unit}</span>
        ) : null}
      </div>
      <div className="mt-2 text-[12px] leading-[1.5] text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  );
}

function PeriodSwitch({ period, labels }: { period: SummaryPeriod; labels: Record<SummaryPeriod, string> }) {
  const tab = (id: SummaryPeriod, label: string) => {
    const active = period === id;
    return (
      <Link
        key={id}
        href={{ pathname: "/profile/compliance", query: id === "ytd" ? {} : { period: id } }}
        aria-current={active ? "page" : undefined}
        className={`rounded-[11px] px-3.5 py-[7px] text-[12.5px] font-medium tracking-[-.01em] transition-colors ${
          active
            ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
            : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] border border-slate-900/[.08] p-1 dark:border-hairline">
      {tab("ytd", labels.ytd)}
      {tab("all", labels.all)}
    </div>
  );
}

export default function CompliancePage({
  data,
  period,
}: {
  data: ComplianceDashboardData | null;
  period: SummaryPeriod;
}) {
  const t = useTranslations("Compliance");
  const tAnalytics = useTranslations("Analytics");
  const { eur, num, plain } = formatters(useLocale());

  // Lowercase, for interpolation mid-sentence ("Shares of year to date CO2e").
  // The button labels are separate keys because several languages capitalise
  // a standalone control differently from the same words inside a clause.
  const periodLabel = period === "all" ? t("periodAll") : t("periodYtd");

  const empty = !data || data.summary.byRefrigerant.length === 0;
  const totals = period === "all" ? data?.summary.allTime : data?.summary.yearToDate;
  const record = data?.summary.record;
  const high = data?.summary.highGwp;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-14">
      <div className="mb-9">
        <div className="mb-3 text-xs uppercase tracking-[.09em] text-slate-500 dark:text-slate-400">
          {t("eyebrow")}
        </div>
        <h1 className="m-0 text-[38px] font-semibold leading-[1.05] tracking-[-.045em]">
          {t("title")}
        </h1>
        {/* The "CO2" here is the ₂ character rather than a <sub> element: a
            translation key carrying markup needs next-intl rich text and a
            per-locale chunk callback, for one glyph that Unicode already has. */}
        <p className="mt-3 max-w-[620px] text-[14.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">
          {t("subtitle")}
        </p>
      </div>

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <PeriodSwitch period={period} labels={{ ytd: t("tabYtd"), all: t("tabAll") }} />
        {data ? (
          <span className="text-[12px] text-slate-500 dark:text-slate-400">
            {t("summaryLine", {
              count: totals?.orderCount ?? 0,
              mass: num(totals?.massKg ?? 0),
            })}
          </span>
        ) : null}
      </div>

      {/* ── Metric cards ── */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          accent
          label={t("cardCo2eLabel", { period: periodLabel })}
          value={num(totals?.co2eTonnes ?? 0, 3)}
          unit={t("unitTonnesCo2e")}
          hint={t("cardCo2eHint", {
            kg: num(totals?.co2eKg ?? 0, 0),
            count: totals?.orderCount ?? 0,
          })}
        />
        <MetricCard
          label={t("cardCylindersLabel")}
          value={plain.format(data?.cylinders.inPossession ?? 0)}
          unit={t("cardCylindersUnit")}
          hint={
            data && data.cylinders.inPossession > 0
              ? t("cardCylindersHintHeld", {
                  amount: eur.format(data.cylinders.depositHeldEur),
                })
              : t("cardCylindersHintNone")
          }
        />
        <MetricCard
          tone={high && high.share > 0 ? "warn" : "neutral"}
          label={t("cardArt13Label", { threshold: plain.format(HIGH_GWP_THRESHOLD) })}
          value={num((high?.share ?? 0) * 100, 1)}
          unit="%"
          hint={
            high && high.share > 0
              ? t("cardArt13HintExposed", {
                  tonnes: num(high.co2eTonnes, 3),
                  refrigerants: high.refrigerants.join(", "),
                })
              : t("cardArt13HintClear")
          }
        />
      </div>

      {/* ── Analytics ──
          Each section fetches its own data and streams in its own boundary,
          so the figures above — already resolved by the time this component
          renders — are never held back by a chart query or by the model
          writing the summary. The fallbacks match the real heights, so
          nothing below them moves when they arrive.

          Above the detailed tables: the charts are the read-at-a-glance
          version of the same numbers, and the tables are where you go to
          check one. */}
      {empty ? null : (
        <div className="mb-8 flex flex-col gap-4">
          {/* No Suspense here any more: the summary is generated on demand
              from a button, so this component awaits nothing on render and a
              boundary around it could never suspend. The charts below still
              fetch on the server and keep theirs. */}
          <AIAuditCard />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Suspense
              fallback={
                <PanelSkeleton
                  height={240}
                  title={tAnalytics("spendTitle", { months: 12 })}
                />
              }
            >
              <UserSpendChart months={12} />
            </Suspense>
            <Suspense
              fallback={<PanelSkeleton height={200} title={tAnalytics("carbonTitle")} />}
            >
              <GWPFootprintChart />
            </Suspense>
          </div>
        </div>
      )}

      {empty ? (
        <div className={`${CARD} py-14 text-center`}>
          <span className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-[16px] border border-slate-900/[.08] bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/5">
            <Leaf size={20} strokeWidth={1.7} />
          </span>
          <p className="mx-auto mt-4 max-w-[42ch] text-[14px] leading-[1.6] text-slate-500 dark:text-slate-400">
            {t("emptyBody", { period: periodLabel })}
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-blue-800"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <>
          {/* ── Breakdown ── */}
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">
              {t("breakdownTitle")}
            </h2>
            <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
              {t("breakdownHint", { period: periodLabel })}
            </span>
          </div>

          <div className="overflow-hidden rounded-[20px] border border-slate-900/[.08] dark:border-hairline">
            {/* Three columns on a phone, five from sm. The hidden cells are
                display:none, so they claim no grid track and the remaining
                three land in the three mobile columns in DOM order. At 390px
                the five-column version squeezed "R-404A" down to "F". */}
            <div className="grid grid-cols-[1fr_.85fr_1fr] sm:grid-cols-[1.4fr_.8fr_.9fr_1fr_1.2fr] gap-3 border-b border-slate-900/[.08] px-5 py-3 text-[10px] uppercase tracking-[.09em] text-slate-500 dark:border-hairline dark:text-slate-400">
              <span>{t("colRefrigerant")}</span>
              <span className="hidden text-right sm:block">{t("colAvgGwp")}</span>
              <span className="text-right">{t("colMass")}</span>
              {/* Not uppercased by CSS the way the others are — "t CO₂e" is a
                  unit symbol, and "T CO₂E" is simply the wrong notation. */}
              <span className="text-right normal-case">{t("unitTonnesCo2e")}</span>
              <span className="hidden text-right sm:block">{t("colShare")}</span>
            </div>

            {data.summary.byRefrigerant.map((r) => (
              <div
                key={r.refrigerant}
                className="grid grid-cols-[1fr_.85fr_1fr] sm:grid-cols-[1.4fr_.8fr_.9fr_1fr_1.2fr] items-center gap-3 border-b border-slate-900/[.05] px-5 py-3.5 last:border-b-0 dark:border-white/[.05]"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-semibold tracking-[-.015em]">
                    {r.refrigerant}
                  </span>
                  {r.highGwp ? (
                    <span
                      title={t("art13BadgeTitle", { threshold: plain.format(HIGH_GWP_THRESHOLD) })}
                      className="flex-none rounded-full border border-amber-600/25 bg-amber-50 px-1.5 py-[1px] text-[9.5px] font-semibold tracking-[.04em] text-amber-700 dark:border-amber-500/25 dark:bg-amber-950/40 dark:text-amber-500"
                    >
                      ART.13
                    </span>
                  ) : null}
                </span>
                <span className="hidden text-right text-[13px] tabular-nums text-slate-500 sm:block dark:text-slate-400">
                  {r.avgGwp === null ? "—" : num(r.avgGwp, 0)}
                </span>
                <span className="text-right text-[13px] tabular-nums text-slate-600 dark:text-slate-300">
                  {num(r.massKg)}
                </span>
                <span className="text-right text-[13.5px] font-semibold tabular-nums">
                  {num(r.co2eTonnes, 3)}
                </span>
                <span className="hidden items-center justify-end gap-2.5 sm:flex">
                  {/* The bar is the quickest read on this page: which gas is
                      doing the damage, without parsing five decimal figures. */}
                  <span className="hidden h-[5px] w-[72px] overflow-hidden rounded-full bg-slate-900/[.07] sm:block dark:bg-white/10">
                    <span
                      className={`block h-full rounded-full ${r.highGwp ? "bg-amber-600 dark:bg-amber-500" : "bg-blue-700 dark:bg-blue-500"}`}
                      style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }}
                    />
                  </span>
                  <span className="w-[46px] text-right text-[13px] tabular-nums text-slate-500 dark:text-slate-400">
                    {num(r.share * 100, 1)}%
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* ── Record quality ── */}
          {record && !record.complete ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-[16px] border border-amber-600/20 bg-amber-50/70 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/25">
              <FileWarning
                size={15}
                className="mt-[2px] flex-none text-amber-700 dark:text-amber-500"
                strokeWidth={1.9}
              />
              <p className="m-0 text-[12.5px] leading-[1.55] text-amber-800 dark:text-amber-500/90">
                {t("recordIncomplete", { unknown: record.unknownGwpLines, total: record.lines })}
              </p>
            </div>
          ) : (
            /* Record quality is account-wide, not period-scoped — it describes
               our data, so the line count can exceed the rows in the table
               above when a shorter period is selected. Said explicitly, because
               "all 6 lines" beside a 4-row table otherwise looks like a bug. */
            <p className="mt-4 text-[12px] text-slate-500 dark:text-slate-400">
              {/* Two whole sentences rather than a stem plus a conditional
                  tail. The tail used to be concatenated in code, which hands a
                  translator a fragment starting with a comma and no way to
                  move it — and several languages need the clause elsewhere in
                  the sentence entirely. */}
              {record && record.estimatedLines > 0
                ? t("recordCompleteReconstructed", {
                    count: record.lines,
                    estimated: record.estimatedLines,
                  })
                : t("recordComplete", { count: record?.lines ?? 0 })}
            </p>
          )}

          {/* ── Action centre ── */}
          <div className="mt-8 flex flex-col gap-5 rounded-[20px] border border-slate-900/[.08] bg-white/70 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-hairline dark:bg-glass">
            <div className="max-w-[54ch]">
              <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">
                {t("exportTitle")}
              </h2>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-slate-500 dark:text-slate-400">
                {t("exportBody", {
                  thresholds: LEAK_CHECK_THRESHOLDS_TONNES.map((v) => plain.format(v)).join(" / "),
                })}
              </p>
            </div>
            {/* Plain anchor, not next/link: /api is not locale-prefixed, and a
                download must not be intercepted by the client router. */}
            <a
              href={`/api/compliance/report?period=${period}`}
              className="inline-flex min-h-[46px] flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[14px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(29,78,216,0.9)] transition-colors hover:bg-blue-800"
            >
              <Download size={16} strokeWidth={2} />
              {t("exportCta")}
            </a>
          </div>

          <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-[1.55] text-slate-400 dark:text-slate-500">
            <ShieldAlert size={13} className="mt-[2px] flex-none" strokeWidth={1.9} />
            {t("scopeNote")}
          </p>
        </>
      )}
    </div>
  );
}
