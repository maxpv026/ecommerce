"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Calculator, Check, ClipboardCopy, Info, Minus, Plus, RotateCcw, ShoppingCart, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import {
  LIQUID_LINE_SIZES,
  autoChargePerMeterG,
  computeCharge,
  pickCylinders,
  round,
  type LiquidLineSize,
} from "@/lib/chargeCalc";
import type { ChargeCalculation, Provenance } from "@/lib/actions/chargeCalculator";

/**
 * The calculator's answer, as a live engineering worksheet.
 *
 * The AI read the engineer's sentence once (lib/actions/chargeCalculator);
 * everything here recomputes in the browser with lib/chargeCalc — the same
 * functions the server ran — so changing a length, the liquid line, the
 * nameplate charge, the mode or the number of systems never makes another
 * model call.
 *
 *   Top-up        new install: the outdoor unit ships pre-charged for its
 *                 rated length, so only the additional run is added.
 *   Full system   recharge after recovery / repair: nameplate + additional.
 *   × systems     identical units on one job; the cylinder pick is re-run
 *                 for the whole quantity against live stock.
 *
 * Every default is labelled where it is used ("Auto" g/m, "default" rated
 * length). The nameplate charge is never estimated: without it the full-
 * system figure simply waits for it, in its own card, in one place.
 *
 * Styled as a dark glass console in both themes: it sits inside the dark
 * calculator card, and a white sheet there was a box-in-box clash in light mode.
 */

const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};

const MAX_SYSTEMS = 50;
type Mode = "topup" | "full";

const FIELD =
  "flex h-10 items-center rounded-[11px] border border-white/12 bg-white/[.06] pr-2.5 focus-within:border-white/30 focus-within:ring-[3px] focus-within:ring-white/10";
const LABEL = "mb-1 flex items-center gap-1.5 text-[11px] font-medium text-white/55";

export default function CalculatedChargeCard({
  calc,
  onClose,
  className = "mt-4",
}: {
  calc: ChargeCalculation;
  onClose: () => void;
  /** Spacing from what sits above it (the home page embeds it inside the calculator card). */
  className?: string;
}) {
  const t = useTranslations("ChargeCalc");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const gasLabel = calc.refrigerant.label ?? calc.refrigerant.mark ?? "";

  // Inputs, as typed. Seeded from what the server read.
  const [lengthM, setLengthM] = useState(String(round(calc.lineSetLengthM, 1)));
  const [ratedM, setRatedM] = useState(String(round(calc.ratedLength.m, 1)));
  const [lineSize, setLineSize] = useState<LiquidLineSize>(calc.liquidLine.size);
  // A rate stated in the description is the engineer's own; otherwise the
  // rate follows the liquid line automatically until they type one.
  const [rateOverride, setRateOverride] = useState<string | null>(
    calc.chargePerMeterG.source === "stated" && calc.chargePerMeterG.value !== null ? String(round(calc.chargePerMeterG.value, 1)) : null
  );
  const [factory, setFactory] = useState(calc.factoryChargeKg.value === null ? "" : String(round(calc.factoryChargeKg.value, 3)));
  const [mode, setMode] = useState<Mode>("topup");
  const [systems, setSystems] = useState(1);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState(false);

  const touch = (key: string) => setTouched((t0) => ({ ...t0, [key]: true }));
  const source = (key: string, original: Provenance): Provenance => (touched[key] ? "stated" : original);

  const auto = autoChargePerMeterG(gasLabel, lineSize);
  const rateIsAuto = rateOverride === null;
  const rateValue = rateIsAuto ? (auto?.value ?? null) : num(rateOverride);

  const inputs = {
    lineSetLengthM: num(lengthM),
    ratedLengthM: num(ratedM),
    chargePerMeterG: rateValue,
    factoryChargeKg: num(factory),
  };
  // Same bounds as the server's plausibility check.
  const valid =
    inputs.lineSetLengthM !== null && inputs.lineSetLengthM > 0 && inputs.lineSetLengthM <= 150 &&
    inputs.ratedLengthM !== null && inputs.ratedLengthM >= 0 && inputs.ratedLengthM <= 30 &&
    (inputs.chargePerMeterG === null || (inputs.chargePerMeterG >= 5 && inputs.chargePerMeterG <= 300)) &&
    (inputs.factoryChargeKg === null || (inputs.factoryChargeKg > 0 && inputs.factoryChargeKg <= 100));

  // Plain arithmetic, recomputed every render (the React Compiler memoizes it).
  const result = valid
    ? computeCharge({
        lineSetLengthM: inputs.lineSetLengthM!,
        ratedLengthM: inputs.ratedLengthM!,
        chargePerMeterG: inputs.chargePerMeterG,
        factoryChargeKg: inputs.factoryChargeKg,
      })
    : null;

  const extraKg = result?.extraChargeKg ?? null;
  const totalKg = result?.totalChargeKg ?? null;
  const perSystemKg = mode === "full" ? totalKg : extraKg;
  const neededKg = perSystemKg === null ? null : perSystemKg * systems;
  const pick = neededKg !== null && neededKg > 0 ? pickCylinders(neededKg, calc.cylinders) : null;
  const boughtKg = pick ? pick.qty * pick.option.weightKg : 0;
  const leftoverKg = pick && neededKg !== null ? boughtKg - neededKg : 0;
  const co2eT = neededKg !== null && neededKg > 0 && calc.gwp ? (neededKg * calc.gwp) / 1000 : null;
  const cylinderPrice = pick ? Math.round(pick.option.pricePerKg * pick.option.weightKg * 100) / 100 : 0;

  const kg = (v: number) => `${format.number(round(v, 2), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
  const g = (v: number) => `${format.number(Math.round(v * 1000))} g`;
  const m = (v: number) => `${format.number(round(v, 1), { maximumFractionDigits: 1 })} m`;
  const eur = (v: number) => format.number(v, { style: "currency", currency: "EUR" });

  const unitName = [calc.brand, calc.model].filter(Boolean).join(" ") || null;
  const summary = [
    unitName,
    calc.capacity.asWritten,
    inputs.lineSetLengthM !== null ? t("lineSetM", { length: m(inputs.lineSetLengthM) }) : null,
    gasLabel || null,
  ].filter(Boolean) as string[];

  const autoExplain = auto
    ? auto.basis === "physics"
      ? t("autoRatePhysics", { rate: auto.value, size: lineSize, gas: gasLabel })
      : t("autoRateTypical", { rate: auto.value, size: lineSize })
    : null;
  const assumptions = [
    !touched.rated && calc.ratedLength.source === "default" ? t("defaultRated", { length: m(calc.ratedLength.m) }) : null,
    !touched.line && calc.liquidLine.source === "default" ? t("defaultLine", { size: lineSize }) : null,
    rateIsAuto ? autoExplain : null,
    calc.refrigerant.source === "inferred" ? t("inferredRefrigerant", { gas: gasLabel }) : null,
  ].filter(Boolean) as string[];

  // ── Line-set bar: the pre-charged run, then the additional run ──
  const L = inputs.lineSetLengthM ?? 0;
  const R = inputs.ratedLengthM ?? 0;
  const factorySeg = Math.min(R, L);
  const extraSeg = Math.max(0, L - R);
  const factoryPct = L > 0 ? (factorySeg / L) * 100 : 100;

  const resetAdded = () => setAdded(false);

  const addToCart = () => {
    if (!pick) return;
    addItem(
      {
        sku: pick.option.sku,
        name: pick.option.name,
        variant: pick.option.weightLabel,
        pricePerKg: pick.option.pricePerKg,
        weightKg: pick.option.weightKg,
        deposit: pick.option.cylinderDeposit,
      },
      pick.qty
    );
    setAdded(true);
    toast.success(t("addedToast", { qty: pick.qty, name: `${pick.option.name} · ${pick.option.weightLabel}` }));
  };

  /** A plain-text record for the technician's job log. */
  const copySpec = async () => {
    const lines = [
      `${t("eyebrow")} — ${summary.join(" · ")}`,
      `${t("fLength")}: ${inputs.lineSetLengthM !== null ? m(inputs.lineSetLengthM) : "—"} · ${t("fRated")}: ${inputs.ratedLengthM !== null ? m(inputs.ratedLengthM) : "—"} · ${t("fLine")}: ${lineSize}″ · ${rateValue ?? "—"} g/m${rateIsAuto ? ` (${t("auto")})` : ""}`,
      `${t("addOnSite")}: ${extraKg !== null ? kg(extraKg) : "—"} ${t("perSystem")}`,
      `${t("totalCharge")}: ${totalKg !== null ? kg(totalKg) : "—"} ${t("perSystem")}${inputs.factoryChargeKg !== null ? ` (${t("fFactory")} ${kg(inputs.factoryChargeKg)})` : ""}`,
      `${mode === "full" ? t("modeFull") : t("modeTopup")} × ${systems}: ${neededKg !== null ? kg(neededKg) : "—"}`,
      pick && neededKg !== null ? `${t("cylinders")}: ${pick.qty} × ${pick.option.name} · ${pick.option.weightLabel} — ${t("leftover", { kg: kg(leftoverKg) })}` : null,
      co2eT !== null ? `CO₂e: ${format.number(co2eT, { maximumFractionDigits: 3 })} t (GWP ${calc.gwp})` : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const showBuy = pick !== null && neededKg !== null && neededKg > 0 && !(mode === "full" && totalKg === null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      data-charge-card
      className={`relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[.05] p-5 text-white backdrop-blur-md md:p-6 ${className}`}
    >
      {/* ── Header: what was understood · close ── */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-white/10 text-white">
          <Calculator size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[.09em] text-white/50 uppercase">{t("eyebrow")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold tracking-[-.02em]" data-charge-summary>
            {summary.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-white/35">•</span>}
                {part}
                {part === gasLabel && calc.refrigerant.source === "inferred" && <Tag tone="warn">{t("srcInferred")}</Tag>}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Toolbar: mode · systems ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3" data-charge-toolbar>
        <div role="radiogroup" aria-label={t("modeLabel")} className="inline-flex rounded-full bg-white/[.07] p-1 ring-1 ring-white/10">
          {(["topup", "full"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => {
                setMode(value);
                resetAdded();
              }}
              data-charge-mode={value}
              title={value === "topup" ? t("modeTopupHint") : t("modeFullHint")}
              className={`h-8 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${
                mode === value ? "bg-white text-[#0b1020]" : "text-white/70 hover:text-white"
              }`}
            >
              {value === "topup" ? t("modeTopup") : t("modeFull")}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[.07] py-1 pl-3 pr-1 ring-1 ring-white/10" data-charge-systems>
          <span className="whitespace-nowrap text-[12px] font-medium text-white/60">{t("systemsLabel")}</span>
          <button
            type="button"
            onClick={() => {
              setSystems((n) => Math.max(1, n - 1));
              resetAdded();
            }}
            disabled={systems <= 1}
            aria-label={t("systemsLess")}
            data-charge-systems-minus
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <Minus size={13} strokeWidth={2.4} />
          </button>
          <input
            inputMode="numeric"
            value={systems}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value.replace(/[^\d]/g, "")));
              setSystems(Math.min(MAX_SYSTEMS, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1)));
              resetAdded();
            }}
            aria-label={t("systemsLabel")}
            data-charge-field="systems"
            className="h-7 w-10 rounded-md bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none focus:bg-white/10"
          />
          <button
            type="button"
            onClick={() => {
              setSystems((n) => Math.min(MAX_SYSTEMS, n + 1));
              resetAdded();
            }}
            disabled={systems >= MAX_SYSTEMS}
            aria-label={t("systemsMore")}
            data-charge-systems-plus
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <Plus size={13} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        {/* ── Left: the line set, the inputs, the two answers ── */}
        <div className="min-w-0">
          {/* Line-set bar */}
          <div data-charge-lineset>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <span className="h-full bg-emerald-400" style={{ width: `${factoryPct}%` }} />
              {extraSeg > 0 && <span className="h-full bg-blue-500" style={{ width: `${100 - factoryPct}%` }} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/65">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {t("segFactory", { length: m(factorySeg) })}
              </span>
              {extraSeg > 0 ? (
                <span className="flex items-center gap-1.5 whitespace-nowrap" data-charge-extra-formula>
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {rateValue !== null && extraKg !== null
                    ? t("segExtra", { length: m(extraSeg), rate: format.number(rateValue), kg: kg(extraKg) })
                    : t("segExtraNoRate", { length: m(extraSeg) })}
                </span>
              ) : (
                <span className="text-white/50">{t("nothingToAdd")}</span>
              )}
            </div>
          </div>

          {/* Inputs */}
          <fieldset className="m-0 mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 border-0 p-0" data-charge-inputs>
            <legend className="sr-only">{t("adjust")}</legend>
            <Field
              label={t("fLength")}
              suffix="m"
              value={lengthM}
              onChange={(v) => {
                setLengthM(v);
                touch("length");
                resetAdded();
              }}
              name="length"
            />
            <Field
              label={t("fRated")}
              suffix="m"
              value={ratedM}
              onChange={(v) => {
                setRatedM(v);
                touch("rated");
                resetAdded();
              }}
              name="rated"
              tag={<ProvenanceTag p={source("rated", calc.ratedLength.source)} />}
            />
            <label className="block min-w-0">
              <span className={LABEL}>{t("fLine")}</span>
              <select
                value={lineSize}
                onChange={(e) => {
                  setLineSize(e.target.value as LiquidLineSize);
                  touch("line");
                  resetAdded();
                }}
                data-charge-field="line"
                className="h-10 w-full rounded-[11px] border border-white/12 bg-white/[.06] px-2.5 text-[13px] text-white outline-none focus:ring-[3px] focus:ring-white/10 [&>option]:text-slate-900"
              >
                {LIQUID_LINE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}″
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={t("fRate")}
              suffix="g/m"
              value={rateIsAuto ? (auto ? String(auto.value) : "") : rateOverride}
              onChange={(v) => {
                setRateOverride(v);
                resetAdded();
              }}
              placeholder={t("fromManual")}
              name="rate"
              tag={
                rateIsAuto ? (
                  auto ? (
                    <span title={autoExplain ?? undefined} data-charge-rate-auto>
                      <Tag tone="auto">{t("auto")}</Tag>
                    </span>
                  ) : (
                    <Tag tone="bad">{t("srcMissing")}</Tag>
                  )
                ) : (
                  auto && (
                    <button
                      type="button"
                      onClick={() => setRateOverride(null)}
                      title={autoExplain ?? undefined}
                      className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-cyan-300 hover:underline"
                      data-charge-rate-reset
                    >
                      <RotateCcw size={10} strokeWidth={2.4} />
                      {t("auto")}
                    </button>
                  )
                )
              }
            />
          </fieldset>

          {/* The two answers — the nameplate charge is entered in the second, and nowhere else */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={`rounded-[16px] px-4 py-3.5 ${mode === "topup" ? "bg-blue-500/15 ring-1 ring-blue-400/35" : "bg-white/[.06]"}`} data-charge-answer="add">
              <div className="text-[11px] font-semibold tracking-[.08em] text-white/55 uppercase">{t("addOnSite")}</div>
              {extraKg !== null ? (
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[24px] font-bold tracking-[-.035em] tabular-nums" data-charge-value="add">{kg(extraKg)}</span>
                  <span className="text-[13px] font-semibold text-white/55 tabular-nums">{g(extraKg)}</span>
                </div>
              ) : (
                <div className="mt-1.5 text-[24px] font-bold text-white/35">—</div>
              )}
              <div className="mt-1 text-[11.5px] leading-[1.45] text-white/55">{t("perSystemNote")}</div>
            </div>

            <div className={`rounded-[16px] px-4 py-3.5 ${mode === "full" ? "bg-blue-500/15 ring-1 ring-blue-400/35" : "bg-white/[.06]"}`} data-charge-answer="total">
              <div className="text-[11px] font-semibold tracking-[.08em] text-white/55 uppercase">{t("totalCharge")}</div>
              {totalKg !== null ? (
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[24px] font-bold tracking-[-.035em] tabular-nums" data-charge-value="total">{kg(totalKg)}</span>
                  <span className="text-[13px] font-semibold text-white/55 tabular-nums">{g(totalKg)}</span>
                </div>
              ) : (
                <div className="mt-1.5 text-[24px] font-bold text-white/35">—</div>
              )}
              {/* Label above the field: beside it, a long translation squeezed the input to nothing. */}
              <label className="mt-2 block">
                <span className="mb-1 block text-[11px] font-medium text-white/55">{t("nameplate")}</span>
                <span className={`${FIELD} h-8 ${inputs.factoryChargeKg === null ? "border-amber-400/50" : ""}`}>
                  <input
                    inputMode="decimal"
                    value={factory}
                    placeholder={t("fromNameplate")}
                    onChange={(e) => {
                      setFactory(e.target.value);
                      touch("factory");
                      resetAdded();
                    }}
                    data-charge-field="factory"
                    className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-white tabular-nums outline-none placeholder:text-white/35"
                  />
                  <span className="text-[11px] text-white/50">kg</span>
                </span>
              </label>
            </div>
          </div>
          {!valid && <p className="m-0 mt-3 text-[12px] text-rose-300">{t("invalidInputs")}</p>}
        </div>

        {/* ── Right: what to buy ── */}
        <div className="flex min-w-0 flex-col rounded-[16px] border border-white/10 bg-white/[.04] p-4" data-charge-buy>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold tracking-[.08em] text-white/55 uppercase">{t("needLabel")}</span>
            <span className="whitespace-nowrap text-[12px] text-white/55 tabular-nums">
              {mode === "full" ? t("modeFull") : t("modeTopup")} × {systems}
            </span>
          </div>
          <div className="mt-1 text-[26px] font-bold tracking-[-.035em] tabular-nums" data-charge-need>
            {neededKg !== null && !(mode === "full" && totalKg === null) ? kg(neededKg) : "—"}
          </div>

          <div className="mt-3 flex-1">
            {!calc.refrigerant.mark ? (
              <p className="m-0 text-[13px] text-white/60">{t("noRefrigerant")}</p>
            ) : mode === "full" && totalKg === null ? (
              <p className="m-0 text-[13px] text-amber-200" data-charge-needs-factory>
                {t("fullNeedsFactory")}
              </p>
            ) : neededKg === null ? (
              <p className="m-0 text-[13px] text-white/60">{t("needRatePerMetre")}</p>
            ) : neededKg <= 0 ? (
              <p className="m-0 text-[13px] text-white/60">{t("nothingToAdd")}</p>
            ) : pick ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5" data-charge-pick>
                  <span className="text-[15px] font-semibold">
                    {pick.qty} × {pick.option.name} · {pick.option.weightLabel}
                  </span>
                  <span className="whitespace-nowrap text-[13px] font-medium text-white/60 tabular-nums" data-charge-price>
                    {eur(pick.qty * cylinderPrice)} {t("exVat")}
                  </span>
                </div>
                {/* How much of what is bought the job uses, and what goes back on the van */}
                <div className="mt-3" data-charge-fill>
                  <div className="flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <span className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min(100, (neededKg / boughtKg) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[11.5px] leading-[1.45] text-white/65" data-charge-leftover>
                    <span>{t("usage", { used: kg(neededKg), bought: kg(boughtKg) })}</span>
                    <span className="text-white/80">{t("leftover", { kg: kg(leftoverKg) })}</span>
                  </div>
                  {co2eT !== null && (
                    <div className="mt-1 text-[11.5px] text-white/65" data-charge-co2e>
                      {t("co2e", { tonnes: format.number(co2eT, { maximumFractionDigits: 3 }), gwp: format.number(calc.gwp!) })}
                    </div>
                  )}
                  {pick.shortBy > 0 && (
                    <div className="mt-1 text-[11.5px] font-medium text-amber-200" data-charge-short>
                      {t("shortStock", { count: pick.shortBy })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="m-0 text-[13px] text-white/60">{t("noStock", { gas: gasLabel })}</p>
            )}
          </div>

          {showBuy && pick && (
            <button
              type="button"
              onClick={addToCart}
              disabled={!valid}
              data-charge-add
              className={`mt-4 flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-50 ${
                added ? "bg-emerald-500 text-white" : "bg-blue-500 text-white hover:bg-blue-400"
              }`}
            >
              {added ? <Check size={16} strokeWidth={2.4} className="flex-none" /> : <ShoppingCart size={16} strokeWidth={2} className="flex-none" />}
              <span className="truncate">{added ? t("added") : t("addCylinders", { count: pick.qty })}</span>
            </button>
          )}
          <div className="mt-2.5 grid gap-2">
            {calc.refrigerant.mark ? (
              <Link
                href={{ pathname: "/products", query: { gasType: calc.refrigerant.mark } }}
                data-charge-find
                className="flex h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-white/20 px-3 text-[12.5px] font-semibold text-white/85 hover:border-white/40"
              >
                <span className="truncate">{t("findCylinders", { gas: gasLabel })}</span>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={copySpec}
              data-charge-copy
              className="flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 px-3 text-[12.5px] font-semibold text-white/85 hover:border-white/40"
            >
              {copied ? <Check size={14} strokeWidth={2.4} className="flex-none" /> : <ClipboardCopy size={14} strokeWidth={2} className="flex-none" />}
              <span className="truncate">{copied ? t("copied") : t("copySpec")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── One line: assumptions + the disclaimer, expandable ── */}
      <details className="group mt-4 rounded-[12px] bg-white/[.05] px-3.5 py-2.5 text-[12px] text-white/65" data-charge-info>
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <Info size={14} strokeWidth={2} className={`flex-none ${assumptions.length ? "text-amber-300" : "text-white/50"}`} />
          <span className="min-w-0 flex-1 truncate">
            {/* Short enough for one line at every width; the full text is inside. */}
            {assumptions.length ? t("assumptionsCount", { count: assumptions.length }) : t("checkManual")}
          </span>
          <span className="flex-none text-[11px] font-semibold text-white/50 group-open:hidden">{t("showMore")}</span>
          <span className="hidden flex-none text-[11px] font-semibold text-white/50 group-open:inline">{t("showLess")}</span>
        </summary>
        <div className="mt-2 space-y-1.5 leading-[1.55]">
          {assumptions.length > 0 && (
            <p className="m-0 text-amber-100/90">
              {t("assumptionsLead")} {assumptions.join("; ")}. {t("assumptionsTail")}
            </p>
          )}
          <p className="m-0">{t("disclaimer")}</p>
        </div>
      </details>
    </motion.section>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "muted" | "bad" | "auto" }) {
  const cls = {
    ok: "bg-emerald-400/15 text-emerald-300",
    warn: "bg-amber-400/15 text-amber-200",
    muted: "bg-white/10 text-white/60",
    bad: "bg-rose-400/15 text-rose-300",
    auto: "bg-cyan-400/15 text-cyan-200",
  }[tone];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${cls}`}>{children}</span>;
}

function ProvenanceTag({ p }: { p: Provenance }) {
  const t = useTranslations("ChargeCalc");
  const map = { stated: ["ok", "srcStated"], inferred: ["warn", "srcInferred"], default: ["muted", "srcDefault"], missing: ["bad", "srcMissing"] } as const;
  const [tone, key] = map[p];
  return <Tag tone={tone}>{t(key)}</Tag>;
}

function Field({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  name,
  tag,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name: string;
  tag?: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={LABEL}>
        <span className="truncate">{label}</span>
        {tag}
      </span>
      <span className={FIELD}>
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          data-charge-field={name}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-white tabular-nums outline-none placeholder:text-white/35"
        />
        <span className="text-[11px] text-white/50">{suffix}</span>
      </span>
    </label>
  );
}
