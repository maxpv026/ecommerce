"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Download, Search, TriangleAlert, X } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import { SDS_CATEGORIES, SDS_DOCUMENTS, SDS_LANGUAGES } from "@/lib/sds";
import type { SdsBadgeLabel, SdsCategory } from "@/lib/types";

const BADGE_STYLES: Record<SdsBadgeLabel, string> = {
  "F-Gas Certified":
    "bg-slate-100 text-slate-600 border-slate-900/10 dark:bg-white/5 dark:text-slate-400 dark:border-white/10",
  "A1 Non-flammable":
    "bg-blue-50 text-blue-700 border-blue-700/[.18] dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/25",
  "A2L Mildly Flammable":
    "bg-amber-50 text-amber-700 border-amber-700/20 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/25",
  Reclaimed:
    "bg-green-50 text-green-700 border-green-700/20 dark:bg-green-400/10 dark:text-green-400 dark:border-green-400/25",
};

const selectClasses =
  "h-10 cursor-pointer rounded-xl border border-slate-900/[.13] bg-white/78 px-3.5 text-[12.5px] text-slate-900 focus:outline-none dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50";

export default function SdsPage() {
  const [headerQuery, setHeaderQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("en");
  const [category, setCategory] = useState<"all" | SdsCategory>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SDS_DOCUMENTS.filter((d) => {
      const matchesCategory = category === "all" || d.category === category;
      const matchesQuery = !q || `${d.name} ${d.cas} ${d.category}`.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  const resultLine = `${filtered.length} ${filtered.length === 1 ? "document" : "documents"} · GHS-aligned, revision controlled`;

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={headerQuery}
        onQueryChange={setHeaderQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      {/* Hero: ambient mesh gradient masked to fade into white before the doc list */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
          <div className="absolute -left-[180px] -top-[340px] h-[780px] w-[780px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-30 blur-[120px] [animation:hc-float_26s_ease-in-out_infinite] dark:opacity-[.45]" />
          <div className="absolute -right-[140px] -top-[280px] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.28] blur-[120px] [animation:hc-float_32s_ease-in-out_infinite_reverse] dark:opacity-[.4]" />
          <div className="absolute -top-[200px] left-[40%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[100px] [animation:hc-float_36s_ease-in-out_infinite] dark:opacity-[.15]" />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-8 pt-13">
          <div className="mb-6.5 flex items-center gap-2 text-[12.5px] text-slate-400 dark:text-slate-500">
            <Link href="/" className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50">
              Home
            </Link>
            <span>/</span>
            <Link
              href="/compliance/sds"
              className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50"
            >
              Compliance
            </Link>
            <span>/</span>
            <span className="text-slate-600 dark:text-slate-400">SDS</span>
          </div>

          <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1.4fr_.8fr] lg:gap-12">
            <div>
              <h1 className="m-0 text-[38px] font-semibold leading-[1.05] tracking-[-.045em] text-balance sm:text-[50px]">
                Safety Data Sheets (SDS)
              </h1>
              <p className="mt-4.5 max-w-[540px] text-base leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
                Download official AHRI-700 and F-Gas compliant documentation for all My Energy
                refrigerants.
              </p>

              {/* Glass search bar */}
              <div className="mt-8.5 flex h-[60px] items-center gap-[11px] rounded-[17px] border border-white/75 bg-white/62 py-0 pl-4.5 pr-2 shadow-[0_22px_50px_-24px_rgba(15,23,42,0.26)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/55">
                <Search size={18} className="shrink-0 text-slate-500 dark:text-slate-400" strokeWidth={2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by refrigerant (e.g., R-410A) or CAS number..."
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-slate-900/[.06] text-slate-600 transition-colors hover:bg-slate-900/[.12] dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-[9px]">
                <select value={lang} onChange={(e) => setLang(e.target.value)} className={selectClasses}>
                  {SDS_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as "all" | SdsCategory)}
                  className={selectClasses}
                >
                  {SDS_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Glass Emergency Contact card */}
            <div className="rounded-[20px] border border-white/75 bg-white/66 p-5.5 shadow-[0_24px_56px_-26px_rgba(15,23,42,0.28)] backdrop-blur-md backdrop-saturate-150 lg:mt-22 dark:border-white/10 dark:bg-slate-900/60">
              <div className="mb-3.5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400">
                  <TriangleAlert size={17} strokeWidth={2} />
                </span>
                <div className="text-sm font-semibold tracking-[-.02em]">24/7 Emergency Response</div>
              </div>
              <p className="m-0 mb-4 text-[12.5px] leading-[1.55] text-slate-500 dark:text-slate-400">
                For spills, exposure, or transport incidents in Europe, call the NCEC emergency
                line before handling the cylinder.
              </p>
              <a
                href="tel:+441865407333"
                className="block text-[23px] font-semibold tracking-[-.03em] text-slate-900 transition-colors hover:text-blue-700 dark:text-slate-50 dark:hover:text-blue-400"
              >
                +44 1865 407 333
              </a>
              <div className="mt-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
                NCEC · My Energy account #ME-4471 · EN, DE, FR, ES, NL
              </div>
              <div className="mt-4 border-t border-slate-900/[.08] pt-3.5 text-[11.5px] leading-[1.55] text-slate-500 dark:border-white/[.08] dark:text-slate-400">
                Life-threatening emergencies within the EU: 112
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Document list: stark white background for readability */}
      <section className="mx-auto max-w-[1240px] px-8 pb-[110px] pt-11">
        <div className="mb-5.5 flex items-baseline justify-between gap-5">
          <span className="text-[13px] text-slate-500 dark:text-slate-400">{resultLine}</span>
          <button
            type="button"
            className="h-[38px] rounded-[11px] border border-slate-900/[.14] bg-white px-4 text-[12.5px] font-semibold tracking-[-.01em] transition-colors hover:border-slate-900/[.36] dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
          >
            Download all (ZIP)
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.5fr_1fr_1.2fr_auto] gap-5 border-b border-gray-100 pb-3 text-[10.5px] tracking-[.08em] text-slate-400 dark:border-white/10 dark:text-slate-500">
              <span>REFRIGERANT</span>
              <span>DOCUMENT</span>
              <span>CLASSIFICATION</span>
              <span />
            </div>

            {filtered.length > 0 ? (
              filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="group -mx-3 grid grid-cols-[1.5fr_1fr_1.2fr_auto] items-center gap-5 rounded-xl border-b border-gray-100 px-3 py-4.5 transition-colors hover:bg-slate-50 dark:border-white/[.07] dark:hover:bg-white/[.04]"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold tracking-[-.02em]">{doc.name}</div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      CAS {doc.cas} · {doc.category}
                    </div>
                  </div>
                  <div className="text-[13px] text-slate-600 dark:text-slate-400">{doc.doc}</div>
                  <div className="flex flex-wrap gap-[7px]">
                    {doc.badges.map((label) => (
                      <span
                        key={label}
                        className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[-.01em] ${BADGE_STYLES[label]}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="flex h-10 flex-none items-center gap-2 rounded-xl border border-slate-900/[.14] bg-white px-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-900 transition-[background-color,color,box-shadow,border-color] duration-200 group-hover:border-transparent group-hover:bg-blue-700 group-hover:text-white group-hover:shadow-[0_12px_26px_-12px_rgba(29,78,216,0.65)] dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50"
                  >
                    <Download size={14} strokeWidth={2} />
                    Download PDF
                  </button>
                </div>
              ))
            ) : (
              <div className="py-20 text-center text-sm text-slate-400 dark:text-slate-500">
                No documents match &ldquo;{query}&rdquo;.
              </div>
            )}
          </div>
        </div>

        <p className="mt-8.5 max-w-[640px] text-xs leading-[1.6] text-slate-400 dark:text-slate-500">
          Revision dates reflect the most recent GHS-aligned update. Archived revisions are
          available on request through your account manager.
        </p>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
