"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, FileArchive, Search, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PILL, PILL_ON, SURFACE } from "@/components/home/ui";
import { normalizeMark } from "@/lib/gasMarks";
import { matchesFilter, matchesQuery, SDS_ARCHIVE_HREF, SDS_FILTERS, sortRows, type SdsFilter, type SdsRow } from "@/lib/sdsLibrary";
import type { EmergencyLines, EmergencySource } from "@/lib/emergencyContacts";
import type { FgasSummary } from "@/lib/fgas";
import SdsDirectoryRow from "./SdsDirectoryRow";
import TransportMatrix from "./TransportMatrix";
import ComplianceCard from "./ComplianceCard";

// Deferred: the chat client and markdown renderer load only when a
// consultant is opened — nothing on this page calls a model until then.
const SdsAssistantModal = dynamic(() => import("@/components/SdsAssistantModal"), { ssr: false });

/**
 * /compliance/sds in the Cart / Categories / Profile language: the
 * single-row header bar, one row of search + filter pills, then 8 + 4 —
 * the divided SDS directory (or the ADR / F-Gas matrix) beside the sticky
 * emergency + F-Gas card. Search, filters and the ADR drawers run over the
 * rows the server rendered; 0 model calls.
 */

export interface SdsComplianceProps {
  rows: SdsRow[];
  purchased: string[];
  signedIn: boolean;
  fgas: FgasSummary | null;
  ytd: { year: number; massKg: number; co2eTonnes: number } | null;
  lines: EmergencyLines;
  detected: { code: string; source: EmergencySource } | null;
  /** Where "request SDS" writes to (lib/seller); null hides the button. */
  requestEmail: string | null;
  countryNames: Record<string, string>;
}

export default function SdsCompliance({ rows, purchased, signedIn, fgas, ytd, lines, detected, requestEmail, countryNames }: SdsComplianceProps) {
  const t = useTranslations("SdsLibrary");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SdsFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [assistantFor, setAssistantFor] = useState<SdsRow | null>(null);
  const bought = useMemo(() => new Set(purchased.map(normalizeMark)), [purchased]);

  const visible = useMemo(() => sortRows(rows, bought).filter((r) => matchesFilter(r, filter, bought) && matchesQuery(r, query)), [rows, bought, filter, query]);
  const sheets = rows.filter((r) => r.doc.status !== "none").length;

  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
        <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_66%)] opacity-[.12] blur-[120px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-sds-page>
        {/* ── Header bar (cart layout) ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-sds-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-sds-meta>
              {/* A non-breaking hyphen keeps "AHRI-700" (and "F-Gas") whole when the line wraps. */}
              {t("meta").replace(/(AHRI|F)-(700|Gas)/g, "$1\u2011$2")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            <a href={SDS_ARCHIVE_HREF} download className={PILL} data-sds-action="zip">
              <FileArchive size={14} strokeWidth={2.2} />
              {t("actionZip")}
            </a>
            <Link href="/profile?tab=fgas" className={PILL} data-sds-action="cert">
              {t("actionCert")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
            <Link href="/products" className={PILL} data-sds-action="catalog">
              {t("actionCatalog")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        {/* ── Search + filter pills: one row from lg up; the pills scroll sideways below that ── */}
        <div className="mb-6 flex flex-wrap items-center gap-2 lg:flex-nowrap" data-sds-filterbar>
          <label className="flex h-[38px] min-w-0 flex-1 basis-full items-center gap-2 rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 focus-within:border-blue-600/50 lg:w-[240px] lg:flex-none lg:basis-auto dark:border-white/[.14] dark:bg-white/[.04] dark:focus-within:border-blue-400/50">
            <Search size={15} strokeWidth={2.2} className="flex-none text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              data-sds-search
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("searchClear")} className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/[.06] dark:hover:bg-white/10">
                <X size={13} strokeWidth={2.2} />
              </button>
            )}
          </label>
          <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("filtersLabel")}>
            {SDS_FILTERS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`${filter === f ? PILL_ON : PILL} flex-none whitespace-nowrap !px-3 !text-[12.5px]`} data-sds-filter={f}>
                {t(`filter_${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8" data-sds-main={filter}>
            {filter === "adr" ? (
              <TransportMatrix rows={visible} purchased={bought} />
            ) : (
              <section className={SURFACE} data-sds-directory>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
                  <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("directoryTitle")}</h2>
                  <span className="text-[12.5px] text-slate-500 tabular-nums dark:text-ink-muted" data-sds-count={String(visible.length)}>
                    {t("directoryMeta", { gases: visible.length, sheets })}
                  </span>
                </div>
                {visible.length === 0 ? (
                  <p className="m-0 px-5 py-12 text-center text-[13px] text-slate-500 dark:text-ink-muted" data-sds-empty>
                    {filter === "purchased" && !signedIn ? t("emptyPurchasedSignedOut") : filter === "purchased" ? t("emptyPurchased") : t("empty", { query })}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
                    {visible.map((r) => (
                      <SdsDirectoryRow
                        key={r.key}
                        row={r}
                        purchased={bought.has(normalizeMark(r.key))}
                        open={open === r.key}
                        onToggle={() => setOpen((cur) => (cur === r.key ? null : r.key))}
                        onConsult={() => setAssistantFor(r)}
                        requestEmail={requestEmail}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            <p className="m-0 mt-3 px-1 text-[12px] leading-[1.55] text-slate-500 dark:text-ink-muted">{t("footnote")}</p>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-sds-aside>
            <ComplianceCard lines={lines} detected={detected} signedIn={signedIn} fgas={fgas} ytd={ytd} countryNames={countryNames} />
          </aside>
        </div>
      </main>

      {/* Keyed by gas so switching refrigerants starts a fresh conversation. */}
      {assistantFor && (
        <SdsAssistantModal key={assistantFor.key} open gas={assistantFor.label} pdfHref={assistantFor.doc.href} onClose={() => setAssistantFor(null)} />
      )}
    </div>
  );
}
