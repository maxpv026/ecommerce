"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Check, ShoppingCart, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import {
  LIQUID_LINE_SIZES,
  TYPICAL_G_PER_M,
  computeCharge,
  pickCylinders,
  round,
  type LiquidLineSize,
} from "@/lib/chargeCalc";
import type { ChargeCalculation, Provenance } from "@/lib/actions/chargeCalculator";

/**
 * The calculator's answer, as a worked calculation rather than prose.
 * Metric throughout: m, kg / g, g/m — the liquid line stays in inches.
 *
 * Every number is lib/chargeCalc's — the same function the server ran — and
 * recomputes as the engineer corrects an input. Each input says where it
 * came from (stated / inferred / default / missing) so nothing reads as more
 * certain than it is. The factory charge is a nameplate value: when it
 * wasn't given, the total waits for it instead of guessing.
 */

const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};

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

  // Editable inputs, as typed. Seeded from what the server read.
  const [lengthM, setLengthM] = useState(String(round(calc.lineSetLengthM, 1)));
  const [ratedM, setRatedM] = useState(String(round(calc.ratedLength.m, 1)));
  const [lineSize, setLineSize] = useState<LiquidLineSize>(calc.liquidLine.size);
  const [rate, setRate] = useState(calc.chargePerMeterG.value === null ? "" : String(round(calc.chargePerMeterG.value, 1)));
  const [factory, setFactory] = useState(calc.factoryChargeKg.value === null ? "" : String(round(calc.factoryChargeKg.value, 3)));
  const [basis, setBasis] = useState<"add" | "total">("add");
  const [added, setAdded] = useState(false);

  // Provenance follows edits: a touched field is the engineer's own.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const source = (key: string, original: Provenance): Provenance => (touched[key] ? "stated" : original);
  const touch = (key: string) => setTouched((t0) => ({ ...t0, [key]: true }));

  const inputs = {
    lineSetLengthM: num(lengthM),
    ratedLengthM: num(ratedM),
    chargePerMeterG: num(rate),
    factoryChargeKg: num(factory),
  };
  // Same bounds as the server's plausibility check.
  const valid =
    inputs.lineSetLengthM !== null && inputs.lineSetLengthM > 0 && inputs.lineSetLengthM <= 150 &&
    inputs.ratedLengthM !== null && inputs.ratedLengthM >= 0 && inputs.ratedLengthM <= 30 &&
    (inputs.chargePerMeterG === null || (inputs.chargePerMeterG >= 5 && inputs.chargePerMeterG <= 300)) &&
    (inputs.factoryChargeKg === null || (inputs.factoryChargeKg > 0 && inputs.factoryChargeKg <= 100));

  const result = useMemo(
    () =>
      valid
        ? computeCharge({
            lineSetLengthM: inputs.lineSetLengthM!,
            ratedLengthM: inputs.ratedLengthM!,
            chargePerMeterG: inputs.chargePerMeterG,
            factoryChargeKg: inputs.factoryChargeKg,
          })
        : null,
    [valid, inputs.lineSetLengthM, inputs.ratedLengthM, inputs.chargePerMeterG, inputs.factoryChargeKg]
  );

  const totalAvailable = result?.totalChargeKg !== null && result?.totalChargeKg !== undefined;
  const effectiveBasis = basis === "total" && totalAvailable ? "total" : "add";
  const neededKg = result ? (effectiveBasis === "total" ? result.totalChargeKg : result.extraChargeKg) : null;
  const pick = neededKg !== null && neededKg > 0 ? pickCylinders(neededKg, calc.cylinders) : null;

  const kg = (v: number) => `${format.number(round(v, 2), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
  // Grams to the nearest gram — what a charging scale reads.
  const g = (v: number) => `${format.number(Math.round(v * 1000))} g`;
  const m = (v: number) => `${format.number(round(v, 1), { maximumFractionDigits: 1 })} m`;
  const eur = (v: number) => format.number(v, { style: "currency", currency: "EUR" });

  const summary = [
    [calc.brand, calc.model].filter(Boolean).join(" ") || null,
    calc.capacity.asWritten,
    inputs.lineSetLengthM !== null ? t("lineSetM", { length: m(inputs.lineSetLengthM) }) : null,
    calc.refrigerant.label,
  ].filter(Boolean) as string[];

  const defaultsUsed = [
    !touched.rated && calc.ratedLength.source === "default" ? t("defaultRated", { length: m(calc.ratedLength.m) }) : null,
    !touched.line && calc.liquidLine.source === "default" ? t("defaultLine", { size: calc.liquidLine.size }) : null,
    !touched.rate && calc.chargePerMeterG.source === "default"
      ? t("defaultRate", { rate: calc.chargePerMeterG.value ?? 0, size: calc.liquidLine.size })
      : null,
  ].filter(Boolean) as string[];

  const addToCart = () => {
    if (!pick) return;
    const { option, qty } = pick;
    addItem(
      {
        sku: option.sku,
        name: option.name,
        variant: option.weightLabel,
        pricePerKg: option.pricePerKg,
        weightKg: option.weightKg,
        deposit: option.cylinderDeposit,
      },
      qty
    );
    setAdded(true);
    toast.success(t("addedToast", { qty, name: `${option.name} · ${option.weightLabel}` }));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      data-charge-card
      className={`relative overflow-hidden rounded-[24px] bg-card p-6 text-card-foreground shadow-card md:p-7 dark:border dark:border-hairline ${className}`}
    >
      {/* Heading + what was understood */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-accent text-accent-foreground">
          <Calculator size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[.09em] text-muted-foreground uppercase">{t("eyebrow")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold tracking-[-.02em]" data-charge-summary>
            {summary.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/60">•</span>}
                {part}
                {part === calc.refrigerant.label && calc.refrigerant.source === "inferred" && (
                  <Tag tone="warn">{t("srcInferred")}</Tag>
                )}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        {/* The worked calculation */}
        <div>
          <dl className="m-0 divide-y divide-border rounded-[16px] border border-border" data-charge-breakdown>
            <Row
              label={t("factoryLabel", { length: inputs.ratedLengthM !== null ? m(inputs.ratedLengthM) : "—" })}
              hint={source("factory", calc.factoryChargeKg.source) === "missing" ? t("factoryMissing") : undefined}
              value={inputs.factoryChargeKg !== null ? kg(inputs.factoryChargeKg) : "—"}
              tag={<ProvenanceTag p={source("factory", calc.factoryChargeKg.source)} />}
              dataKey="factory"
            />
            <Row
              label={t("extraLabel", { length: result ? m(result.extraLengthM) : "—" })}
              hint={
                result && inputs.chargePerMeterG !== null
                  ? t("extraFormula", { length: m(result.extraLengthM), rate: format.number(inputs.chargePerMeterG) })
                  : t("rateMissing", { size: lineSize })
              }
              value={result?.extraChargeKg != null ? g(result.extraChargeKg) : "—"}
              tag={<ProvenanceTag p={inputs.chargePerMeterG === null ? "missing" : source("rate", calc.chargePerMeterG.source)} />}
              dataKey="extra"
            />
          </dl>

          {/* The two answers */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Answer
              title={t("addOnSite")}
              note={t("addOnSiteNote")}
              kgValue={result?.extraChargeKg ?? null}
              kg={kg}
              g={g}
              dataKey="add"
            />
            <Answer
              title={t("totalCharge")}
              note={totalAvailable ? t("totalNote") : t("totalNeedsFactory")}
              kgValue={result?.totalChargeKg ?? null}
              kg={kg}
              g={g}
              emphasis
              dataKey="total"
            />
          </div>

          {(defaultsUsed.length > 0 || calc.refrigerant.source === "inferred") && (
            <div className="mt-4 flex gap-2.5 rounded-[14px] bg-amber-500/[.08] px-3.5 py-3 text-[12.5px] leading-[1.55] text-amber-900 dark:text-amber-200" data-charge-assumptions>
              <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 flex-none" />
              <span>
                {t("assumptionsLead")}{" "}
                {[...defaultsUsed, ...(calc.refrigerant.source === "inferred" ? [t("inferredRefrigerant", { gas: calc.refrigerant.label ?? "" })] : [])].join("; ")}.{" "}
                {t("assumptionsTail")}
              </span>
            </div>
          )}
          <p className="m-0 mt-3 text-[11.5px] leading-[1.55] text-muted-foreground">{t("disclaimer")}</p>
        </div>

        {/* Inputs + buy */}
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 grid grid-cols-2 gap-2.5 border-0 p-0" data-charge-inputs>
            <legend className="mb-2 text-[11px] font-semibold tracking-[.09em] text-muted-foreground uppercase">{t("adjust")}</legend>
            <Field label={t("fLength")} suffix="m" value={lengthM} onChange={(v) => { setLengthM(v); touch("length"); }} name="length" />
            <Field label={t("fRated")} suffix="m" value={ratedM} onChange={(v) => { setRatedM(v); touch("rated"); }} name="rated" />
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("fLine")}</span>
              <select
                value={lineSize}
                onChange={(e) => {
                  const size = e.target.value as LiquidLineSize;
                  setLineSize(size);
                  touch("line");
                  // A size change re-applies the typical rate if there is one,
                  // and clears it otherwise — never carries another size's figure over.
                  if (!touched.rate) setRate(TYPICAL_G_PER_M[size] !== undefined ? String(TYPICAL_G_PER_M[size]) : "");
                }}
                data-charge-field="line"
                className="h-10 w-full rounded-[11px] border border-input bg-card px-2.5 text-[13px] text-foreground outline-none focus:ring-[3px] focus:ring-ring"
              >
                {LIQUID_LINE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}″
                  </option>
                ))}
              </select>
            </label>
            <Field label={t("fRate")} suffix="g/m" value={rate} onChange={(v) => { setRate(v); touch("rate"); }} placeholder={t("fromManual")} name="rate" />
            <div className="col-span-2">
              <Field
                label={t("fFactory")}
                suffix="kg"
                value={factory}
                onChange={(v) => { setFactory(v); touch("factory"); }}
                placeholder={t("fromNameplate")}
                name="factory"
              />
            </div>
          </fieldset>
          {!valid && <p className="m-0 text-[12px] text-red-600 dark:text-red-400">{t("invalidInputs")}</p>}

          <div className="mt-auto rounded-[16px] border border-border p-4" data-charge-buy>
            {totalAvailable && (
              <div className="mb-3 inline-flex rounded-full bg-muted p-1 text-[12px] font-medium" role="radiogroup" aria-label={t("buyFor")}>
                {(["add", "total"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBasis === b}
                    onClick={() => { setBasis(b); setAdded(false); }}
                    className={`rounded-full px-3 py-1.5 transition-colors ${effectiveBasis === b ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {b === "add" ? t("buyAdd") : t("buyTotal")}
                  </button>
                ))}
              </div>
            )}

            {!calc.refrigerant.mark ? (
              <p className="m-0 text-[13px] text-muted-foreground">{t("noRefrigerant")}</p>
            ) : neededKg === null || neededKg <= 0 ? (
              <p className="m-0 text-[13px] text-muted-foreground">{neededKg === 0 ? t("nothingToAdd") : t("needRate")}</p>
            ) : pick ? (
              <>
                <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground" data-charge-pick>
                  {t("pickLine", { qty: pick.qty, size: pick.option.weightLabel, gas: calc.refrigerant.label ?? calc.refrigerant.mark, need: kg(neededKg) })}
                </p>
                <p className="m-0 mt-1 text-[15px] font-semibold text-foreground">
                  {pick.qty} × {pick.option.name} · {pick.option.weightLabel}
                  <span className="ml-2 text-[13px] font-medium text-muted-foreground">
                    {eur(pick.qty * Math.round(pick.option.pricePerKg * pick.option.weightKg * 100) / 100)} {t("exVat")}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={!valid}
                  data-charge-add
                  className={`mt-3.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-medium transition-colors disabled:opacity-50 ${
                    added ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary-hover"
                  }`}
                >
                  {added ? <Check size={16} strokeWidth={2.4} /> : <ShoppingCart size={16} strokeWidth={2} />}
                  {added ? t("added") : t("addToCart", { qty: pick.qty, size: pick.option.weightLabel })}
                </button>
              </>
            ) : (
              <p className="m-0 text-[13px] text-muted-foreground">{t("noStock", { gas: calc.refrigerant.label ?? calc.refrigerant.mark })}</p>
            )}

            {calc.refrigerant.mark && (
              <Link
                href={{ pathname: "/products", query: { gasType: calc.refrigerant.mark } }}
                data-charge-find
                className="mt-2.5 flex h-10 w-full items-center justify-center rounded-full border border-primary/25 text-[13px] font-medium text-primary hover:border-primary dark:border-blue-400/30 dark:text-blue-300"
              >
                {t("findCylinders", { gas: calc.refrigerant.label ?? calc.refrigerant.mark })}
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function Row({ label, hint, value, tag, dataKey }: { label: string; hint?: string; value: string; tag: React.ReactNode; dataKey?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5" data-charge-row={dataKey}>
      <div className="min-w-0">
        <dt className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-foreground">
          {label} {tag}
        </dt>
        {hint && <div className="mt-0.5 text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      <dd className="m-0 flex-none text-right text-[14px] font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Answer({
  title,
  note,
  kgValue,
  kg,
  g,
  emphasis = false,
  dataKey,
}: {
  title: string;
  note: string;
  kgValue: number | null;
  kg: (v: number) => string;
  g: (v: number) => string;
  emphasis?: boolean;
  dataKey: string;
}) {
  return (
    <div
      data-charge-answer={dataKey}
      className={`rounded-[16px] px-4 py-3.5 ${emphasis ? "bg-primary/[.06] ring-1 ring-primary/15 dark:bg-blue-400/[.08] dark:ring-blue-400/20" : "bg-muted"}`}
    >
      <div className="text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">{title}</div>
      {kgValue !== null ? (
        <div className="mt-1.5">
          <span className="text-[24px] font-bold tracking-[-.035em] text-foreground tabular-nums">{kg(kgValue)}</span>
          <span className="ml-2 text-[15px] font-semibold text-muted-foreground tabular-nums">{g(kgValue)}</span>
        </div>
      ) : (
        <div className="mt-1.5 text-[24px] font-bold tracking-[-.035em] text-muted-foreground/60">—</div>
      )}
      <div className="mt-1 text-[11.5px] leading-[1.45] text-muted-foreground">{note}</div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "muted" | "bad" }) {
  const cls = {
    ok: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    muted: "bg-muted text-muted-foreground",
    bad: "bg-red-500/10 text-red-700 dark:text-red-400",
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>{children}</span>;
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
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="flex h-10 items-center rounded-[11px] border border-input bg-card pr-2.5 focus-within:ring-[3px] focus-within:ring-ring">
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          data-charge-field={name}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-foreground tabular-nums outline-none placeholder:text-muted-foreground/70"
        />
        <span className="text-[11.5px] text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}
