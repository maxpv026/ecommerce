"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, Radar } from "lucide-react";
import { SURFACE } from "@/components/home/ui";
import { LEAK_GASES, leakCheck } from "@/lib/leakCheck";

/**
 * Art. 5 of Regulation (EU) 2024/573 for ONE installed system: pick the gas,
 * enter its charge, say whether a fixed leak detector is fitted — the
 * interval follows (lib/leakCheck). Runs in the browser; nothing is sent.
 */

const MAX_SLIDER = 50;

export default function LeakCheckCalculator() {
  const t = useTranslations("Compliance");
  const format = useFormatter();
  const [gasIdx, setGasIdx] = useState(0);
  const [raw, setRaw] = useState("4");
  const [detector, setDetector] = useState(false);
  const gas = LEAK_GASES[gasIdx]!;
  const kg = Math.max(0, Number(raw.replace(",", ".")) || 0);
  const r = leakCheck(gas, kg, detector);
  const n = (v: number, dp = 2) => format.number(v, { maximumFractionDigits: dp });

  const bands = gas.basis === "co2e" ? ["< 5", "5–50", "50–500", "≥ 500"] : ["< 1", "1–10", "10–100", "≥ 100"];
  const unit = gas.basis === "co2e" ? t("unitTonnesCo2e") : t("unitKg");

  return (
    <section className={SURFACE} data-leak-calc>
      <div className="border-b border-slate-900/[.06] px-5 py-3.5 dark:border-white/[.06]">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-.02em]">{t("calcTitle")}</h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("calcIntro")}</p>
      </div>

      <div className="px-5 py-4">
        <p className="m-0 mb-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t("calcGas")}</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("calcGas")}>
          {LEAK_GASES.map((g, i) => (
            <button
              key={g.label}
              type="button"
              role="radio"
              aria-checked={i === gasIdx}
              onClick={() => setGasIdx(i)}
              data-calc-gas={g.label}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
                i === gasIdx ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-2 flex items-center justify-between text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t("calcCharge")}
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                aria-label={t("calcCharge")}
                data-calc-kg
                className="h-8 w-[84px] rounded-[10px] border border-slate-900/[.12] bg-white px-2.5 text-right text-[13px] font-semibold tabular-nums text-slate-900 focus:border-blue-600/50 focus:outline-none dark:border-white/[.14] dark:bg-white/[.04] dark:text-white"
              />
              <span className="font-normal text-slate-500 dark:text-ink-muted">{t("unitKg")}</span>
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={MAX_SLIDER}
            step={0.5}
            value={Math.min(MAX_SLIDER, Math.max(1, kg))}
            onChange={(e) => setRaw(e.target.value)}
            aria-label={t("calcCharge")}
            data-calc-slider
            className="w-full accent-blue-700"
          />
        </label>

        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[12.5px] text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={detector} onChange={(e) => setDetector(e.target.checked)} className="h-4 w-4 accent-blue-700" data-calc-detector />
          {t("calcDetector")}
        </label>
      </div>

      <div className="border-t border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]" data-calc-result data-band={r.band} data-months={r.months ?? 0}>
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-slate-500 dark:text-ink-muted">{t("calcCo2e")}</dt>
          <dd className="m-0 text-right font-semibold tabular-nums" data-calc-co2e>
            {t("kpiTonnes", { value: n(r.co2eTonnes, 2) })}
          </dd>
        </dl>
        {gas.basis === "kg" && <p className="m-0 mt-1 text-[11.5px] text-slate-500 dark:text-ink-muted">{t("calcBasisKg")}</p>}

        <div className={`mt-3 flex items-start gap-2.5 rounded-[14px] border px-3.5 py-3 ${r.months === null ? "border-emerald-500/30 bg-emerald-500/10" : "border-blue-600/20 bg-blue-600/[.06] dark:border-blue-400/25 dark:bg-blue-500/[.1]"}`}>
          <CalendarClock size={16} strokeWidth={2.2} className={`mt-0.5 flex-none ${r.months === null ? "text-emerald-700 dark:text-emerald-400" : "text-blue-700 dark:text-blue-400"}`} />
          <div className="min-w-0">
            <p className="m-0 text-[11.5px] font-semibold uppercase tracking-[.06em] text-slate-500 dark:text-ink-muted">{t("calcResult")}</p>
            <p className="m-0 mt-0.5 text-[17px] font-semibold tracking-[-.02em]" data-calc-interval>
              {r.months === null ? t("calcNotRequired") : t("calcEvery", { months: r.months })}
            </p>
            {r.months !== null && <p className="m-0 mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">{detector ? t("calcWithDetector") : t("calcDetectorNote")}</p>}
          </div>
        </div>

        {/* The four bands, the active one filled. */}
        <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden>
          {bands.map((b, i) => (
            <div key={b} className="min-w-0">
              <div className={`h-1.5 rounded-full ${i === r.band ? "bg-blue-700 dark:bg-blue-400" : "bg-slate-900/[.08] dark:bg-white/[.1]"}`} />
              <p className={`m-0 mt-1 truncate text-center text-[10.5px] tabular-nums ${i === r.band ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{b}</p>
            </div>
          ))}
        </div>
        <p className="m-0 mt-0.5 text-center text-[10.5px] text-slate-400">{unit}</p>

        {r.detectionMandatory && (
          <p className="m-0 mt-3 flex items-start gap-2 text-[12.5px] font-semibold text-amber-800 dark:text-amber-300" data-calc-art6>
            <Radar size={14} strokeWidth={2.2} className="mt-0.5 flex-none" />
            {t("calcArt6")}
          </p>
        )}
        <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{t("calcFootnote")}</p>
      </div>
    </section>
  );
}
