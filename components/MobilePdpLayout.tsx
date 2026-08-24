"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { Award, ChevronLeft, Droplet, Gauge, Minus, Plus, ShieldCheck, ShoppingCart } from "lucide-react";
import type { ProductDetail } from "@/lib/types";

const ThreeCylinder = dynamic(() => import("./ThreeCylinder"), { ssr: false });

const CLASS_LABELS: Record<string, string> = {
  A1: "A1 Non-Flammable",
  A2L: "A2L Mildly Flammable",
};

interface MobilePdpLayoutProps {
  product: ProductDetail;
  initialWeightId?: string;
}

export default function MobilePdpLayout({ product, initialWeightId }: MobilePdpLayoutProps) {
  const t = useTranslations("Pdp");
  const format = useFormatter();
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const [weightId, setWeightId] = useState(initialWeightId ?? product.defaultWeightId);
  const [qty, setQty] = useState(1);
  const [cartCount, setCartCount] = useState(2);
  const [added, setAdded] = useState(false);
  const addedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimeout.current) clearTimeout(addedTimeout.current);
    };
  }, []);

  const selectedWeight = product.weights.find((w) => w.id === weightId) ?? product.weights[0];
  const total = selectedWeight.price * qty;

  const specs = useMemo(() => {
    const valueFor = (label: string) => product.keySpecs.find((s) => s.label === label)?.value ?? "—";
    const safety = valueFor("Safety");
    return [
      { label: "GWP", value: valueFor("GWP"), Icon: Gauge },
      { label: "OIL", value: "POE", Icon: Droplet },
      { label: "CLASS", value: CLASS_LABELS[safety] ?? safety, Icon: ShieldCheck },
      { label: "PURITY", value: valueFor("Purity"), Icon: Award },
    ];
  }, [product.keySpecs]);

  const selectWeight = (id: string) => {
    setWeightId(id);
    setAdded(false);
  };

  const addToCart = () => {
    setCartCount((c) => c + qty);
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
        <ThreeCylinder modelPath={product.modelPath} />
      </div>

      {/* Overlapping info card: slides up over the hero as the user scrolls */}
      <div className="relative -mt-6.5 rounded-t-[26px] bg-white shadow-[0_-14px_34px_-22px_rgba(15,23,42,0.28)] dark:bg-slate-950">
        <div className="px-5 pt-5.5">
          <div className="mb-2.5 text-[11px] tracking-[.09em] text-slate-400 dark:text-slate-500">
            {product.category}
          </div>
          <h1 className="m-0 text-[25px] font-semibold leading-[1.15] tracking-[-.035em] text-balance">
            {product.name}
          </h1>

          <div className="mt-3.5 flex flex-wrap items-center gap-[11px]">
            <span className="text-[26px] font-semibold tracking-[-.04em] tabular-nums">{formatEur(total)}</span>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-2.5 py-[5px] text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-400">
              <span className="h-[5px] w-[5px] rounded-full bg-emerald-600 dark:bg-emerald-400" />
              {t("inStockShipsToday")}
            </span>
          </div>
          <p className="mt-3.5 text-[13.5px] leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
            {product.description}
          </p>
        </div>

        <div className="px-5 pt-6">
          <div className="mb-2.5 text-[12.5px] font-semibold tracking-[-.015em]">{t("selectSize")}</div>
          <div className="flex flex-wrap gap-2">
            {product.weights.map((w) => {
              const selected = w.id === weightId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => selectWeight(w.id)}
                  className={`h-[42px] rounded-full px-[18px] text-[13px] font-semibold tracking-[-.01em] transition-colors ${
                    selected
                      ? "bg-blue-700 text-white shadow-[0_10px_22px_-12px_rgba(29,78,216,0.8)]"
                      : "bg-slate-100 text-slate-600 dark:bg-white/[.07] dark:text-slate-400"
                  }`}
                >
                  {w.label}
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
          href="/cylinders"
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
            className={`flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors ${
              added ? "bg-emerald-600" : "bg-blue-700"
            }`}
          >
            <Plus size={17} strokeWidth={2.4} />
            {added ? t("addedToCart") : t("addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
