"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, BookOpen, Download, ExternalLink, FileSpreadsheet, FileText, Receipt, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ICON_TILE, MicroBadge, ROW_ACTION_GHOST, SURFACE, type BadgeTone } from "@/components/home/ui";
import type { UserProfileData } from "@/lib/data";
import type { DocumentCenter } from "@/lib/profileHub";
import type { LogbookSummary } from "./ProfileHub";
import { EmptyRow, GroupTitle, SurfaceHead } from "./parts";

/**
 * Every document the account has, in one place — all real: issued invoices
 * (PDF from /api/invoices/[id]/download), the F-Gas certificate on file (the
 * authenticated document route), the F-Gas ledger exports, and the SDS
 * library with the gases this buyer has ordered or saved first.
 */

export const DOC_FILTERS = ["all", "invoices", "fgas", "sds"] as const;
export type DocFilter = (typeof DOC_FILTERS)[number];

const PAY_TONE: Record<string, BadgeTone> = { PAID: "ok", PENDING: "warn", FAILED: "bad" };

/** How many documents the tab counts: invoices, the certificate file, SDS sheets. */
export const documentCount = (docs: DocumentCenter, hasCertificate: boolean) => docs.invoices.length + (hasCertificate ? 1 : 0) + docs.sds.length;

export default function DocumentsView({
  docs,
  profile,
  logbook,
  initialFilter = "all",
}: {
  docs: DocumentCenter;
  profile: UserProfileData;
  logbook: LogbookSummary | null;
  initialFilter?: DocFilter;
}) {
  const t = useTranslations("ProfileHub");
  const format = useFormatter();
  const [filter, setFilter] = useState<DocFilter>(initialFilter);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const day = (iso: string | null | undefined) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" }) : "—");
  const show = (f: DocFilter) => filter === "all" || filter === f;

  const fgas = profile.fgas;
  const verified = fgas?.status === "VERIFIED";
  const certHref = profile.certificateDocumentHref;
  const certNumber = fgas?.certificateNumber || profile.certificate?.certId || null;
  const counts: Record<DocFilter, number> = {
    all: documentCount(docs, Boolean(certHref)),
    invoices: docs.invoices.length,
    fgas: certHref ? 1 : 0,
    sds: docs.sds.length,
  };

  return (
    <div className={SURFACE} data-profile-documents>
      <SurfaceHead title={t("docsTitle")} meta={[t("docsMeta")]} id="documents" />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]" role="tablist" aria-label={t("docsTitle")} data-docs-filters>
        {DOC_FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f)}
              data-docs-filter={f}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
                on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.12] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-300 dark:hover:bg-white/[.06]"
              }`}
            >
              {t(`docsFilter_${f}`)}
              <span className={`text-[11px] tabular-nums ${on ? "text-white/70 dark:text-slate-500" : "text-slate-400"}`}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      {/* 1 · Invoices */}
      {show("invoices") && (
        <section data-docs-section="invoices">
          <GroupTitle>{t("docsInvoices")}</GroupTitle>
          {docs.invoices.length === 0 ? (
            <EmptyRow>{t("docsInvoicesEmpty")}</EmptyRow>
          ) : (
            docs.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-900/[.06] px-5 py-3.5 last:border-b-0 dark:border-white/[.06]" data-doc-invoice={inv.invoiceNumber}>
                <span className={ICON_TILE}>
                  <Receipt size={17} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13.5px] font-semibold">{inv.invoiceNumber}</span>
                    <MicroBadge tone={PAY_TONE[inv.paymentStatus] ?? "muted"}>{t(`pay_${inv.paymentStatus}`)}</MicroBadge>
                    {inv.orderStatus === "DELIVERED" && <MicroBadge tone="ok">{t("delivered")}</MicroBadge>}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-500 tabular-nums dark:text-ink-muted">
                    <span className="font-mono">{inv.orderNumber}</span> · {day(inv.issuedAt)} · {eur(inv.totalAmount)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:justify-end">
                  <a href={`/api/invoices/${inv.id}/download`} download className={ROW_ACTION_GHOST} data-doc-invoice-pdf>
                    <Download size={14} strokeWidth={2.2} />
                    {t("downloadPdf")}
                  </a>
                  <Link href={`/profile/orders/${inv.orderId}`} className={ROW_ACTION_GHOST} data-doc-order>
                    {t("openOrder")}
                    <ArrowRight size={14} strokeWidth={2.4} />
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* 2 · F-Gas certificate + audit log */}
      {show("fgas") && (
        <section data-docs-section="fgas">
          <GroupTitle>{t("docsFgas")}</GroupTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]" data-doc-certificate={certNumber ?? "none"}>
            <span className={ICON_TILE}>
              <ShieldCheck size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1 basis-[200px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold tracking-[-.02em]">{t("docsCertificate")}</span>
                {certNumber && <span className="font-mono text-[13px] font-semibold">{certNumber}</span>}
                <MicroBadge tone={verified ? "ok" : fgas?.status === "PENDING_REVIEW" ? "warn" : fgas?.status === "NONE" || !fgas ? "muted" : "bad"}>{t(`certStatus_${fgas?.status ?? "NONE"}`)}</MicroBadge>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                {[fgas?.holder || profile.companyName || profile.name, fgas?.category, fgas?.expiresAt ? t("validTo", { date: day(fgas.expiresAt) }) : null].filter(Boolean).join(" · ") || t("certNoDocument")}
              </div>
            </div>
            {certHref ? (
              <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:justify-end">
                <a href={certHref} target="_blank" rel="noopener noreferrer" className={ROW_ACTION_GHOST} data-doc-cert-view>
                  <ExternalLink size={14} strokeWidth={2.2} />
                  {t("viewDocument")}
                </a>
                <a href={`${certHref}${certHref.includes("?") ? "&" : "?"}download=1`} download className={ROW_ACTION_GHOST} data-doc-cert-download>
                  <Download size={14} strokeWidth={2.2} />
                  {t("downloadFile")}
                </a>
              </div>
            ) : (
              <Link href="/profile?tab=fgas" className={`${ROW_ACTION_GHOST} max-sm:ml-auto`}>
                {t("uploadInFgas")}
                <ArrowRight size={14} strokeWidth={2.4} />
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5" data-doc-auditlog>
            <span className={ICON_TILE}>
              <BookOpen size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1 basis-[200px]">
              <div className="text-[14px] font-semibold tracking-[-.02em]">{t("docsAuditLog")}</div>
              <div className="mt-0.5 text-[12px] text-slate-500 tabular-nums dark:text-ink-muted" data-doc-auditlog-totals>
                {t("auditLogTotals", {
                  year: logbook?.year ?? new Date().getUTCFullYear(),
                  kg: format.number(logbook?.massKg ?? 0, { maximumFractionDigits: 1 }),
                  t: format.number(logbook?.co2eTonnes ?? 0, { maximumFractionDigits: 2 }),
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:justify-end">
              <a href="/api/compliance/report?period=ytd" download className={ROW_ACTION_GHOST} data-doc-audit-pdf>
                <Download size={14} strokeWidth={2.2} />
                {t("exportPdf")}
              </a>
              <a href="/api/compliance/ledger" download className={ROW_ACTION_GHOST} data-doc-audit-csv>
                <FileSpreadsheet size={14} strokeWidth={2.2} />
                {t("exportCsv")}
              </a>
            </div>
          </div>
        </section>
      )}

      {/* 3 · SDS */}
      {show("sds") && (
        <section data-docs-section="sds">
          <GroupTitle>{t("docsSds")}</GroupTitle>
          {docs.sds.map((s) => (
            <div key={s.href} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]" data-doc-sds={s.gas}>
              <span className={ICON_TILE}>
                <FileText size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold tracking-[-.02em]">{s.gas}</span>
                  <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{s.name}</span>
                  {s.purchased && <MicroBadge tone="ok" data-doc-sds-bought="">{t("boughtByYou")}</MicroBadge>}
                  {!s.purchased && s.saved && <MicroBadge tone="info">{t("inFavourites")}</MicroBadge>}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">{s.version}</div>
              </div>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className={`${ROW_ACTION_GHOST} max-sm:ml-auto`} data-doc-sds-open>
                <ExternalLink size={14} strokeWidth={2.2} />
                {t("openSds")}
              </a>
            </div>
          ))}
          <div className="px-5 py-3">
            <Link href="/compliance/sds" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-doc-sds-library>
              {t("sdsLibraryLink")}
              <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
