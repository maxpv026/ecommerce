"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, ChevronLeft, Download, Eye, FileText, Info, Search, ShieldCheck } from "lucide-react";
import { EPA_CERT, SDS_DOCS } from "@/lib/mobileDocs";

type DocsTab = "certs" | "sds";

interface MobileDocsLayoutProps {
  initialTab?: DocsTab;
}

export default function MobileDocsLayout({ initialTab = "certs" }: MobileDocsLayoutProps) {
  const [tab, setTab] = useState<DocsTab>(initialTab);
  const [downloadedIds, setDownloadedIds] = useState<number[]>([]);
  const [certDownloaded, setCertDownloaded] = useState(false);
  const isCerts = tab === "certs";

  const markDownloaded = (id: number) => {
    setDownloadedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header + tabs: ambient mesh gradient strictly at the top */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[185px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-40 blur-[80px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[110px] -top-[155px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.38] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.44]" />
          <div className="absolute -top-[135px] left-[32%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.16]" />
        </div>

        <div className="relative px-4 pb-2.5 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="Back to Profile"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </Link>
            <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Docs &amp; Certs</span>
            <Link
              href="/search"
              aria-label="Search documents"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Search size={19} strokeWidth={2} />
            </Link>
          </div>

          <div className="relative mt-4 grid grid-cols-2 rounded-full border border-white/70 bg-white/52 p-[3px] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/50">
            <div
              className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.16)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] dark:bg-slate-800"
              style={{ transform: isCerts ? "translateX(0)" : "translateX(100%)" }}
            />
            <button
              type="button"
              onClick={() => setTab("certs")}
              className={`relative z-10 h-9 rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                isCerts ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              My Certs
            </button>
            <button
              type="button"
              onClick={() => setTab("sds")}
              className={`relative z-10 h-9 rounded-full text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                !isCerts ? "text-slate-900 dark:text-slate-50" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              SDS Library
            </button>
          </div>
        </div>
      </div>

      <div className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {isCerts && (
          <div className="px-4 pt-6">
            <div className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.42)] dark:border-white/[.06] dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-[7px] text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
                    TECHNICIAN CERTIFICATION
                  </div>
                  <div className="text-[16px] font-semibold leading-[1.25] tracking-[-.03em]">{EPA_CERT.title}</div>
                </div>
                <span className="flex flex-none items-center gap-1.5 rounded-full border border-emerald-600/[.24] bg-emerald-50 px-2.5 py-[6px] text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
                  <ShieldCheck size={13} strokeWidth={2} />
                  Verified
                </span>
              </div>

              <div className="mt-4.5 flex flex-col gap-2.5">
                {EPA_CERT.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3.5">
                    <span className="flex-none text-[11.5px] tracking-[.05em] text-slate-400 dark:text-slate-500">
                      {row.label}
                    </span>
                    <span
                      className={`min-w-0 text-right tracking-[-.015em] ${
                        row.strong
                          ? "text-[13.5px] font-semibold text-slate-800 dark:text-slate-100"
                          : "text-[12.5px] font-medium text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-slate-900/[.07] pt-4 dark:border-white/[.07]">
                <button
                  type="button"
                  className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-slate-900/[.14] bg-white text-[13.5px] font-semibold tracking-[-.01em] text-slate-900 transition-colors hover:border-slate-900/30 dark:border-white/[.14] dark:bg-transparent dark:text-slate-50 dark:hover:border-white/30"
                >
                  <Eye size={16} strokeWidth={1.9} />
                  View
                </button>
                <button
                  type="button"
                  onClick={() => setCertDownloaded(true)}
                  className={`flex h-[46px] items-center justify-center gap-2 rounded-[14px] text-[13.5px] font-semibold tracking-[-.01em] text-white shadow-[0_12px_26px_-12px_rgba(29,78,216,0.8)] transition-colors ${
                    certDownloaded ? "bg-emerald-600" : "bg-blue-700 hover:bg-blue-800"
                  }`}
                >
                  {certDownloaded ? <Check size={16} strokeWidth={2.4} /> : <Download size={16} strokeWidth={2} />}
                  {certDownloaded ? "Downloaded" : "Download"}
                </button>
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5 rounded-2xl border border-slate-900/[.05] bg-slate-100 p-3.5 text-[11.5px] leading-[1.55] text-slate-500 dark:border-white/[.06] dark:bg-white/[.03] dark:text-slate-400">
              <Info size={15} className="flex-none text-blue-700 dark:text-blue-400" strokeWidth={2} />
              Renew 60 days before expiry to keep purchasing uninterrupted.
            </div>
          </div>
        )}

        <div className="px-4 pt-6">
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1.5">
            <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-slate-500">
              {isCerts ? "SDS LIBRARY" : "ALL SAFETY DATA SHEETS"}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{SDS_DOCS.length} documents</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {SDS_DOCS.map((doc) => {
              const done = downloadedIds.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-900/[.05] bg-white p-3.5 shadow-[0_8px_22px_-20px_rgba(15,23,42,0.4)] dark:border-white/[.06] dark:bg-slate-900"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
                      <FileText size={17} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold leading-[1.3] tracking-[-.02em]">
                        {doc.name}
                      </span>
                      <span className="mt-[3px] block text-[11.5px] text-slate-400 dark:text-slate-500">
                        {doc.meta}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => markDownloaded(doc.id)}
                    aria-label={done ? `${doc.name} downloaded` : `Download ${doc.name}`}
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors ${
                      done
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-600 dark:bg-white/[.08] dark:text-slate-300"
                    }`}
                  >
                    {done ? <Check size={16} strokeWidth={2.4} /> : <Download size={16} strokeWidth={2} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
