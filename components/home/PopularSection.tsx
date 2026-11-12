"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Bell, Check, Package, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ProductThumbnail from "@/components/ProductThumbnail";
import { useCartStore } from "@/lib/store/cart";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";
import { MicroBadge, PILL, PILL_ON, ROW_ACTION_DONE, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, SectionHeader, Stepper, safetyTone, stockBadge } from "./ui";

/**
 * Popular cylinders, at the cart's density: a compact card per product with
 * the same micro-badges as a cart line (safety class, GWP, t CO₂e per
 * cylinder, stock), €/kg with the cylinder price and deposit, and an inline
 * `- 1 +` so several cylinders go in with one click.
 */

const TABS = ["all", "lowGwp", "standard", "equipment"] as const;
type Tab = (typeof TABS)[number];

const inTab = (p: StoreProduct, tab: Tab) =>
  tab === "all"
    ? true
    : tab === "lowGwp"
      ? p.gwpClass === "A2L" || p.gwpClass === "A3"
      : tab === "standard"
        ? p.gwpClass === "A1"
        : p.category === "equipment" || p.category === "recovery";

/** Same tint rule as the cart lines: A2L emerald, A1 cyan, rest blue. */
const tintFor = (p: StoreProduct) => (p.gwpClass === "A2L" ? "#34d399" : p.gwpClass === "A1" ? "#22d3ee" : "#60a5fa");

const VISIBLE = 6;

export default function PopularSection({ products, onNotify }: { products: StoreProduct[]; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("HomeDesktop");
  const [tab, setTab] = useState<Tab>("all");
  const shown = products.filter((p) => inTab(p, tab)).slice(0, VISIBLE);
  const tabLabel: Record<Tab, string> = { all: t("tabAll"), lowGwp: t("tabLowGwp"), standard: t("tabStandard"), equipment: t("tabEquipment") };

  return (
    <section className="pt-16" data-home-section="popular">
      <SectionHeader
        id="popular"
        title={t("popularTitle")}
        meta={[t("popularMeta1"), t("popularMeta2")]}
        actions={
          <>
            <div role="tablist" aria-label={t("popularTitle")} className="flex flex-wrap items-center gap-2">
              {TABS.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-popular-tab={id} className={tab === id ? PILL_ON : PILL}>
                  {tabLabel[id]}
                  <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? "bg-white/15 dark:bg-slate-900/10" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>
                    {products.filter((p) => inTab(p, id)).length}
                  </span>
                </button>
              ))}
            </div>
            <Link href="/products" className={`${PILL} text-blue-700 dark:text-blue-400`} data-popular-catalog>
              {t("fullCatalog")}
              <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </>
        }
      />

      {shown.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-900/[.14] px-6 py-10 text-center text-[13px] text-slate-500 dark:border-white/[.14] dark:text-ink-muted" data-popular-empty>
          {t("emptyTab")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-popular-grid>
          {shown.map((p) => (
            <ProductTile key={p.id} p={p} onNotify={onNotify} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductTile({ p, onNotify }: { p: StoreProduct; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("HomeDesktop");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const purchasable = isPurchasable(p);
  const tint = tintFor(p);
  const stock = stockBadge(p);
  // Footprint of one cylinder: net kg × GWP — the cart's per-line figure.
  const co2eT = p.pricedPerKg && p.gwp ? (p.weightKg * p.gwp) / 1000 : null;
  const maxQty = Math.max(1, Math.min(99, p.stockQuantity || 1));

  const add = () => {
    addItem({ sku: p.sku, name: p.name, variant: p.weightLabel, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: p.cylinderDeposit }, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  return (
    <article
      className="flex flex-col rounded-[22px] border border-slate-900/[.08] bg-white/75 p-4 backdrop-blur-xl backdrop-saturate-150 transition-colors hover:border-slate-900/[.14] dark:border-white/[.08] dark:bg-white/[.03] dark:hover:border-white/[.16]"
      data-popular-card={p.sku}
    >
      <Link href={p.pdpHref} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3.5">
        <span className="relative h-16 w-16 overflow-hidden rounded-2xl border bg-slate-50 dark:bg-white/[.04]" style={{ borderColor: `${tint}55` }}>
          <ProductThumbnail
            sku={p.sku}
            name={p.name}
            sizes="64px"
            className="absolute inset-1.5"
            fallback={
              <span className="flex h-full w-full items-center justify-center rounded-xl" style={{ background: `${tint}1f` }}>
                <Package size={22} strokeWidth={1.8} style={{ color: tint }} />
              </span>
            }
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-.025em]">{p.name}</span>
          <span className="mt-0.5 block truncate text-[12px] text-slate-500 dark:text-ink-muted">
            {p.weightLabel} · <span className="font-mono">{p.sku}</span>
          </span>
        </span>
      </Link>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.gwpClass && p.gwpClass !== "n/a" && <MicroBadge tone={safetyTone(p.gwpClass)}>{p.gwpClass}</MicroBadge>}
        {p.gwp !== null && <MicroBadge>GWP {format.number(p.gwp)}</MicroBadge>}
        {co2eT !== null && <MicroBadge data-popular-co2e="">{t("co2eTonnes", { value: format.number(co2eT, { maximumFractionDigits: 2 }) })}</MicroBadge>}
        <MicroBadge tone={stock.tone}>{t(stock.key)}</MicroBadge>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-900/[.06] pt-3 dark:border-white/[.06]">
        <div className="min-w-0">
          {p.pricedPerKg ? (
            <>
              <div className="text-[18px] font-semibold tabular-nums tracking-[-.03em]" data-popular-price>
                {p.pricePerKg > 0 ? t("perKgPrice", { price: eur(p.pricePerKg) }) : t("priceOnRequest")}
              </div>
              {p.pricePerKg > 0 && (
                <div className="truncate text-[11.5px] text-slate-500 dark:text-ink-muted">
                  {eur(p.cylinderPrice)}
                  {p.cylinderDeposit > 0 && <span className="text-emerald-700 dark:text-emerald-400"> {t("plusDeposit", { amount: eur(p.cylinderDeposit) })}</span>}
                </div>
              )}
            </>
          ) : (
            <div className="text-[18px] font-semibold tabular-nums tracking-[-.03em]">{eur(p.pricePerKg)}</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {purchasable ? (
          <>
            <Stepper value={qty} onChange={setQty} max={maxQty} decreaseLabel={t("qtyDecrease")} increaseLabel={t("qtyIncrease")} data-popular-qty={p.sku} />
            <button type="button" onClick={add} data-popular-add={p.sku} className={`${added ? ROW_ACTION_DONE : ROW_ACTION_PRIMARY} h-9 flex-1`}>
              {added ? <Check size={14} strokeWidth={2.6} /> : <ShoppingCart size={14} strokeWidth={2.2} />}
              {added ? t("added") : t("addToCart")}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onNotify(p)} data-popular-notify={p.sku} className={`${ROW_ACTION_GHOST} h-9 flex-1`}>
            <Bell size={14} strokeWidth={2} />
            {t("notifyMe")}
          </button>
        )}
      </div>
    </article>
  );
}
