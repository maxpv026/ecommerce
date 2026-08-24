"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Award, Check, FileText, PackageCheck, ShieldCheck } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import { CERTIFICATION_STANDARDS, CERTIFICATION_STATS, COA_FACTS } from "@/lib/certifications";
import type { CertificationIconKey } from "@/lib/types";

const ICON_MAP: Record<CertificationIconKey, typeof ShieldCheck> = {
  "shield-check": ShieldCheck,
  "package-check": PackageCheck,
  award: Award,
};

// Decorative width pairs for the mock certificate document — purely
// presentational, not real data.
const MOCK_DOC_ROWS = [
  { k: "46%", v: "28%" },
  { k: "60%", v: "22%" },
  { k: "38%", v: "30%" },
  { k: "54%", v: "24%" },
  { k: "42%", v: "26%" },
  { k: "50%", v: "20%" },
];

export default function CertificationsPage() {
  const [headerQuery, setHeaderQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={headerQuery}
        onQueryChange={setHeaderQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      {/* Hero: ambient mesh gradient masked to fade into white before the grid */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_56%,transparent_100%)]">
          <div className="absolute -left-[190px] -top-[350px] h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-30 blur-[120px] [animation:hc-float_26s_ease-in-out_infinite] dark:opacity-[.45]" />
          <div className="absolute -right-[150px] -top-[290px] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.28] blur-[120px] [animation:hc-float_32s_ease-in-out_infinite_reverse] dark:opacity-[.4]" />
          <div className="absolute -top-[210px] left-[38%] h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-45 blur-[100px] [animation:hc-float_36s_ease-in-out_infinite] dark:opacity-[.15]" />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-8 pt-13">
          <div className="mb-7.5 flex items-center gap-2 text-[12.5px] text-slate-400 dark:text-slate-500">
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
            <span className="text-slate-600 dark:text-slate-400">Certifications</span>
          </div>

          <div className="max-w-[680px]">
            <h1 className="m-0 text-[38px] font-semibold leading-[1.05] tracking-[-.045em] text-balance sm:text-[52px]">
              Quality &amp; Certifications
            </h1>
            <p className="mt-4.5 max-w-[560px] text-base leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
              Guaranteed 99.9% purity and strict regulatory compliance at every step of our supply
              chain.
            </p>
          </div>

          <div className="mt-11 flex flex-wrap gap-11 pb-2">
            {CERTIFICATION_STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-[30px] font-semibold tracking-[-.04em]">{stat.value}</div>
                <div className="mt-[5px] text-[12.5px] text-slate-500 dark:text-slate-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry standards grid: stark white background, glass cards */}
      <section className="mx-auto max-w-[1240px] px-8 pt-14">
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {CERTIFICATION_STANDARDS.map((standard) => {
            const Icon = ICON_MAP[standard.icon];
            return (
              <div
                key={standard.id}
                className="flex flex-col rounded-[22px] border border-white/80 bg-slate-50/70 p-7 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.22)] backdrop-blur-md backdrop-saturate-150 transition-colors hover:border-slate-900/[.16] dark:border-white/[.08] dark:bg-white/[.03] dark:hover:border-white/20"
              >
                <span className="mb-5 flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] border border-slate-900/[.07] bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-50">
                  <Icon size={21} strokeWidth={1.7} />
                </span>
                <h3 className="m-0 text-lg font-semibold tracking-[-.025em]">{standard.title}</h3>
                <div className="mt-1.5 text-[11.5px] tracking-[.06em] text-slate-400 dark:text-slate-500">
                  {standard.tag}
                </div>
                <p className="mt-3.5 flex-1 text-[13.5px] leading-[1.65] text-slate-600 text-pretty dark:text-slate-400">
                  {standard.body}
                </p>
                <div className="mt-5 flex items-center gap-2 border-t border-slate-900/[.08] pt-4 text-xs text-green-700 dark:border-white/[.08] dark:text-green-400">
                  <Check size={13} strokeWidth={2.4} />
                  {standard.audit}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CoA feature banner */}
      <section className="mx-auto max-w-[1240px] px-8 pb-[110px] pt-22">
        <div className="grid grid-cols-1 items-center gap-10 rounded-[28px] border border-slate-900/[.07] bg-[#fbfcfd] p-7 sm:p-9 lg:grid-cols-[.9fr_1.1fr] lg:gap-14 dark:border-white/[.08] dark:bg-white/[.02]">
          {/* Mock certificate document */}
          <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] border border-slate-900/[.07] bg-gradient-to-br from-slate-50 to-[#eef1f5] shadow-[0_30px_60px_-30px_rgba(15,23,42,0.32)] dark:border-white/[.08] dark:from-slate-800 dark:to-slate-900">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.035)_0_1px,transparent_1px_11px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.03)_0_1px,transparent_1px_11px)]" />
            <div className="absolute inset-[8%] flex flex-col gap-2.5 rounded-lg border border-dashed border-slate-900/20 bg-white/90 p-5.5 dark:border-white/20 dark:bg-slate-900/75">
              <div className="h-2 w-[52%] rounded-[3px] bg-slate-900/[.16] dark:bg-white/20" />
              <div className="mb-2 h-1.5 w-[34%] rounded-[3px] bg-slate-900/[.09] dark:bg-white/10" />
              <div className="h-px w-full bg-slate-900/10 dark:bg-white/10" />
              {MOCK_DOC_ROWS.map((row, i) => (
                <div key={i} className="flex justify-between gap-2.5">
                  <span
                    className="h-1.5 rounded-[3px] bg-slate-900/[.12] dark:bg-white/15"
                    style={{ width: row.k }}
                  />
                  <span
                    className="h-1.5 rounded-[3px] bg-slate-900/[.08] dark:bg-white/10"
                    style={{ width: row.v }}
                  />
                </div>
              ))}
              <div className="mt-auto flex items-end justify-between gap-2.5">
                <div className="h-1.5 w-[38%] rounded-[3px] bg-slate-900/[.12] dark:bg-white/15" />
                <div className="h-[34px] w-[34px] rounded-full border-[1.5px] border-dashed border-blue-700/40" />
              </div>
            </div>
            <span className="absolute bottom-4 left-[18px] font-mono text-[10.5px] tracking-[.04em] text-slate-400 dark:text-slate-500">
              [ batch purity certificate ]
            </span>
          </div>

          <div>
            <div className="mb-3.5 text-[11.5px] tracking-[.09em] text-slate-400 dark:text-slate-500">
              CERTIFICATE OF ANALYSIS
            </div>
            <h2 className="m-0 text-[28px] font-semibold leading-[1.12] tracking-[-.04em] text-balance sm:text-[34px]">
              Every cylinder ships with its own analysis
            </h2>
            <p className="mt-4.5 max-w-[480px] text-[15px] leading-[1.65] text-slate-600 text-pretty dark:text-slate-400">
              Each CoA is tied to the specific lot number stamped on your cylinder, documenting
              composition, moisture, residue, and non-condensable gas results from that batch.
              Nothing is blended after testing, so cross-contamination cannot occur between lots.
            </p>

            <div className="mt-6.5 grid max-w-[460px] grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-x-7">
              {COA_FACTS.map((fact) => (
                <div key={fact} className="flex items-start gap-2.5">
                  <Check
                    size={14}
                    strokeWidth={2.4}
                    className="mt-0.5 flex-none text-blue-700 dark:text-blue-400"
                  />
                  <span className="text-[13px] leading-[1.5] text-slate-700 dark:text-slate-300">
                    {fact}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-7.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="flex h-12 items-center gap-[9px] rounded-[14px] bg-blue-700 px-[22px] text-sm font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-12px_rgba(29,78,216,0.65)] transition-colors hover:bg-blue-800"
              >
                <FileText size={15} strokeWidth={2} />
                View Sample CoA
              </button>
              <Link
                href="/compliance/sds"
                className="text-[13px] text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400"
              >
                Browse SDS library
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
