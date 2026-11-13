"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, Calculator, Check, FileText, Loader2, RotateCw, Search, Truck, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { calculateCharge, type ChargeCalculation } from "@/lib/actions/chargeCalculator";
import CalculatedChargeCard from "@/components/CalculatedChargeCard";
import SmartOrderButton from "@/components/smartOrder/SmartOrderButton";
import { buildOrderTracking } from "@/lib/tracking";
import { STAGE_SEQUENCE } from "@/lib/shipping/carriers";
import { cartLineFromOrderItem, useCartStore } from "@/lib/store/cart";
import { isPurchasable } from "@/lib/waitlist";
import { cylinderGasPrice } from "@/lib/pricing";
import type { MarketAlertData, StoreProduct, UserOrder } from "@/lib/data";
import type { ShowcaseItem } from "./HeroShowcase";
import {
  EYEBROW,
  ICON_TILE,
  MicroBadge,
  PRIMARY,
  ROW,
  ROW_ACTION_DONE,
  ROW_ACTION_GHOST,
  ROW_ACTION_PRIMARY,
  SECONDARY,
  SURFACE,
  SUMMARY_CARD,
  SectionHeader,
  Stepper,
  safetyTone,
  stockBadge,
} from "./ui";

const CALC_CHIP_KEYS = ["example1", "example2", "example3"] as const;

/** Dashboard-namespace label for each stage. */
const STAGE_KEY = {
  ORDER_PLACED: "stageOrderPlaced",
  ADR_PACKING: "stageAdrPacking",
  DISPATCHED: "dispatched",
  IN_TRANSIT: "inTransit",
  OUT_FOR_DELIVERY: "stageOutForDelivery",
  READY_FOR_PICKUP: "stageReadyForPickup",
  DELIVERED: "delivered",
  COLLECTED: "stageCollected",
} as const;

/** The safety data sheets with a quick-open pill (files in public/sds). */
const SDS_QUICK = ["R-32", "R-134a", "R-410A"] as const;

/** Gases on the price index, in order. */
const INDEX_MARKS = ["R32", "R134a", "R410A", "R404A"] as const;

const Shimmer = ({ className }: { className: string }) => <span aria-hidden className={`block animate-pulse rounded-md bg-slate-900/[.07] dark:bg-white/[.08] ${className}`} />;

export interface OperationsSectionProps {
  showcase: ShowcaseItem[];
  /** Every catalog product the page already holds — for badges on a reorder line. */
  known: StoreProduct[];
  latestOrder: UserOrder | null;
  ownDataLoading: boolean;
  alerts: MarketAlertData[];
  sdsCount: number;
}

export default function OperationsSection({ showcase, known, latestOrder, ownDataLoading, alerts, sdsCount }: OperationsSectionProps) {
  const t = useTranslations("HomeDesktop");
  const td = useTranslations("Dashboard");
  const tc = useTranslations("ChargeCalc");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });

  // ── Charge calculator: presets and standard sentences are parsed on the
  // server without a model call (lib/chargeFastPath); the worked result
  // then recomputes in the browser (CalculatedChargeCard).
  const [calcQuery, setCalcQuery] = useState("");
  const [calc, setCalc] = useState<ChargeCalculation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcPending, startCalc] = useTransition();
  const runCalc = (query: string) => {
    if (!query.trim() || calcPending) return;
    setCalcError(null);
    startCalc(async () => {
      const result = await calculateCharge(query).catch(() => null);
      if (result?.ok) setCalc(result.calc);
      else {
        setCalc(null);
        const field = result && !result.ok && result.field ? tc(`field_${result.field}`) : "";
        setCalcError(tc(`error_${result?.code ?? "UNAVAILABLE"}`, { field }));
      }
    });
  };

  // ── Quick reorder: the last order's first line, else a featured cylinder.
  const bySku = new Map([...known, ...showcase.map((s) => s.product)].map((p) => [p.sku, p]));
  const lastItem = latestOrder?.items[0] ?? null;
  const featured = showcase.find((s) => isPurchasable(s.product))?.product ?? null;
  const reorderLine = lastItem
    ? cartLineFromOrderItem(lastItem)
    : featured
      ? { sku: featured.sku, name: featured.name, variant: featured.weightLabel, pricePerKg: featured.pricePerKg, weightKg: featured.weightKg, deposit: featured.cylinderDeposit }
      : null;
  const reorderProduct = reorderLine ? (bySku.get(reorderLine.sku) ?? null) : null;
  const [reorderQty, setReorderQty] = useState<number | null>(null);
  const qty = reorderQty ?? lastItem?.quantity ?? 1;
  const [reordered, setReordered] = useState(false);
  const reorderBlocked = reorderProduct !== null && !isPurchasable(reorderProduct);
  const reorder = () => {
    if (!reorderLine || reorderBlocked) return;
    addItem(reorderLine, qty);
    setReordered(true);
    window.setTimeout(() => setReordered(false), 1600);
  };

  // ── Track: the same view as the order page, minus the live carrier call.
  const shipment = latestOrder ? buildOrderTracking({ order: latestOrder.shipment, dhl: null }) : null;
  const stageLabel = shipment ? td(STAGE_KEY[shipment.method === "PICKUP" && shipment.stage === "DELIVERED" ? "COLLECTED" : shipment.stage]) : "";
  const sequence = shipment ? STAGE_SEQUENCE[shipment.method] : [];
  const stagePos = shipment ? Math.max(0, sequence.indexOf(shipment.stage)) : 0;
  // Four milestones, whatever the method's sequence length.
  const filled = shipment ? Math.max(1, Math.round(((stagePos + 1) / sequence.length) * 4)) : 0;
  const eta = latestOrder ? format.dateTime(new Date(shipment?.estimatedDelivery ?? latestOrder.estimatedDelivery), { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const carrierLine = shipment
    ? shipment.method === "PICKUP"
      ? td("methodPickup")
      : shipment.method === "OWN_FLEET"
        ? [td("methodOwnFleet"), shipment.fleet?.vehiclePlate].filter(Boolean).join(" · ")
        : shipment.carrier?.trackingNumber
          ? [shipment.carrier.name, shipment.carrier.trackingNumber].filter(Boolean).join(" · ")
          : null
    : null;

  const indexRows = INDEX_MARKS.map((m) => showcase.find((s) => s.mark === m)).filter((s): s is ShowcaseItem => Boolean(s));

  return (
    <section id="bento" className="scroll-mt-24 pt-16" data-home-section="operations">
      <SectionHeader
        id="operations"
        title={t("opsTitle")}
        meta={[t("opsLead")]}
        actions={
          <>
            <SmartOrderButton variant="pill" source="dashboard" label={t("importBom")} className="min-h-[38px] px-3.5" />
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ── Left: one divided surface ── */}
        <div className={`min-w-0 lg:col-span-8 ${SURFACE}`} data-ops-surface>
          {/* Zone 1 · charge calculator */}
          <div className="border-b border-slate-900/[.06] px-5 py-5 dark:border-white/[.06]" data-calculator-card={calc ? "result" : "idle"}>
            <div className="flex items-start gap-4">
              <span className={ICON_TILE}>
                <Calculator size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-[17px] font-semibold tracking-[-.025em]">{td("chargeCalculatorTitle")}</h3>
                  <MicroBadge tone="info">{t("calculatorTag")}</MicroBadge>
                </div>
                <p className="m-0 mt-1 max-w-[560px] text-[12.5px] leading-[1.55] text-slate-500 dark:text-ink-muted">{td("chargeCalculatorBody")}</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runCalc(calcQuery);
              }}
              className="mt-4 flex h-12 items-center gap-2.5 rounded-[14px] border border-slate-900/[.12] bg-white pl-4 pr-1.5 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/15 dark:border-white/[.14] dark:bg-white/[.04]"
            >
              <Search className="h-4 w-4 flex-none text-slate-400" />
              <input
                value={calcQuery}
                onChange={(e) => setCalcQuery(e.target.value)}
                placeholder={t("calculatorPlaceholder")}
                data-calc-input
                className="min-w-0 flex-1 bg-transparent text-[13.5px] tracking-tight outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!calcQuery.trim() || calcPending}
                data-calc-submit
                className="flex h-9 flex-none items-center gap-2 rounded-[11px] bg-blue-700 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
              >
                {calcPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {calcPending ? tc("calculating") : t("calculatorButton")}
              </button>
            </form>
            {!calc && (
              <div className="mt-3 flex flex-wrap gap-2" data-calc-presets>
                {CALC_CHIP_KEYS.map((key) => tc(key)).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCalcQuery(c);
                      runCalc(c);
                    }}
                    className="inline-flex h-8 items-center rounded-full border border-slate-900/[.1] bg-slate-50 px-3 font-mono text-[11.5px] tracking-[-.01em] text-slate-700 transition-colors hover:border-blue-600/30 hover:bg-white dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-300 dark:hover:bg-white/[.08]"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {calcError && (
              <p role="alert" data-calc-error className="m-0 mt-3 text-[12.5px] text-red-600 dark:text-red-300">
                {calcError}
              </p>
            )}
            {calc && <CalculatedChargeCard key={calc.query} calc={calc} onClose={() => setCalc(null)} className="mt-4" />}
          </div>

          {/* Zone 2 · operations rows */}
          {/* Quick reorder */}
          <div className={`${ROW} grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4`} data-ops-card="reorder">
            <span className={ICON_TILE}>
              <RotateCw size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-[-.02em]">{t("reorderTitle")}</div>
              {reorderLine ? (
                <>
                  <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
                    {reorderLine.name} · {reorderLine.variant}
                    {latestOrder ? ` · ${t("reorderFrom", { number: latestOrder.orderNumber })}` : ` · ${t("reorderFeatured")}`}
                  </div>
                  {reorderProduct && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {reorderProduct.gwpClass !== "n/a" && <MicroBadge tone={safetyTone(reorderProduct.gwpClass)}>{reorderProduct.gwpClass}</MicroBadge>}
                      {reorderProduct.gwp !== null && <MicroBadge>GWP {reorderProduct.gwp}</MicroBadge>}
                      <MicroBadge tone={stockBadge(reorderProduct).tone}>{t(stockBadge(reorderProduct).key)}</MicroBadge>
                    </div>
                  )}
                </>
              ) : ownDataLoading ? (
                <Shimmer className="mt-1.5 h-3.5 w-48" />
              ) : (
                <div className="mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">{t("noOrdersYet")}</div>
              )}
            </div>
            {reorderLine && (
              <div className="flex items-center gap-3">
                <Stepper value={qty} onChange={setReorderQty} decreaseLabel={t("qtyDecrease")} increaseLabel={t("qtyIncrease")} data-reorder-qty />
                <div className="w-[92px] text-right">
                  <div className="text-[14.5px] font-semibold tabular-nums tracking-[-.02em]" data-reorder-price>
                    {eur(cylinderGasPrice(reorderLine.pricePerKg, reorderLine.weightKg) * qty)}
                  </div>
                  {reorderLine.deposit > 0 && <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{t("plusDeposit", { amount: eur(reorderLine.deposit * qty) })}</div>}
                </div>
                <button type="button" onClick={reorder} disabled={reorderBlocked} data-reorder-add className={reordered ? ROW_ACTION_DONE : ROW_ACTION_PRIMARY}>
                  {reordered ? <Check size={14} strokeWidth={2.6} /> : null}
                  {reordered ? t("added") : reorderBlocked ? t("outOfStock") : t("reorderCtaShort")}
                  {!reordered && !reorderBlocked && <ArrowRight size={14} strokeWidth={2.4} />}
                </button>
              </div>
            )}
          </div>

          {/* Track delivery */}
          <div className={`${ROW} grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4`} data-ops-card="track">
            <span className={ICON_TILE}>
              <Truck size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-[-.02em]">{t("trackTitle")}</div>
              {latestOrder && shipment ? (
                <>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-slate-500 dark:text-ink-muted">
                    <span className="font-mono">{latestOrder.orderNumber}</span>
                    {carrierLine && <span className="truncate font-mono" data-track-carrier>· {carrierLine}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <MicroBadge tone="ok" data-track-stage={shipment.stage}>
                      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />
                      {stageLabel}
                    </MicroBadge>
                    <span className="flex items-center gap-1" aria-hidden data-track-progress={filled}>
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`h-1.5 w-6 rounded-full ${i < filled ? "bg-emerald-500" : "bg-slate-900/[.1] dark:bg-white/[.12]"}`} />
                      ))}
                    </span>
                    {shipment.stage !== "DELIVERED" && shipment.method !== "PICKUP" && eta && <MicroBadge>{t("etaLabel", { date: eta })}</MicroBadge>}
                  </div>
                </>
              ) : ownDataLoading ? (
                <Shimmer className="mt-1.5 h-3.5 w-40" />
              ) : (
                <div className="mt-0.5 text-[12px] text-slate-500 dark:text-ink-muted">{t("trackNone")}</div>
              )}
            </div>
            <Link href={latestOrder ? `/profile/orders/${latestOrder.id}` : "/products"} className={ROW_ACTION_GHOST} data-track-link>
              {latestOrder ? t("trackDetails") : td("exploreProductsCta")}
              <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </div>

          {/* Smart bulk order */}
          <div className={`${ROW} grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4`} data-ops-card="bulk">
            <span className={ICON_TILE}>
              <Upload size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-[-.02em]">{t("bulkTitle")}</div>
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">{t("bulkSubtitle")}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["CSV", "XLSX", "PDF"].map((f) => (
                  <MicroBadge key={f}>{f}</MicroBadge>
                ))}
              </div>
            </div>
            <SmartOrderButton variant="pill" source="dashboard" label={t("bulkOpen")} className="min-h-[36px] px-3.5 text-[12.5px]" />
          </div>

          {/* SDS library */}
          <div className={`${ROW} grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4`} data-ops-card="sds">
            <span className={ICON_TILE}>
              <FileText size={17} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-[-.02em]">{t("sdsTitle")}</div>
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">{td("sdsLibraryCount", { count: sdsCount })}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SDS_QUICK.map((gas) => (
                  <a
                    key={gas}
                    href={`/sds/${gas}-SDS.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-sds-quick={gas}
                    className="inline-flex items-center gap-0.5 rounded-full border border-blue-600/20 bg-blue-600/[.06] px-2 py-px text-[10.5px] font-semibold text-blue-800 transition-colors hover:bg-blue-600/[.12] dark:border-blue-400/25 dark:bg-blue-500/[.1] dark:text-blue-200"
                  >
                    {t("sdsPill", { gas })}
                    <ArrowUpRight size={11} strokeWidth={2.4} />
                  </a>
                ))}
              </div>
            </div>
            <Link href="/compliance/sds" className={ROW_ACTION_GHOST} data-sds-all>
              {t("sdsAll")}
              <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </div>
        </div>

        {/* ── Right: monolithic summary card ── */}
        <aside className="min-w-0 lg:col-span-4" data-ops-summary>
          <div className={SUMMARY_CARD}>
            <h3 className={EYEBROW}>{t("hubEyebrow")}</h3>

            {/* Price index — catalog €/kg and stock, one row per gas */}
            <div className="mt-3 flex items-baseline justify-between text-[11px] text-slate-400 dark:text-ink-muted">
              <span>{t("indexCaption")}</span>
              <span>{t("perKgShort")}</span>
            </div>
            <ul className="m-0 mt-1.5 list-none divide-y divide-slate-900/[.06] p-0 dark:divide-white/[.06]" data-price-index>
              {indexRows.map(({ mark, product: p }) => {
                const stock = stockBadge(p);
                return (
                  <li key={mark}>
                    <Link
                      href={{ pathname: "/products", query: { gasType: mark } }}
                      data-price-row={mark}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-slate-900/[.03] dark:hover:bg-white/[.04]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-[13.5px] font-semibold tracking-[-.015em]">{p.type}</span>
                        {p.gwpClass !== "n/a" && <MicroBadge tone={safetyTone(p.gwpClass)}>{p.gwpClass}</MicroBadge>}
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <MicroBadge tone={stock.tone}>{t(stock.key)}</MicroBadge>
                        <span className="w-[64px] text-right text-[13.5px] font-semibold tabular-nums">{p.pricePerKg > 0 ? format.number(p.pricePerKg, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Industry feed — the newest three */}
            {alerts.length > 0 && (
              <div className="mt-4 border-t border-slate-900/[.07] pt-3.5 dark:border-white/[.07]" data-ops-news>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("newsTitle")}</div>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {alerts.slice(0, 3).map((a) => (
                    <li key={a.id}>
                      <a href={a.link} target="_blank" rel="noopener noreferrer" className="group block" data-ops-news-item>
                        <span className="line-clamp-2 text-[12.5px] font-semibold leading-[1.4] tracking-[-.01em] group-hover:text-blue-700 dark:group-hover:text-blue-400">{a.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-400 dark:text-ink-muted">
                          <span className={a.tone === "warning" ? "font-semibold text-orange-600 dark:text-orange-400" : "font-semibold text-emerald-700 dark:text-emerald-400"}>{td(TAG_KEY[a.tag])}</span>
                          <span aria-hidden>·</span>
                          <span className="truncate">{a.source}</span>
                          {a.publishedAt && (
                            <>
                              <span aria-hidden>·</span>
                              <time dateTime={a.publishedAt} className="flex-none">
                                {format.dateTime(new Date(a.publishedAt), { day: "numeric", month: "short", timeZone: "UTC" })}
                              </time>
                            </>
                          )}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link href="/hub" className={`mt-4 ${PRIMARY}`} data-ops-hub>
              {t("openHub")}
              <ArrowRight size={17} strokeWidth={2} />
            </Link>
            <Link href="/profile/settings" className={`mt-2 ${SECONDARY}`} data-ops-alerts>
              {t("managePriceAlerts")}
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

const TAG_KEY: Record<MarketAlertData["tag"], string> = {
  REGULATION: "tagRegulation",
  PRICE_TREND: "tagPriceTrend",
  SUPPLY: "tagSupply",
  INDUSTRY_NEWS: "tagIndustryNews",
};
