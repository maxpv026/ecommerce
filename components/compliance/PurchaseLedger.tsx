"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Download, FileSpreadsheet, FileText, Search, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, PILL, PILL_ON, SURFACE, safetyTone } from "@/components/home/ui";
import type { ComplianceSummary, LedgerLine, SummaryPeriod } from "@/lib/compliance";

/**
 * The purchase log in the cart's surface: gas filter pills with counts, a
 * search by order number, and rows that link to the order, the product and
 * the invoice PDF. The footer reconciles with the KPI strip when nothing is
 * filtered (same lines, same period); filtered, it says so.
 */

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-slate-500 dark:text-ink-muted";

export default function PurchaseLedger({ lines, period, totalTonnes, record }: { lines: LedgerLine[]; period: SummaryPeriod; totalTonnes: number; record: ComplianceSummary["record"] | null }) {
  const t = useTranslations("Compliance");
  const format = useFormatter();
  const [gas, setGas] = useState<string>("all");
  const [query, setQuery] = useState("");
  const n = (v: number, dp = 2) => format.number(v, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const int = (v: number) => format.number(v, { maximumFractionDigits: 0 });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.refrigerant, (m.get(l.refrigerant) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lines]);
  const q = query.trim().toUpperCase();
  const shown = lines.filter((l) => (gas === "all" || l.refrigerant === gas) && (!q || l.orderNumber.toUpperCase().includes(q)));
  const filtered = gas !== "all" || q !== "";
  const sumKg = shown.reduce((s, l) => s + l.massKg, 0);
  // Unfiltered, the headline total (the same figure the KPI card shows); filtered, the sum of what is listed.
  const sumT = filtered ? shown.reduce((s, l) => s + l.co2eTonnes, 0) : totalTonnes;

  return (
    <section className={SURFACE} data-compliance-ledger>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("ledgerHeading")}</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("ledgerHeading")}>
            <button type="button" role="tab" aria-selected={gas === "all"} onClick={() => setGas("all")} className={`${gas === "all" ? PILL_ON : PILL} !min-h-[32px] flex-none !px-3 !text-[12.5px]`} data-ledger-filter="all">
              {t("ledgerAll", { count: lines.length })}
            </button>
            {counts.map(([g, c]) => (
              <button key={g} type="button" role="tab" aria-selected={gas === g} onClick={() => setGas(g)} className={`${gas === g ? PILL_ON : PILL} !min-h-[32px] flex-none !px-3 !text-[12.5px]`} data-ledger-filter={g}>
                {g} ({c})
              </button>
            ))}
          </div>
          <label className="flex h-8 w-full items-center gap-1.5 rounded-full border border-slate-900/[.12] bg-white/70 px-3 focus-within:border-blue-600/50 sm:w-[200px] dark:border-white/[.14] dark:bg-white/[.04]">
            <Search size={13} strokeWidth={2.2} className="flex-none text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ledgerSearch")}
              aria-label={t("ledgerSearch")}
              data-ledger-search
              className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("ledgerClear")} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </label>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="m-0 px-5 py-10 text-center text-[13px] text-slate-500 dark:text-ink-muted" data-ledger-empty>
          {t("ledgerEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px] tabular-nums">
            <thead className="border-b border-slate-900/[.06] dark:border-white/[.06]">
              <tr>
                <th className={`${TH} pl-5`}>{t("colDate")}</th>
                <th className={TH}>{t("colOrder")}</th>
                <th className={TH}>{t("colProduct")}</th>
                <th className={`${TH} text-right`}>{t("colQty")}</th>
                <th className={`${TH} text-right`}>{t("colNetKg")}</th>
                <th className={`${TH} text-right`}>{t("colGwp")}</th>
                <th className={`${TH} text-right normal-case`}>{t("unitTonnesCo2e")}</th>
                <th className={`${TH} pr-5 text-right`}>{t("colInvoice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500 dark:text-ink-muted" data-ledger-nomatch>
                    {t("ledgerNoMatch")}
                  </td>
                </tr>
              ) : (
                shown.map((l, i) => (
                  <tr key={`${l.orderId}-${l.sku}-${i}`} className="hover:bg-slate-900/[.02] dark:hover:bg-white/[.02]" data-ledger-line={l.refrigerant}>
                    <td className="whitespace-nowrap py-2.5 pl-5 pr-3 text-slate-600 dark:text-slate-300">{format.dateTime(new Date(l.date), { dateStyle: "medium", timeZone: "UTC" })}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/profile/orders/${l.orderId}`} className="inline-flex h-7 items-center rounded-full border border-slate-900/[.12] px-2.5 font-mono text-[11.5px] font-semibold text-slate-700 hover:border-blue-600/40 hover:text-blue-700 dark:border-white/[.14] dark:text-slate-200 dark:hover:text-blue-400" data-ledger-order={l.orderNumber}>
                        {l.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {l.productId ? (
                          <Link href={`/products/${l.productId}`} className="font-semibold hover:text-blue-700 hover:underline dark:hover:text-blue-400" data-ledger-product>
                            {l.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{l.name}</span>
                        )}
                        {l.safety && <MicroBadge tone={safetyTone(l.safety)}>{l.safety}</MicroBadge>}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-400">{l.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{int(l.quantity)}</td>
                    <td className="px-3 py-2.5 text-right" title={t("ledgerUnitMass", { kg: n(l.unitMassKg) })}>
                      {n(l.massKg)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {l.gwp === null ? "—" : int(l.gwp)}
                      {l.estimated && <sup title={t("ledgerEstimatedTitle")}>*</sup>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{l.gwp === null ? <span className="text-[11.5px] font-medium text-amber-700 dark:text-amber-400">{t("ledgerNotCosted")}</span> : n(l.co2eTonnes, 3)}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right">
                      {l.invoiceId ? (
                        <a href={`/api/invoices/${l.invoiceId}/download`} download className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-ledger-invoice={l.orderNumber}>
                          <FileText size={13} strokeWidth={2.2} />
                          {t("ledgerInvoice")}
                        </a>
                      ) : (
                        <span className="text-[12px] text-slate-400" title={t("ledgerNoInvoice")}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-900/[.1] bg-slate-50/70 font-semibold dark:border-white/[.1] dark:bg-white/[.02]">
                <td className="py-3 pl-5 pr-3" colSpan={4}>
                  {filtered ? t("ledgerFilteredTotal") : t("ledgerTotal")}
                </td>
                <td className="px-3 py-3 text-right" data-ledger-total-kg>
                  {n(sumKg)}
                </td>
                <td />
                <td className="px-3 py-3 text-right" data-ledger-total-t>
                  {n(sumT, 3)}
                </td>
                <td className="pr-5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
        <p className="m-0 max-w-[80ch] text-[11.5px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-ledger-record>
          {t("ledgerFormula")}
          {lines.some((l) => l.estimated) && <> {t("ledgerEstimatedNote")}</>}{" "}
          {record && !record.complete
            ? t("recordIncomplete", { unknown: record.unknownGwpLines, total: record.lines })
            : record && record.estimatedLines > 0
              ? t("recordCompleteReconstructed", { count: record.lines, estimated: record.estimatedLines })
              : record && record.lines > 0
                ? t("recordComplete", { count: record.lines })
                : null}
        </p>
        <div className="flex flex-none items-center gap-2">
          <a href={`/api/compliance/ledger?period=${period}`} download className={`${PILL} !min-h-[34px] !text-[12.5px]`} data-ledger-export="csv">
            <FileSpreadsheet size={13} strokeWidth={2.2} />
            {t("exportCsv")}
          </a>
          {lines.length > 0 && (
            <a href={`/api/compliance/report?period=${period}`} download className={`${PILL} !min-h-[34px] !text-[12.5px]`} data-ledger-export="pdf">
              <Download size={13} strokeWidth={2.2} />
              {t("exportPdfShort")}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
