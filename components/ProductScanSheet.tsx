"use client";

import { Check, Heart, ShoppingCart, X } from "lucide-react";

interface ScannedProduct {
  name: string;
  variant: string;
  price: string;
}

interface ProductScanSheetProps {
  open: boolean;
  onClose: () => void;
  product: ScannedProduct;
  addedToCart: boolean;
  onAddToCart: () => void;
  favorited: boolean;
  onToggleFavorite: () => void;
}

export default function ProductScanSheet({
  open,
  onClose,
  product,
  addedToCart,
  onAddToCart,
  favorited,
  onToggleFavorite,
}: ProductScanSheetProps) {
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[100] bg-slate-950/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scanned product"
        className="fixed inset-x-0 bottom-0 z-[100] rounded-t-[28px] border-t border-white/60 bg-white/92 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-26px_60px_-22px_rgba(15,23,42,0.42)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] dark:border-white/10 dark:bg-slate-900/95"
        style={{ transform: open ? "translateY(0)" : "translateY(102%)" }}
      >
        <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-slate-900/[.16] dark:bg-white/20" />

        <div className="mb-4.5 flex items-center justify-between gap-3.5">
          <span className="text-[11px] tracking-[.08em] text-slate-400 dark:text-slate-500">SCAN RESULT</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-slate-900/[.06] text-slate-600 dark:bg-white/10 dark:text-slate-300"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative h-[74px] w-[74px] flex-none overflow-hidden rounded-[18px] bg-slate-50 dark:bg-white/5">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.04)_0_1px,transparent_1px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.035)_0_1px,transparent_1px_9px)]" />
            <div className="absolute left-1/2 top-1/2 h-2/3 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-t-[44px] rounded-b-[9px] border border-dashed border-slate-900/20 bg-white/80 dark:border-white/20 dark:bg-white/10" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tracking-[-.03em]">{product.name}</div>
            <div className="mt-[3px] text-[12.5px] text-slate-400 dark:text-slate-500">{product.variant}</div>
            <div className="mt-2 text-[19px] font-semibold tracking-[-.035em] tabular-nums">{product.price}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2.5">
          <button
            type="button"
            onClick={onAddToCart}
            className={`flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_16px_34px_-12px_rgba(29,78,216,0.85)] transition-colors ${
              addedToCart ? "bg-emerald-600" : "bg-blue-700 hover:bg-blue-800"
            }`}
          >
            {addedToCart ? <Check size={17} strokeWidth={2.4} /> : <ShoppingCart size={17} strokeWidth={2} />}
            {addedToCart ? "Added to Cart" : "Add to Cart"}
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorited}
            aria-label="Add to Favorites"
            className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl border-[1.5px] transition-colors ${
              favorited
                ? "border-red-500/40 bg-red-50 text-red-600 dark:border-red-400/30 dark:bg-red-950 dark:text-red-400"
                : "border-slate-900/[.14] bg-white text-slate-500 dark:border-white/[.14] dark:bg-transparent dark:text-slate-400"
            }`}
          >
            <Heart size={19} strokeWidth={2} fill={favorited ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </>
  );
}
