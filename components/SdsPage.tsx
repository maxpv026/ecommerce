"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { Download, FileArchive, FileText, Phone, Search, Sparkles, TriangleAlert, X } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
// Deferred: the modal carries a second copy of the markdown renderer and is
// only reachable behind a button, so it has no business in the page bundle.
const SdsAssistantModal = dynamic(() => import("./SdsAssistantModal"), { ssr: false });
import { SDS_ASSET_DIR, SDS_CATEGORIES, SDS_DOCUMENTS, SDS_LANGUAGES, SDS_ZIP_FILE } from "@/lib/sds";
import type { SdsBadgeLabel, SdsCategory, SdsDocument } from "@/lib/types";

/**
 * Compliance → Safety Data Sheets.
 *
 * Theme-following: every surface pairs a light treatment with a `dark:`
 * counterpart, so the global toggle drives this page like every other one.
 * (An earlier revision pinned it to `.dark`, which left the page black
 * while the rest of the app went light.)
 *
 * Light is clean glass on slate-50; dark is the Rich Obsidian palette. The
 * ambient orbs are dialled down in light mode — at dark-mode opacity they
 * turn a white page muddy.
 */

const BADGE_STYLES: Record<SdsBadgeLabel, string> = {
  "F-Gas Certified":
    "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[.06] dark:text-slate-300",
  "A1 Non-flammable":
    "border-cyan-600/20 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300",
  "A2L Mildly Flammable":
    "border-amber-600/25 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  Reclaimed:
    "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
};

const SELECT_CLASSES =
  "h-10 cursor-pointer rounded-xl border border-slate-200 bg-white/80 px-3.5 text-[12.5px] text-slate-700 shadow-sm transition-colors focus:border-cyan-500/50 focus:outline-none dark:border-white/10 dark:bg-white/[.04] dark:text-slate-200 dark:shadow-none dark:focus:border-cyan-400/40 [&>option]:bg-white [&>option]:text-slate-800 dark:[&>option]:bg-[#141518] dark:[&>option]:text-slate-200";

/** Glass surface shared by the search bar, the rows and the empty state. */
const CARD =
  "border-slate-200 bg-white/80 shadow-sm backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/80 dark:shadow-none";

export default function SdsPage() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("en");
  const [category, setCategory] = useState<"all" | SdsCategory>("all");
  const [assistantFor, setAssistantFor] = useState<SdsDocument | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SDS_DOCUMENTS.filter((d) => {
      const matchesCategory = category === "all" || d.category === category;
      const matchesQuery = !q || `${d.name} ${d.cas} ${d.category}`.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  const pdfHref = (doc: SdsDocument) => `${SDS_ASSET_DIR}/${doc.file}`;

  return (
    <div className="flex-1 bg-slate-50 text-slate-900 dark:bg-[#0a0a0c] dark:text-slate-100">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)]">
          <div className="absolute -left-[180px] -top-[340px] h-[780px] w-[780px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.18] blur-[120px] [animation:hc-float_26s_ease-in-out_infinite] dark:opacity-[.34]" />
          <div className="absolute -right-[140px] -top-[280px] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.16] blur-[120px] [animation:hc-float_32s_ease-in-out_infinite_reverse] dark:opacity-[.28]" />
          <div className="absolute -top-[200px] left-[40%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_70%)] opacity-[.12] blur-[110px] [animation:hc-float_36s_ease-in-out_infinite] dark:opacity-[.22]" />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-8 pt-13">
          <div className="mb-6.5 flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            <Link href="/" className="transition-colors hover:text-slate-900 dark:hover:text-slate-200">
              Home
            </Link>
            <span>/</span>
            <Link
              href="/compliance/sds"
              className="transition-colors hover:text-slate-900 dark:hover:text-slate-200"
            >
              Compliance
            </Link>
            <span>/</span>
            <span className="text-slate-700 dark:text-slate-300">SDS</span>
          </div>

          <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1.4fr_.8fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="m-0 text-balance text-[38px] font-semibold leading-[1.05] tracking-[-.045em] text-slate-900 sm:text-[50px] dark:text-white">
                Safety Data Sheets (SDS)
              </h1>
              <p className="mt-4.5 max-w-[540px] text-pretty text-base leading-[1.6] text-slate-600 dark:text-slate-400">
                Download official AHRI-700 and F-Gas compliant documentation for all My Energy
                refrigerants — or ask the safety assistant about any of them.
              </p>

              <div
                className={`mt-8.5 flex h-[60px] items-center gap-[11px] rounded-[17px] border py-0 pl-4.5 pr-2 transition-colors focus-within:border-cyan-500/45 dark:focus-within:border-cyan-400/35 ${CARD}`}
              >
                <Search size={18} className="shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by refrigerant (e.g., R-410A) or CAS number..."
                  aria-label="Search safety data sheets"
                  data-sds-search
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-slate-900/[.06] text-slate-600 transition-colors hover:bg-slate-900/[.12] hover:text-slate-900 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20 dark:hover:text-white"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-[9px]">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  aria-label="Document language"
                  className={SELECT_CLASSES}
                >
                  {SDS_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as "all" | SdsCategory)}
                  aria-label="Document category"
                  className={SELECT_CLASSES}
                >
                  {SDS_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>

            {/* ── 24/7 Emergency Response ── */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              data-emergency-card
              className="relative overflow-hidden rounded-[22px] border border-red-200 bg-red-50/60 p-5.5 shadow-sm backdrop-blur-md backdrop-saturate-150 lg:mt-22 dark:border-red-500/30 dark:bg-[#141518]/80 dark:shadow-[0_0_44px_-14px_rgba(239,68,68,.55),0_30px_70px_-40px_rgba(0,0,0,.9)]"
            >
              {/* The crimson bleed is a dark-mode device — on white it just
                  smears, so light mode gets the tint and border instead. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,#ef4444,transparent_68%)] opacity-[.07] blur-[52px] dark:opacity-25 dark:[animation:hc-breathe_6s_ease-in-out_infinite]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(220,38,38,.45),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(248,113,113,.7),transparent)]"
              />

              <div className="relative mb-3.5 flex items-center gap-2.5">
                <span className="relative flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-[linear-gradient(140deg,#dc2626,#f87171)] text-white shadow-[0_10px_22px_-12px_rgba(239,68,68,.75)] dark:shadow-[0_12px_26px_-12px_rgba(239,68,68,.95)]">
                  <TriangleAlert size={17} strokeWidth={2.2} />
                  <span
                    aria-hidden
                    className="absolute -inset-1 rounded-[15px] border border-red-400/30 dark:border-red-400/40 dark:[animation:hc-glow_2.4s_ease-in-out_infinite]"
                  />
                </span>
                <div className="text-sm font-semibold tracking-[-.02em] text-slate-900 dark:text-white">
                  24/7 Emergency Response
                </div>
              </div>

              <p className="relative m-0 mb-4 text-[12.5px] leading-[1.55] text-slate-600 dark:text-slate-400">
                For spills, exposure, or transport incidents in Europe, call the NCEC emergency line
                before handling the cylinder.
              </p>

              <a
                href="tel:+441865407333"
                data-emergency-phone
                className="relative flex items-center gap-2.5 text-[23px] font-semibold tracking-[-.03em] text-slate-900 transition-colors hover:text-red-700 dark:text-white dark:hover:text-red-300"
              >
                <Phone size={18} strokeWidth={2.2} className="flex-none text-red-600 dark:text-red-400" />
                +44 1865 407 333
              </a>
              <div className="relative mt-1.5 text-[11.5px] text-slate-600 dark:text-slate-400">
                NCEC · My Energy account #ME-4471 · EN, DE, FR, ES, NL
              </div>
              <div className="relative mt-4 border-t border-red-900/10 pt-3.5 text-[11.5px] leading-[1.55] text-slate-600 dark:border-white/10 dark:text-slate-400">
                Life-threatening emergencies within the EU:{" "}
                <span className="font-semibold text-red-700 dark:text-red-300">112</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Documents ── */}
      <section className="relative mx-auto max-w-[1240px] px-8 pb-[110px] pt-11">
        <div className="mb-5.5 flex flex-wrap items-baseline justify-between gap-4">
          <span className="text-[13px] text-slate-500 dark:text-slate-400" data-sds-count>
            {filtered.length} {filtered.length === 1 ? "document" : "documents"} · GHS-aligned,
            revision controlled
          </span>
          <a
            href={`${SDS_ASSET_DIR}/${SDS_ZIP_FILE}`}
            download
            data-sds-download-all
            className="flex h-[38px] items-center gap-2 rounded-[11px] border border-slate-200 bg-white/80 px-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-200 dark:shadow-none dark:hover:border-white/25 dark:hover:bg-white/[.08] dark:hover:text-white"
          >
            <FileArchive size={14} strokeWidth={2} />
            Download all (ZIP)
          </a>
        </div>

        {filtered.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {filtered.map((doc, index) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.05, 0.35) }}
                data-sds-row={doc.gas}
                className={`group relative overflow-hidden rounded-[20px] border p-4.5 transition-[border-color,box-shadow] duration-300 hover:border-slate-300 hover:shadow-[0_10px_30px_-18px_rgba(15,23,42,.35)] dark:hover:border-white/20 dark:hover:shadow-[0_0_34px_-14px_rgba(34,211,238,.5)] ${CARD}`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,#22d3ee,transparent_68%)] opacity-0 blur-[44px] transition-opacity duration-300 group-hover:opacity-[.12] dark:group-hover:opacity-25"
                />

                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-5">
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-slate-400 transition-colors group-hover:text-cyan-600 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-400 dark:group-hover:text-cyan-300">
                      <FileText size={18} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold tracking-[-.025em] text-slate-900 dark:text-white">
                        {doc.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        CAS {doc.cas} · {doc.category}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{doc.doc}</div>
                    </div>
                  </div>

                  <div className="flex flex-none flex-wrap gap-[7px] lg:w-[220px]">
                    {doc.badges.map((label) => (
                      <span
                        key={label}
                        className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[-.01em] ${BADGE_STYLES[label]}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-none items-center gap-2">
                    {/* Light: a solid violet→cyan gradient with white text, so
                        it reads at a glance on white. Dark: the tinted glass
                        treatment, which would vanish on a light background. */}
                    <button
                      type="button"
                      onClick={() => setAssistantFor(doc)}
                      data-sds-ask={doc.gas}
                      className="flex h-10 flex-none items-center gap-2 rounded-xl border border-transparent bg-[linear-gradient(140deg,#6d28d9,#0e7490)] px-3.5 text-[12.5px] font-semibold tracking-[-.01em] text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,.8)] transition-[border-color,box-shadow,color,filter] duration-200 hover:brightness-110 hover:shadow-[0_14px_30px_-12px_rgba(124,58,237,.9)] dark:border-violet-400/30 dark:bg-[linear-gradient(140deg,rgba(124,58,237,.22),rgba(34,211,238,.16))] dark:text-violet-200 dark:shadow-[0_0_22px_-10px_rgba(124,58,237,.9)] dark:hover:border-cyan-300/50 dark:hover:text-white dark:hover:shadow-[0_0_30px_-8px_rgba(124,58,237,.95),0_0_22px_-10px_rgba(34,211,238,.8)]"
                    >
                      <Sparkles size={14} strokeWidth={2.2} />
                      Ask AI
                    </button>

                    <a
                      href={pdfHref(doc)}
                      download
                      data-sds-download={doc.gas}
                      className="flex h-10 flex-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-700 shadow-sm transition-colors duration-200 hover:border-transparent hover:bg-blue-700 hover:text-white hover:shadow-[0_12px_26px_-12px_rgba(29,78,216,.7)] dark:border-white/10 dark:bg-white/[.04] dark:text-slate-200 dark:shadow-none dark:hover:border-transparent dark:hover:bg-blue-700 dark:hover:text-white dark:hover:shadow-[0_12px_26px_-12px_rgba(29,78,216,.9)]"
                    >
                      <Download size={14} strokeWidth={2} />
                      Download PDF
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-300 py-20 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
            No documents match &ldquo;{query}&rdquo;.
          </div>
        )}

        <p className="mt-8.5 max-w-[640px] text-xs leading-[1.6] text-slate-500 dark:text-slate-400">
          Revision dates reflect the most recent GHS-aligned update. Archived revisions are
          available on request through your account manager. AI answers are guidance only — the
          PDF is the controlled document.
        </p>
      </section>

      {/* Keyed by gas so switching refrigerants starts a fresh conversation. */}
      {assistantFor && (
        <SdsAssistantModal
          key={assistantFor.gas}
          open
          gas={assistantFor.gas}
          documentName={assistantFor.name}
          pdfHref={pdfHref(assistantFor)}
          onClose={() => setAssistantFor(null)}
        />
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
