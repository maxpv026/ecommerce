"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, Gauge, ShoppingCart, Thermometer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { isPurchasable } from "@/lib/waitlist";
import { PT_GASES, PT_MAX_C, PT_MIN_C, barAbsToPsig, saturationBarAbs } from "@/lib/refrigerantPT";
import type { StoreProduct } from "@/lib/data";
import type { ShowcaseItem } from "./HeroShowcase";
import { EYEBROW, ICON_TILE, MicroBadge, PRIMARY, ROW, ROW_ACTION_DONE, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SURFACE, SUMMARY_CARD, SectionHeader, Stepper, TrustChips, safetyTone } from "./ui";

/**
 * Engineering workbench — everything here is arithmetic in the browser:
 * no request, no model call, on load or on any interaction.
 *
 *   Left   saturation pressure of five refrigerants at one temperature
 *          (lib/refrigerantPT: Antoine fits to CoolProp, ±0.61 %).
 *   Right  an order + quota estimate for N cylinders of one catalog gas:
 *          net kg, t CO₂e (net kg × catalog GWP ÷ 1000, as the cart shows
 *          it), deposits, and the net total — then into the cart as one line.
 */

const PRESETS = [
  { t: -25, key: "presetFreeze" },
  { t: 0, key: "presetCooling" },
  { t: 7, key: "presetAc" },
  { t: 45, key: "presetCondense" },
] as const;

const MAX_CYLINDERS = 30;

export default function EngineeringWorkbench({ showcase }: { showcase: ShowcaseItem[] }) {
  const t = useTranslations("HomeDesktop");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [temp, setTemp] = useState(7);
  const [addedSku, setAddedSku] = useState<string | null>(null);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const num = (n: number, d = 1) => format.number(n, { minimumFractionDigits: d, maximumFractionDigits: d });
  const productOf = (mark: string | null) => (mark ? (showcase.find((s) => s.mark === mark)?.product ?? null) : null);

  const rows = PT_GASES.map((g) => {
    const bar = saturationBarAbs(g, temp);
    return { g, bar, psig: barAbsToPsig(bar), product: productOf(g.mark) };
  });
  const maxBar = Math.max(...rows.map((r) => r.bar));

  const flash = (sku: string) => {
    setAddedSku(sku);
    window.setTimeout(() => setAddedSku((s) => (s === sku ? null : s)), 1500);
  };
  const addOne = (p: StoreProduct, qty = 1) => {
    addItem({ sku: p.sku, name: p.name, variant: p.weightLabel, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: p.cylinderDeposit }, qty);
    flash(p.sku);
  };

  // ── Estimator ──
  const priced = showcase.filter((s) => s.product.pricePerKg > 0);
  const [estMark, setEstMark] = useState<string | null>(null);
  const est = priced.find((s) => s.mark === estMark) ?? priced.find((s) => isPurchasable(s.product)) ?? priced[0] ?? null;
  const [count, setCount] = useState(4);
  const p = est?.product ?? null;
  const canBuy = p ? isPurchasable(p) : false;
  const maxCount = p && canBuy ? Math.max(1, Math.min(MAX_CYLINDERS, p.stockQuantity)) : MAX_CYLINDERS;
  const n = Math.min(count, maxCount);
  const netKg = p ? p.weightKg * n : 0;
  const co2eT = p?.gwp ? (netKg * p.gwp) / 1000 : null;
  const gas = p ? p.cylinderPrice * n : 0;
  const deposit = p ? p.cylinderDeposit * n : 0;

  return (
    <section className="pt-16" data-home-section="workbench">
      <SectionHeader id="workbench" title={t("benchTitle")} meta={[t("benchMeta1"), t("benchMeta2"), t("benchMeta3")]} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ── Left: P-T comparator ── */}
        <div className={`min-w-0 lg:col-span-8 ${SURFACE}`} data-pt-surface>
          <div className="border-b border-slate-900/[.06] px-5 py-5 dark:border-white/[.06]">
            <div className="flex items-start gap-4">
              <span className={ICON_TILE}>
                <Gauge size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{t("ptTitle")}</h3>
                <p className="m-0 mt-1 text-[12.5px] text-slate-500 dark:text-ink-muted">{t("ptSubtitle")}</p>
              </div>
              <div className="flex-none text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("ptTemp")}</div>
                <div className="text-[26px] font-semibold tabular-nums tracking-[-.04em]" data-pt-temp>
                  {temp > 0 ? "+" : ""}
                  {temp} °C
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Thermometer size={15} strokeWidth={2} className="flex-none text-slate-400" />
              <span className="w-12 flex-none text-right text-[11.5px] tabular-nums text-slate-400">{PT_MIN_C} °C</span>
              <input
                type="range"
                min={PT_MIN_C}
                max={PT_MAX_C}
                step={1}
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value))}
                aria-label={t("ptTemp")}
                data-pt-slider
                className="h-2 min-w-0 flex-1 cursor-pointer accent-blue-700"
              />
              <span className="w-12 flex-none text-[11.5px] tabular-nums text-slate-400">+{PT_MAX_C} °C</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" data-pt-presets>
              {PRESETS.map((pr) => (
                <button
                  key={pr.key}
                  type="button"
                  onClick={() => setTemp(pr.t)}
                  aria-pressed={temp === pr.t}
                  data-pt-preset={pr.t}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                    temp === pr.t
                      ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900"
                      : "border-slate-900/[.1] bg-slate-50 text-slate-700 hover:bg-white dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-300 dark:hover:bg-white/[.08]"
                  }`}
                >
                  {t(pr.key)}
                </button>
              ))}
            </div>
          </div>

          {/* Column heads */}
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_.75fr_.6fr_auto] gap-4 border-b border-slate-900/[.06] bg-slate-900/[.015] px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:border-white/[.06] dark:bg-white/[.02] dark:text-ink-muted">
            <span>{t("colGas")}</span>
            <span>{t("colPressure")}</span>
            <span>{t("colBoiling")}</span>
            <span>GWP</span>
            <span className="w-[176px] text-right">{t("colAction")}</span>
          </div>
          {rows.map(({ g, bar, psig, product }) => {
            const gwp = product?.gwp ?? g.gwpFallback ?? null;
            return (
              <div key={g.label} className={`${ROW} grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_.75fr_.6fr_auto] items-center gap-4`} data-pt-row={g.label}>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[14.5px] font-semibold tracking-[-.02em]">{g.label}</span>
                  <MicroBadge tone={safetyTone(g.safety)}>{g.safety}</MicroBadge>
                  {!product && <MicroBadge>{t("notStocked")}</MicroBadge>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[16px] font-semibold tabular-nums tracking-[-.03em]" data-pt-bar>
                      {num(bar, 2)}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-ink-muted">{t("barAbs")}</span>
                    <span className="ml-1 text-[11.5px] tabular-nums text-slate-500 dark:text-ink-muted" data-pt-psig>
                      {num(psig, 0)} psig
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-900/[.07] dark:bg-white/[.08]" aria-hidden>
                    <span className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-[width] duration-300" style={{ width: `${(bar / maxBar) * 100}%` }} />
                  </div>
                </div>
                <span className="text-[13px] tabular-nums text-slate-700 dark:text-slate-300" data-pt-nbp>
                  {num(g.nbpC, 1)} °C
                </span>
                <span className="text-[13px] tabular-nums text-slate-700 dark:text-slate-300">{gwp !== null ? format.number(gwp) : "—"}</span>
                <div className="flex w-[176px] justify-end gap-1.5">
                  {product ? (
                    <>
                      {isPurchasable(product) && (
                        <button type="button" onClick={() => addOne(product)} data-pt-add={product.sku} className={addedSku === product.sku ? ROW_ACTION_DONE : ROW_ACTION_PRIMARY}>
                          {addedSku === product.sku ? <Check size={13} strokeWidth={2.6} /> : <ShoppingCart size={13} strokeWidth={2.2} />}
                          {addedSku === product.sku ? t("added") : t("toCart")}
                        </button>
                      )}
                      <Link href={product.pdpHref} className={ROW_ACTION_GHOST} data-pt-view={product.sku}>
                        {t("view")}
                      </Link>
                    </>
                  ) : (
                    <span className="text-[12px] text-slate-400 dark:text-ink-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="border-t border-slate-900/[.06] bg-slate-900/[.015] px-5 py-3 text-[11.5px] leading-[1.5] text-slate-500 dark:border-white/[.06] dark:bg-white/[.02] dark:text-ink-muted" data-pt-footnote>
            {t("ptFootnote", { err: format.number(Math.max(...PT_GASES.map((x) => x.maxErrPct)), { maximumFractionDigits: 1 }) })}
          </div>
        </div>

        {/* ── Right: order & quota estimator ── */}
        <aside className="min-w-0 lg:col-span-4" data-estimator>
          <div className={SUMMARY_CARD}>
            <h3 className={EYEBROW}>{t("estEyebrow")}</h3>
            {p ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("estGas")} data-est-gases>
                  {priced.map((s) => {
                    const on = s.mark === est?.mark;
                    return (
                      <button
                        key={s.mark}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setEstMark(s.mark)}
                        data-est-gas={s.mark}
                        className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                          on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.1] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.12] dark:text-slate-300 dark:hover:bg-white/[.06]"
                        }`}
                      >
                        {s.product.type}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 truncate text-[12px] text-slate-500 dark:text-ink-muted" data-est-product>
                  {p.name} · {p.weightLabel} · {t("perKgPrice", { price: eur(p.pricePerKg) })}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("estCount")}</span>
                  <Stepper value={n} onChange={setCount} max={maxCount} decreaseLabel={t("qtyDecrease")} increaseLabel={t("qtyIncrease")} data-est-count />
                </div>
                <input
                  type="range"
                  min={1}
                  max={maxCount}
                  value={n}
                  onChange={(e) => setCount(Number(e.target.value))}
                  aria-label={t("estCount")}
                  data-est-slider
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-700"
                />

                <dl className="m-0 mt-4 flex flex-col gap-2.5 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("estNet")}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-est-net>
                      {format.number(netKg, { maximumFractionDigits: 2 })} kg
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("estQuota")}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-est-co2e>
                      {co2eT !== null ? t("co2eTonnes", { value: format.number(co2eT, { maximumFractionDigits: 2 }) }) : "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("estGasSubtotal")}</dt>
                    <dd className="m-0 font-semibold tabular-nums">{eur(gas)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600 dark:text-ink-muted">{t("estDeposit")}</dt>
                    <dd className="m-0 font-semibold tabular-nums" data-est-deposit>
                      {eur(deposit)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-slate-900/[.08] pt-4 dark:border-white/[.08]">
                  <span className="text-[15px] font-semibold tracking-[-.02em]">{t("estTotal")}</span>
                  <span className="text-[28px] font-semibold tabular-nums tracking-[-.04em]" data-est-total>
                    {eur(gas + deposit)}
                  </span>
                </div>
                <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">{t("estNote")}</p>

                <button type="button" disabled={!canBuy} onClick={() => addOne(p, n)} data-est-add className={`mt-4 ${PRIMARY} ${addedSku === p.sku ? "!bg-emerald-600" : ""}`}>
                  {addedSku === p.sku ? <Check size={17} strokeWidth={2.4} /> : null}
                  {addedSku === p.sku ? t("added") : canBuy ? t("estAdd") : t("estUnavailable")}
                  {canBuy && addedSku !== p.sku && <ArrowRight size={17} strokeWidth={2} />}
                </button>
              </>
            ) : (
              <p className="m-0 mt-3 text-[13px] text-slate-500 dark:text-ink-muted">{t("estUnavailable")}</p>
            )}
            <TrustChips />
          </div>
        </aside>
      </div>
    </section>
  );
}
