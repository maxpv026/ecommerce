"use client";

import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import type { CatalogEntry } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { getProductDetail } from "@/lib/productDetails";

const ThreeCylinder = dynamic(() => import("./ThreeCylinder"), {
  ssr: false,
});

interface CatalogProductCardProps {
  entry: CatalogEntry;
  onAddToCart: (id: number) => void;
}

export default function CatalogProductCard({ entry, onAddToCart }: CatalogProductCardProps) {
  const modelPath = getProductDetail(String(entry.productId))?.modelPath;

  return (
    <div className="group flex flex-col rounded-[20px] border border-slate-900/[.08] bg-white p-3.5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-slate-900/20 hover:shadow-[0_22px_44px_-24px_rgba(15,23,42,0.3)] dark:border-white/[.08] dark:bg-slate-900 dark:hover:border-white/20 dark:hover:shadow-[0_22px_44px_-24px_rgba(0,0,0,0.6)]">
      <Link href={`/product/${entry.productId}?weight=${entry.weightId}`} className="flex flex-1 flex-col">
        <div className="relative mb-4 aspect-square overflow-hidden rounded-[14px] bg-slate-50 dark:bg-white/5">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.035)_0_1px,transparent_1px_10px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.03)_0_1px,transparent_1px_10px)]" />
          {modelPath ? (
            <div className="pointer-events-none absolute inset-0">
              <ThreeCylinder modelPath={modelPath} variant="card" />
            </div>
          ) : (
            <div className="absolute left-1/2 top-1/2 h-2/3 w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-t-[60px] rounded-b-xl border border-dashed border-slate-900/20 bg-white/80 transition-transform duration-300 group-hover:scale-105 dark:border-white/20 dark:bg-white/10" />
          )}
          <span className="absolute left-3 top-2.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {entry.sku}
          </span>
          {entry.tag && (
            <span className="absolute right-2.5 top-2.5 rounded-[7px] bg-white/80 px-[9px] py-1 text-[10.5px] font-semibold tracking-[-.01em] text-blue-700 backdrop-blur-[10px] dark:bg-slate-900/80 dark:text-blue-400">
              {entry.tag}
            </span>
          )}
        </div>

        <div className="text-[15.5px] font-semibold tracking-[-.02em]">{entry.name}</div>
        <div className="mt-1 flex-1 text-[12.5px] text-slate-400 dark:text-slate-500">{entry.note}</div>

        <div className="mt-3.5 flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-[-.03em]">{formatPrice(entry.price)}</span>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500">{entry.weight} lb net</span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onAddToCart(entry.id)}
        className="mt-3.5 h-[42px] w-full rounded-xl bg-blue-700 text-[13.5px] font-semibold tracking-[-.01em] text-white transition-[filter] duration-200 hover:brightness-[1.14] active:scale-[.98]"
      >
        Add to Cart
      </button>
    </div>
  );
}
