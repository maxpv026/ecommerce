"use client";

import { useMemo, useState } from "react";
import { useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import {
  MOBILE_CATALOG_FILTERS,
  REFRIGERANT_FILTER_OPTIONS,
  WEIGHT_FILTER_OPTIONS,
  matchesMobileCatalogFilter,
} from "@/lib/mobileCatalog";
import type { StoreProduct } from "@/lib/data";
import { useCartCount } from "./CartCountProvider";

function pillClasses(active: boolean) {
  return active
    ? "flex-none rounded-full bg-blue-700 px-4 py-2 text-[12.5px] font-semibold tracking-[-.01em] text-white shadow-[0_8px_18px_-10px_rgba(29,78,216,0.8)] transition-colors"
    : "flex-none rounded-full bg-slate-100 px-4 py-2 text-[12.5px] font-semibold tracking-[-.01em] text-slate-600 transition-colors dark:bg-white/[.07] dark:text-slate-400";
}

interface MobileCatalogLayoutProps {
  products: StoreProduct[];
}

export default function MobileCatalogLayout({ products }: MobileCatalogLayoutProps) {
  const format = useFormatter();
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { bumpCartCount } = useCartCount();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (entry) =>
        matchesMobileCatalogFilter(entry, filter) &&
        (!q || `${entry.name} ${entry.type}`.toLowerCase().includes(q))
    );
  }, [products, query, filter]);

  const resultLine = `${filtered.length} ${filtered.length === 1 ? "cylinder" : "cylinders"} in stock`;

  const selectFilter = (id: string) => setFilter(id);

  return (
    <div className="relative w-full min-h-screen bg-white dark:bg-slate-950">
      {/* Header + search: mesh gradient sits strictly behind this block */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)]">
          <div className="absolute -left-[100px] -top-[130px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.32] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite] dark:opacity-[.46]" />
          <div className="absolute -right-[90px] -top-[100px] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.3] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse] dark:opacity-[.4]" />
          <div className="absolute -top-[100px] left-[28%] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-40 blur-[70px] [animation:hc-float_32s_ease-in-out_infinite] dark:opacity-[.14]" />
        </div>

        <div className="relative px-5 pt-6">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back"
              className="-ml-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-slate-900/[.06] dark:text-slate-50 dark:hover:bg-white/10"
            >
              <ChevronLeft size={21} strokeWidth={2} />
            </Link>
            <span className="text-[17px] font-semibold tracking-[-.03em]">Premium Cylinders</span>
          </div>

          {/* Glass search bar */}
          <div className="mt-4.5 flex h-[50px] items-center gap-2.5 rounded-2xl border border-white/80 bg-white/68 py-0 pl-4 pr-1.5 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.4)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60">
            <Search size={17} className="flex-none text-slate-500 dark:text-slate-400" strokeWidth={2} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search R-410A, R-32..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-label="Open filters"
              className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl transition-colors ${
                sheetOpen
                  ? "bg-blue-700 text-white"
                  : "bg-slate-900/[.06] text-slate-600 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              <SlidersHorizontal size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Quick filter pills: native horizontal scroll */}
          <div className="scrollbar-hide -mx-5 mt-3.5 flex gap-2 overflow-x-auto px-5 pb-1 pt-0.5">
            {MOBILE_CATALOG_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => selectFilter(f.id)}
                className={pillClasses(filter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product grid: stark white background */}
      <div className="px-5 pt-5">
        <div className="mb-3.5 flex items-baseline justify-between gap-3.5">
          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{resultLine}</span>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500">Sorted by relevance</span>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="relative flex flex-col rounded-[20px] border border-slate-900/[.08] bg-white p-2.5 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.4)] dark:border-white/[.08] dark:bg-slate-900"
              >
                <Link href={entry.pdpHref} className="flex flex-1 flex-col">
                  <div className="relative mb-2.5 aspect-square overflow-hidden rounded-[14px] bg-slate-50 dark:bg-white/5">
                    <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(15,23,42,.035)_0_1px,transparent_1px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.03)_0_1px,transparent_1px_9px)]" />
                    <div className="absolute left-1/2 top-1/2 h-[64%] w-2/5 -translate-x-1/2 -translate-y-1/2 rounded-t-[52px] rounded-b-[10px] border border-dashed border-slate-900/20 bg-white/80 dark:border-white/20 dark:bg-white/10" />
                    <span
                      className={`absolute right-[9px] top-[9px] rounded-[7px] px-2 py-1 text-[10px] font-semibold backdrop-blur-[8px] ${
                        entry.inStock
                          ? "bg-white/86 text-blue-700 dark:bg-slate-900/86 dark:text-blue-400"
                          : "bg-white/86 text-red-600 dark:bg-slate-900/86 dark:text-red-400"
                      }`}
                    >
                      {entry.inStock ? entry.gwpClass : "Out of Stock"}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-semibold leading-[1.3] tracking-[-.02em]">
                    {entry.name}
                  </div>
                  <div className="mt-[3px] text-[11.5px] text-slate-400 dark:text-slate-500">
                    {entry.weightLabel}
                  </div>
                </Link>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-base font-semibold tracking-[-.03em]">{formatEur(entry.price)}</span>
                  {/* 44x44 touch target */}
                  <button
                    type="button"
                    onClick={() => bumpCartCount(1)}
                    disabled={!entry.inStock}
                    aria-label={`Add ${entry.name} to cart`}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-blue-700 text-white shadow-[0_10px_22px_-10px_rgba(29,78,216,0.85)] transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={18} strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-15 text-center text-[13.5px] text-slate-400 dark:text-slate-500">
            No cylinders match this filter.
          </div>
        )}
      </div>

      {/* Filter sheet: slides up above the bottom nav */}
      <div
        className="fixed inset-x-0 bottom-0 z-[110] rounded-t-[26px] border border-white/75 bg-white/92 px-5 pb-6.5 pt-3 shadow-[0_-26px_60px_-22px_rgba(15,23,42,0.42)] backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] dark:border-white/10 dark:bg-slate-900/95"
        style={{ transform: sheetOpen ? "translateY(0)" : "translateY(102%)" }}
      >
        <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-slate-900/[.16] dark:bg-white/20" />
        <div className="mb-4.5 flex items-center justify-between gap-3.5">
          <span className="text-base font-semibold tracking-[-.025em]">Filters</span>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close filters"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-slate-900/[.06] text-slate-600 dark:bg-white/10 dark:text-slate-300"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mb-4.5">
          <div className="mb-2.5 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
            REFRIGERANT
          </div>
          <div className="flex flex-wrap gap-2">
            {REFRIGERANT_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectFilter(opt.id)}
                className={pillClasses(filter === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-1">
          <div className="mb-2.5 text-[11px] tracking-[.07em] text-slate-400 dark:text-slate-500">
            CYLINDER WEIGHT
          </div>
          <div className="flex flex-wrap gap-2">
            {WEIGHT_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectFilter(opt.id)}
                className={pillClasses(filter === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          className="mt-4.5 h-[50px] w-full rounded-[15px] bg-blue-700 text-[14.5px] font-semibold tracking-[-.01em] text-white shadow-[0_14px_30px_-12px_rgba(29,78,216,0.65)] transition-colors hover:bg-blue-800"
        >
          Show {filtered.length} results
        </button>
      </div>
    </div>
  );
}
