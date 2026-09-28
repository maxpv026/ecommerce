"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { Award, ChevronLeft, Gauge, Minus, Package, Plus, ShieldCheck, ShoppingCart } from "lucide-react";
import { isPurchasable } from "@/lib/waitlist";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { selectCartCount, useCartStore } from "@/lib/store/cart";
import type { StoreProduct } from "@/lib/data";

const ProductModelViewer = dynamic(() => import("./3d/ProductModelViewer"), { ssr: false });

/** Shown for anything without a model of its own. Hoisted for memo stability. */
const CYLINDER_OUTLINE = (
  <span className="absolute inset-0 grid place-items-center">
    <span className="block h-[190px] w-[98px] rounded-t-[70px] rounded-b-xl border border-dashed border-slate-900/20 bg-white/80 dark:border-white/20 dark:bg-white/10" />
  </span>
);

const CATEGORY_KEY: Record<string, string> = {
  cylinders: "cylTitle",
  blends: "blendTitle",
  equipment: "eqTitle",
  recovery: "recTitle",
};

const STOCK_KEY = { in: "stockIn", low: "stockLow", order: "stockOrder", out: "stockOut" } as const;

interface MobilePdpLayoutProps {
  product: StoreProduct;
  /**
   * Sibling SKUs of the same refrigerant, which is what the size selector
   * offers. In the real catalogue a "weight tier" is not a field on a
   * product — it is a separate Product row (R-410A 10 kg, 25 lb, 50 lb …),
   * so the tiers have to be passed in rather than read off `product`.
   */
  variants: StoreProduct[];
}

export default function MobilePdpLayout({ product, variants }: MobilePdpLayoutProps) {
  const t = useTranslations("Pdp");
  // The orbit hint is authored once, under ProductDetail, in all 29 locales.
  const tStage = useTranslations("ProductDetail");
  const tProducts = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const format = useFormatter();
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const [selectedId, setSelectedId] = useState(product.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addItem = useCartStore((s) => s.addItem);
  // Same pattern as the global nav badge: the persisted cart is the single
  // source of truth, and the count is withheld until hydration so the first
  // client render matches the server HTML. This used to be `useState(2)` —
  // a design-mock literal that showed "2" to a visitor with an empty cart.
  const hydrated = useHydrated();
  const realCartCount = useCartStore(selectCartCount);
  const cartCount = hydrated ? realCartCount : 0;

  useEffect(() => {
    return () => {
      if (addedTimeout.current) clearTimeout(addedTimeout.current);
    };
  }, []);

  const selected = variants.find((v) => v.id === selectedId) ?? product;

  // Availability is derived once and every branch reads it, so the badge can
  // never say "In stock" next to a disabled button (the same rule the
  // desktop PDP follows).
  const isAvailable = isPurchasable(selected);
  const priced = selected.pricePerKg > 0;
  const canBuy = isAvailable && priced;
  const stockKey = !isAvailable ? "out" : selected.stockLevel === "out" ? "in" : selected.stockLevel;

  const total = selected.cylinderPrice * qty;

  const specs = useMemo(
    () => [
      // Every value here is a real column. The previous version hardcoded
      // OIL: "POE" for every product — an invented compatibility claim, in
      // the one domain where guessing a spec is genuinely unsafe.
      {
        label: "GWP",
        value: selected.gwp !== null ? String(selected.gwp) : tProducts("na"),
        Icon: Gauge,
      },
      { label: "CLASS", value: selected.gwpClass, Icon: ShieldCheck },
      {
        label: "PURITY",
        value: selected.purity !== null ? `${selected.purity}%` : tProducts("na"),
        Icon: Award,
      },
      { label: t("netWeight").toUpperCase(), value: selected.weightLabel, Icon: Package },
    ],
    [selected, t, tProducts]
  );

  const selectVariant = (id: string) => {
    setSelectedId(id);
    setAdded(false);
  };

  const addToCart = () => {
    if (!canBuy) return;
    // The real write, with the full line shape the cart is keyed on —
    // deposit included, straight off the selected row.
    addItem(
      {
        sku: selected.sku,
        name: selected.name,
        variant: selected.weightLabel,
        pricePerKg: selected.pricePerKg,
        weightKg: selected.weightKg,
        deposit: selected.cylinderDeposit,
      },
      qty
    );
    // Confirmation follows the write, so it can never report a success that
    // did not happen.
    setAdded(true);
    if (addedTimeout.current) clearTimeout(addedTimeout.current);
    addedTimeout.current = setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="relative w-full min-h-screen bg-white dark:bg-slate-950">
      {/* Hero: mesh gradient studio backdrop, top half only, 3D cylinder centered */}
      <div className="relative h-[396px] overflow-hidden bg-[#fbfcfd] dark:bg-[#0a0f1c]">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_58%,transparent_100%)]">
          <div className="absolute -left-[120px] -top-[150px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-40 blur-[90px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.55]" />
          <div className="absolute -right-[110px] -top-[100px] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-40 blur-[90px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.5]" />
          <div className="absolute -top-[90px] left-[28%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-50 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.18]" />
        </div>
        {/* The real SKU is the viewer's primary resolution signal; the name
            covers the few SKUs that drop the "R" and are only identifiable
            from it. Follows the selected size. */}
        <ProductModelViewer
          sku={selected.sku}
          name={selected.name}
          className="absolute inset-0"
          badgeLabel={tStage("stageTag")}
          poster={CYLINDER_OUTLINE}
        />
      </div>

      {/* Overlapping info card: slides up over the hero as the user scrolls */}
      <div className="relative -mt-6.5 rounded-t-[26px] bg-white shadow-[0_-14px_34px_-22px_rgba(15,23,42,0.28)] dark:bg-slate-950">
        <div className="px-5 pt-5.5">
          <div className="mb-2.5 text-[11px] tracking-[.09em] text-slate-400 dark:text-slate-500">
            {tCat(CATEGORY_KEY[selected.category] ?? "cylTitle")}
          </div>
          <h1 className="m-0 text-[25px] font-semibold leading-[1.15] tracking-[-.035em] text-balance">
            {selected.name}
          </h1>

          <div className="mt-3.5 flex flex-wrap items-center gap-[11px]">
            <span className="text-[26px] font-semibold tracking-[-.04em] tabular-nums">
              {priced ? formatEur(total) : tProducts("priceOnRequest")}
            </span>
            {/* Reflects the row, rather than asserting "In stock · ships
                today" for everything the way the mock did. */}
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[11px] font-semibold ${
                isAvailable
                  ? "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400"
                  : "border-slate-900/[.08] bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/[.06] dark:text-slate-400"
              }`}
            >
              <span
                className={`h-[5px] w-[5px] rounded-full ${
                  isAvailable ? "bg-emerald-600 dark:bg-emerald-400" : "bg-slate-400"
                }`}
              />
              {tProducts(STOCK_KEY[stockKey])}
            </span>
          </div>
          {/* The mock carried a marketing paragraph per product. There is no
              description column behind it, so rather than invent copy this
              slot now shows the per-kg rate the cylinder figure is derived
              from — which is what a trade buyer actually compares on. */}
          {priced && selected.pricedPerKg ? (
            <p className="mt-3.5 text-[13.5px] leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
              {tProducts("perKgAmountExVat", { amount: formatEur(selected.pricePerKg) })}
            </p>
          ) : null}
        </div>

        <div className="px-5 pt-6">
          <div className="mb-2.5 text-[12.5px] font-semibold tracking-[-.015em]">{t("selectSize")}</div>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = v.id === selected.id;
              const sellable = isPurchasable(v) && v.pricePerKg > 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVariant(v.id)}
                  aria-pressed={active}
                  className={`h-[42px] rounded-full px-[18px] text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                    active
                      ? "bg-blue-700 text-white shadow-[0_10px_22px_-12px_rgba(29,78,216,0.8)]"
                      : "bg-slate-100 text-slate-600 dark:bg-white/[.07] dark:text-slate-400"
                  } ${!active && !sellable ? "opacity-45" : ""}`}
                >
                  {v.weightLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pt-6">
          <div className="mb-2.5 text-[12.5px] font-semibold tracking-[-.015em]">{t("quickSpecs")}</div>
          <div className="grid grid-cols-2 gap-2.5">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center gap-2.5 rounded-2xl border border-slate-900/[.05] bg-slate-50 p-3.5 dark:border-white/[.06] dark:bg-white/[.03]"
              >
                <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] border border-slate-900/[.06] bg-white text-blue-700 dark:border-white/10 dark:bg-slate-900 dark:text-blue-400">
                  <spec.Icon size={15} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] tracking-[.06em] text-slate-400 dark:text-slate-500">
                    {spec.label}
                  </span>
                  <span className="mt-[2px] block text-[12.5px] font-semibold leading-[1.25] tracking-[-.015em]">
                    {spec.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-5.5">
          <div className="flex items-center gap-2.5 rounded-2xl border border-slate-900/[.05] bg-slate-50 p-3.5 text-[11.5px] leading-[1.55] text-slate-500 dark:border-white/[.06] dark:bg-white/[.03] dark:text-slate-400">
            <ShieldCheck size={15} className="flex-none text-blue-700 dark:text-blue-400" strokeWidth={2} />
            {t("complianceNote")}
          </div>
        </div>
      </div>

      {/* Transparent overlay header — scrolls away with the hero, not fixed */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4.5 pt-14">
        <Link
          href="/products"
          aria-label={t("backAria")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
        <Link
          href="/cart"
          aria-label={t("cartAria")}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
        >
          <ShoppingCart size={19} strokeWidth={1.9} />
          {cartCount > 0 && (
            <span className="absolute -right-[3px] -top-[3px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-[1.5px] border-white bg-red-500 px-1 text-[9.5px] font-bold text-white dark:border-slate-950">
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      {/* Sticky Add to Cart bar — the only fixed bottom element on this page */}
      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-white/40 bg-white/78 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-16px_40px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/78">
        <div className="flex items-center gap-3">
          <div className="flex h-[52px] flex-none items-center gap-0.5 rounded-full bg-slate-100 px-1.5 dark:bg-white/[.08]">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label={t("decreaseQuantity")}
              className="flex h-[42px] w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-white/90 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Minus size={15} strokeWidth={2.6} />
            </button>
            <span className="w-[22px] text-center text-[14.5px] font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              aria-label={t("increaseQuantity")}
              className="flex h-[42px] w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-white/90 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Plus size={15} strokeWidth={2.6} />
            </button>
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!canBuy}
            aria-label={t("addToCart")}
            className={`flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-white/10 ${
              added ? "bg-emerald-600" : "bg-blue-700"
            }`}
          >
            <Plus size={17} strokeWidth={2.4} />
            {!canBuy
              ? tProducts(priced ? STOCK_KEY.out : "priceOnRequest")
              : added
                ? t("addedToCart")
                : t("addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
