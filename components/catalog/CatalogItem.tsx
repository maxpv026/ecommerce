"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, Check, Package, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ProductThumbnail from "@/components/ProductThumbnail";
import FavoriteButton from "@/components/FavoriteButton";
import { MicroBadge, ROW_ACTION_DONE, ROW_ACTION_GHOST, ROW_ACTION_PRIMARY, Stepper, safetyTone, stockBadge } from "@/components/home/ui";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { isPurchasable } from "@/lib/waitlist";
import type { StoreProduct } from "@/lib/data";

/**
 * One catalog product, two layouts — the grid card and the cart-identical
 * table row — sharing the same quantity, add-to-cart and badge logic, so a
 * figure can never differ between the two views. The card shows two badges
 * (safety, GWP) and the price; the table row adds stock and the deposit
 * line; footprint and purity are on the product page and in the cart.
 */

/** Same tint rule as the cart lines: A2L emerald, A1 cyan, rest blue. */
const tintFor = (p: StoreProduct) => (p.gwpClass === "A2L" ? "#34d399" : p.gwpClass === "A1" ? "#22d3ee" : p.gwpClass === "A3" ? "#f59e0b" : "#60a5fa");

function useCatalogItem(p: StoreProduct) {
  const addItem = useCartStore((s) => s.addItem);
  const inCartQty = useCartStore((s) => s.items.find((i) => i.sku === p.sku)?.qty ?? 0);
  const hydrated = useHydrated();
  const [qty, setQty] = useState(1);
  const [flash, setFlash] = useState(false);
  const purchasable = isPurchasable(p);
  const maxQty = Math.max(1, Math.min(99, p.stockQuantity || 1));
  const add = () => {
    if (!purchasable) return;
    addItem({ sku: p.sku, name: p.name, variant: p.weightLabel, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: p.cylinderDeposit }, qty);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return { qty, setQty, add, flash, purchasable, maxQty, inCart: hydrated ? inCartQty : 0 };
}

function Thumb({ p, size = 64 }: { p: StoreProduct; size?: number }) {
  const tint = tintFor(p);
  return (
    <span className="relative block flex-none overflow-hidden rounded-2xl border bg-slate-50 dark:bg-white/[.04]" style={{ width: size, height: size, borderColor: `${tint}55` }}>
      <ProductThumbnail
        sku={p.sku}
        name={p.name}
        sizes={`${size}px`}
        className="absolute inset-1.5"
        fallback={
          <span className="flex h-full w-full items-center justify-center rounded-xl" style={{ background: `${tint}1f` }}>
            <Package size={22} strokeWidth={1.8} style={{ color: tint }} />
          </span>
        }
      />
    </span>
  );
}

function Badges({ p, purity = true }: { p: StoreProduct; purity?: boolean }) {
  const t = useTranslations("Products");
  const format = useFormatter();
  const stock = stockBadge(p);
  return (
    <div className="flex flex-wrap gap-1.5" data-item-badges>
      {p.gwpClass && p.gwpClass !== "n/a" && <MicroBadge tone={safetyTone(p.gwpClass)}>{p.gwpClass}</MicroBadge>}
      {p.gwp !== null && <MicroBadge>GWP {format.number(p.gwp)}</MicroBadge>}
      {purity && p.purity !== null && <MicroBadge>{t("purityBadge", { value: format.number(p.purity, { maximumFractionDigits: 2 }) })}</MicroBadge>}
      <MicroBadge tone={stock.tone}>{t(stock.key)}</MicroBadge>
    </div>
  );
}

function AddButton({ item, className = "" }: { item: ReturnType<typeof useCatalogItem>; className?: string }) {
  const t = useTranslations("Products");
  return (
    <button type="button" onClick={item.add} data-item-add data-item-flash={item.flash ? "true" : undefined} className={`${item.flash ? ROW_ACTION_DONE : ROW_ACTION_PRIMARY} ${className}`}>
      {item.flash ? <Check size={14} strokeWidth={2.6} /> : <ShoppingCart size={14} strokeWidth={2.2} />}
      {item.flash ? t("inCartFlash") : t("toCart")}
    </button>
  );
}

function PriceLines({ p, align = "left" }: { p: StoreProduct; align?: "left" | "right" }) {
  const t = useTranslations("Products");
  const format = useFormatter();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const right = align === "right" ? "text-right" : "";
  if (!p.pricedPerKg) {
    return (
      <div className={right}>
        <div className="text-[17px] font-semibold tabular-nums tracking-[-.03em]" data-item-total>
          {eur(p.pricePerKg)}
        </div>
        <div className="text-[11.5px] text-slate-500 dark:text-ink-muted">{t("exVatShort")}</div>
      </div>
    );
  }
  if (p.pricePerKg <= 0) return <div className={`text-[14px] font-semibold ${right}`}>{t("priceOnRequest")}</div>;
  return (
    <div className={`min-w-0 ${right}`}>
      <div className="text-[17px] font-semibold tabular-nums tracking-[-.03em]" data-item-total>
        {eur(p.cylinderPrice)}
      </div>
      <div className="truncate text-[11.5px] leading-[1.45] text-slate-500 tabular-nums dark:text-ink-muted" data-item-perkg>
        {t("perKgLine", { price: eur(p.pricePerKg), weight: format.number(p.weightKg, { maximumFractionDigits: 2 }) })}
      </div>
      {p.cylinderDeposit > 0 && (
        <div className="truncate text-[11.5px] leading-[1.35] text-emerald-700 tabular-nums dark:text-emerald-400" data-item-deposit>
          {t("depositLine", { amount: eur(p.cylinderDeposit) })}
        </div>
      )}
    </div>
  );
}

/** The grid card's two badges: safety class and GWP. Footprint, purity and deposit live on the product page and in the cart. */
function CardBadges({ p }: { p: StoreProduct }) {
  const format = useFormatter();
  const safety = p.gwpClass && p.gwpClass !== "n/a" ? p.gwpClass : null;
  if (!safety && p.gwp === null) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-item-badges>
      {safety && <MicroBadge tone={safetyTone(safety)}>{safety}</MicroBadge>}
      {p.gwp !== null && <MicroBadge>GWP {format.number(p.gwp)}</MicroBadge>}
    </div>
  );
}

const DOT: Record<string, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", info: "bg-blue-500", muted: "bg-slate-400" };

/** Grid view card — kept to what a buyer scans: picture, name and size, two badges, price, one action. */
export function CatalogCard({ p, onNotify }: { p: StoreProduct; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("Products");
  const format = useFormatter();
  const item = useCatalogItem(p);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);
  const stock = stockBadge(p);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const weight = p.pricedPerKg ? t("cardWeight", { kg: format.number(p.weightKg, { maximumFractionDigits: 2 }) }) : null;
  return (
    <article
      className="relative flex flex-col rounded-[22px] border border-slate-900/[.08] bg-white/75 p-5 backdrop-blur-xl backdrop-saturate-150 transition-colors hover:border-slate-900/[.16] dark:border-white/[.08] dark:bg-white/[.03] dark:hover:border-white/[.16]"
      data-catalog-card={p.sku}
    >
      <FavoriteButton productId={p.id} productName={p.name} size="sm" className="absolute right-3 top-3" />
      <Link href={p.pdpHref} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 pr-8">
        <Thumb p={p} />
        <span className="min-w-0">
          <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.3] tracking-[-.025em]" data-item-title>
            {p.name}
            {weight && <span className="font-normal text-slate-500 dark:text-ink-muted"> · {weight}</span>}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-ink-muted" data-item-stock={stock.key}>
            <span aria-hidden className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[stock.tone] ?? DOT.muted}`} />
            {t(stock.key)}
          </span>
        </span>
      </Link>
      <div className="mt-4">
        <CardBadges p={p} />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div className="min-w-0">
          {!p.pricedPerKg ? (
            <div className="text-[18px] font-semibold tabular-nums tracking-[-.03em]" data-item-total>
              {eur(p.pricePerKg)}
            </div>
          ) : p.pricePerKg <= 0 ? (
            <div className="text-[14px] font-semibold">{t("priceOnRequest")}</div>
          ) : (
            <>
              <div className="text-[18px] font-semibold tabular-nums tracking-[-.03em]" data-item-total>
                {eur(p.cylinderPrice)}
              </div>
              <div className="text-[12px] text-slate-500 tabular-nums dark:text-ink-muted" data-item-perkg>
                {t("cardPerKg", { amount: eur(p.pricePerKg) })}
              </div>
            </>
          )}
        </div>
        {!item.purchasable ? (
          <button type="button" onClick={() => onNotify(p)} data-item-notify className={`${ROW_ACTION_GHOST} h-9`}>
            <Bell size={14} strokeWidth={2} />
            {t("notifyCta")}
          </button>
        ) : item.inCart > 0 ? (
          // In the cart: the stepper edits the cart line itself (to 0 removes it).
          <Stepper
            value={item.inCart}
            min={0}
            max={item.maxQty}
            onChange={(next) => (next <= 0 ? removeItem(p.sku) : next > item.inCart ? increment(p.sku) : decrement(p.sku))}
            decreaseLabel={t("qtyDecrease")}
            increaseLabel={t("qtyIncrease")}
            data-item-in-cart={String(item.inCart)}
          />
        ) : (
          <AddButton item={item} className="h-9" />
        )}
      </div>
    </article>
  );
}

/** Table view row — the cart line layout. */
export const ROW_GRID = "grid grid-cols-[64px_minmax(0,1fr)_auto_208px_128px] items-center gap-4";

export function CatalogRow({ p, onNotify }: { p: StoreProduct; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("Products");
  const item = useCatalogItem(p);
  return (
    <div className={`${ROW_GRID} border-b border-slate-900/[.06] px-5 py-4 transition-colors last:border-b-0 hover:bg-slate-900/[.02] dark:border-white/[.06] dark:hover:bg-white/[.03]`} data-catalog-row={p.sku}>
      <Link href={p.pdpHref} aria-label={p.name} className="block">
        <Thumb p={p} />
      </Link>
      <div className="min-w-0">
        <Link href={p.pdpHref} className="block truncate text-[15px] font-semibold tracking-[-.025em] hover:text-blue-700 dark:hover:text-blue-400">
          {p.name}
        </Link>
        <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-ink-muted">
          {p.weightLabel} · <span className="font-mono">{p.sku}</span>
        </div>
        <div className="mt-1.5">
          <Badges p={p} purity={false} />
        </div>
      </div>
      {item.purchasable ? (
        <Stepper value={item.qty} onChange={item.setQty} max={item.maxQty} decreaseLabel={t("qtyDecrease")} increaseLabel={t("qtyIncrease")} data-item-qty={p.sku} />
      ) : (
        <span />
      )}
      <PriceLines p={p} align="right" />
      <div className="flex flex-col items-end gap-1">
        {item.purchasable ? (
          <AddButton item={item} className="w-full" />
        ) : (
          <button type="button" onClick={() => onNotify(p)} data-item-notify className={`${ROW_ACTION_GHOST} w-full`}>
            <Bell size={14} strokeWidth={2} />
            {t("notifyCta")}
          </button>
        )}
        {item.inCart > 0 && (
          <Link href="/cart" className="text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400" data-item-in-cart={item.inCart}>
            {t("alreadyInCart", { count: item.inCart })}
          </Link>
        )}
      </div>
    </div>
  );
}
