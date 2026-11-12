import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { guardAdmin } from "@/lib/admin/guardAdmin";
import { ACCOUNTING_RANGES, getAccountingReport, parseRange } from "@/lib/admin/accounting";
import { can } from "@/lib/rbac";
import RevenueChart from "@/components/admin/analytics/RevenueChart";
import { ChartSkeleton } from "@/components/admin/analytics/primitives";

export const metadata: Metadata = { title: "Analytics & accounting — My Energy", robots: { index: false } };

/**
 * The accounting workspace — SUPER_ADMIN and ACCOUNTANT (analytics.view).
 * Read-only by construction: nothing on this page writes. Three pillars:
 * product turnover, the purchase & revenue ledger (with the CSV export),
 * and the customer base. Figures come from the orders' frozen purchase
 * snapshots, exactly as the invoices do (lib/admin/accounting).
 */

const SURFACE = "rounded-[22px] border border-slate-900/[.08] bg-white/80 dark:border-white/[.08] dark:bg-white/[.03]";

function Kpi({ label, value, note, testid }: { label: string; value: string; note?: string; testid?: string }) {
  return (
    <div className={`${SURFACE} px-4 py-3.5`} data-kpi={testid}>
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums tracking-[-.02em] text-slate-900 dark:text-white">{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{note}</div>}
    </div>
  );
}

function Section({ title, body, children, id }: { title: string; body: string; children: ReactNode; id: string }) {
  return (
    <section className="flex flex-col gap-3" data-section={id}>
      <div>
        <h2 className="m-0 text-[18px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">{title}</h2>
        <p className="m-0 mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{body}</p>
      </div>
      {children}
    </section>
  );
}

export default async function AdminAnalyticsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string }> }) {
  const admin = await guardAdmin(params, "analytics.view");
  const range = parseRange((await searchParams).days);
  const [report, t, format] = await Promise.all([getAccountingReport(range), getTranslations("AdminAnalytics"), getFormatter()]);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const num = (n: number, digits = 0) => format.number(n, { maximumFractionDigits: digits });
  const pct = (n: number) => format.number(n, { style: "percent", maximumFractionDigits: 1 });
  const { turnover, ledger, customers } = report;
  const rangeLabel = (r: number) => (r === 0 ? t("rangeAll") : t("rangeDays", { days: r }));

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-8" data-accounting>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-400">{t("eyebrow")}</p>
          <h1 className="m-0 mt-1.5 text-[32px] font-semibold leading-[1.1] tracking-[-.04em] text-slate-900 dark:text-white">{t("title")}</h1>
          <p className="m-0 mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">{t("subtitle", { period: rangeLabel(range) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-900/[.1] bg-white/70 p-0.5 dark:border-white/[.12] dark:bg-white/[.04]" data-range>
            {ACCOUNTING_RANGES.map((r) => (
              <Link
                key={r}
                href={{ pathname: "/admin/analytics", query: { days: String(r) } }}
                data-range-option={r}
                aria-current={r === range ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${r === range ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                {rangeLabel(r)}
              </Link>
            ))}
          </div>
          {can(admin.role, "finance.export") && (
            <a
              href={`/api/admin/finance/export?days=${range}`}
              data-export-csv
              className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-500"
            >
              <Download size={14} /> {t("exportCsv")}
            </a>
          )}
        </div>
      </header>

      {report.truncated && <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">{t("truncated")}</p>}

      <div className="flex flex-col gap-10">
        {/* 1 · Product turnover */}
        <Section id="turnover" title={t("turnoverTitle")} body={t("turnoverBody")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi testid="units" label={t("kpiUnits")} value={num(turnover.totals.units)} />
            <Kpi testid="netKg" label={t("kpiNetKg")} value={`${num(turnover.totals.netKg, 1)} kg`} note={t("co2e", { t: num(turnover.totals.co2eT, 2) })} />
            <Kpi testid="goods" label={t("kpiGoods")} value={eur(turnover.totals.revenue)} />
            <Kpi testid="depositsSold" label={t("kpiDeposits")} value={eur(turnover.totals.deposits)} />
            <Kpi testid="valuation" label={t("kpiValuation")} value={eur(turnover.inventory.valuation)} note={t("onHand", { units: num(turnover.inventory.units), skus: turnover.inventory.skus })} />
          </div>
          <div className={`${SURFACE} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse text-[13px]" data-turnover-table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">{t("colProduct")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("colUnits")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("colKg")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("colRevenue")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("colShare")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t("colDeposits")}</th>
                </tr>
              </thead>
              <tbody>
                {turnover.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">{t("empty")}</td>
                  </tr>
                )}
                {turnover.rows.map((r) => (
                  <tr key={r.sku} className="border-t border-slate-900/[.06] dark:border-white/[.06]" data-turnover-row={r.sku}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.sku} · {r.variant}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{num(r.units)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{num(r.netKg, 1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{eur(r.revenue)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-900/[.07] dark:bg-white/[.08]">
                          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
                        </span>
                        <span className="font-mono text-[11.5px] tabular-nums text-slate-500">{pct(r.share)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{eur(r.deposits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 2 · Purchase & revenue ledger */}
        <Section id="ledger" title={t("ledgerTitle")} body={t("ledgerBody")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi testid="gross" label={t("kpiGross")} value={eur(ledger.gross)} note={t("ordersCount", { count: ledger.orders })} />
            <Kpi testid="net" label={t("kpiNet")} value={eur(ledger.net)} />
            <Kpi testid="vat" label={t("kpiVat")} value={eur(ledger.vat)} />
            <Kpi testid="shipping" label={t("kpiShipping")} value={eur(ledger.shipping)} />
            <Kpi testid="deposits" label={t("kpiDepositsCollected")} value={eur(ledger.deposits)} />
            <Kpi testid="aov" label={t("kpiAov")} value={eur(ledger.aov)} />
            <Kpi testid="paid" label={t("kpiPaid")} value={eur(ledger.paid.amount)} note={t("ordersCount", { count: ledger.paid.count })} />
            <Kpi testid="unpaid" label={t("kpiUnpaid")} value={eur(ledger.unpaid.amount)} note={t("ordersCount", { count: ledger.unpaid.count })} />
          </div>
          <div className="flex flex-wrap gap-2" data-status-breakdown>
            {(["PENDING", "IN_TRANSIT", "DELIVERED"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-2 rounded-full border border-slate-900/[.08] bg-white/70 px-3 py-1 text-[12px] dark:border-white/[.1] dark:bg-white/[.04]">
                <span className="text-slate-500 dark:text-slate-400">{t(`status_${s}`)}</span>
                <span className="font-mono font-semibold tabular-nums">{ledger.byStatus[s]}</span>
              </span>
            ))}
          </div>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart days={range === 0 ? 365 : range} />
          </Suspense>
        </Section>

        {/* 3 · Customers */}
        <Section id="customers" title={t("customersTitle")} body={t("customersBody")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi testid="customers" label={t("kpiCustomers")} value={num(customers.customers)} />
            <Kpi testid="activeBuyers" label={t("kpiActive")} value={num(customers.activeBuyers)} />
            <Kpi testid="repeat" label={t("kpiRepeat")} value={pct(customers.repeatRate)} />
            <Kpi testid="verified" label={t("kpiVerified")} value={num(customers.verifiedCompanies)} />
          </div>
          <div className={`${SURFACE} overflow-x-auto`}>
            <table className="w-full min-w-[560px] border-collapse text-[13px]" data-top-buyers>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">{t("colBuyer")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("colOrders")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t("colKg")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t("colNetRevenue")}</th>
                </tr>
              </thead>
              <tbody>
                {customers.top.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t("empty")}</td>
                  </tr>
                )}
                {customers.top.map((b, i) => (
                  <tr key={i} className="border-t border-slate-900/[.06] dark:border-white/[.06]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-white">{b.company ?? b.name}</div>
                      {b.company && <div className="text-[11.5px] text-slate-500">{b.name}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{num(b.orders)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{num(b.netKg, 1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{eur(b.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
