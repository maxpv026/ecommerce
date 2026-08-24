"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { SlidersHorizontal } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import CatalogProductCard from "./CatalogProductCard";
import MobileCatalogLayout from "./MobileCatalogLayout";
import { CATALOG, CATALOG_TYPES } from "@/lib/catalog";
import { useCartStore } from "@/lib/store/cart";
import type { CatalogEntry } from "@/lib/types";
import type { StoreProduct } from "@/lib/data";

const PAGE_SIZE = 8;
const WEIGHT_OPTIONS = [
  { value: "all", label: "All weights" },
  { value: "25", label: "25 lb" },
  { value: "30", label: "30 lb" },
  { value: "50", label: "50 lb" },
  { value: "100", label: "100 lb" },
];
const SORT_OPTIONS = [
  { value: "featured", label: "Sort: Featured" },
  { value: "low", label: "Price: low to high" },
  { value: "high", label: "Price: high to low" },
  { value: "weight", label: "Net weight" },
];

const selectClasses =
  "h-[38px] cursor-pointer rounded-[11px] border border-slate-900/[.13] bg-white/75 px-3 text-[12.5px] text-slate-900 focus:outline-none dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50";

interface CatalogPageProps {
  products: StoreProduct[];
}

export default function CatalogPage({ products }: CatalogPageProps) {
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const [type, setType] = useState("All");
  const [weight, setWeight] = useState("all");
  const [sort, setSort] = useState("featured");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let list = CATALOG.filter(
      (p) => (type === "All" || p.type === type) && (weight === "all" || String(p.weight) === weight)
    );
    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "weight") list = [...list].sort((a, b) => a.weight - b.weight);
    return list;
  }, [type, weight, sort]);

  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > shown.length;
  const resultLine = `${filtered.length} ${filtered.length === 1 ? "cylinder" : "cylinders"} · all AHRI-700 certified`;

  const selectType = (t: string) => {
    setType(t);
    setLimit(PAGE_SIZE);
  };

  const addEntryToCart = (entry: CatalogEntry) => {
    addItem({
      sku: entry.dbSku,
      name: entry.name,
      variant: `${entry.weight} lb cylinder · ${entry.note}`,
      price: entry.price,
    });
  };

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
        <Header
          query={query}
          onQueryChange={setQuery}
          onSignInClick={() => setIsAuthModalOpen(true)}
        />

      {/* Hero: ambient mesh gradient masked to fade into white before the grid */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_0%,#000_52%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_52%,transparent_100%)]">
          <div className="absolute -left-[160px] -top-[320px] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] opacity-[.34] blur-[110px] [animation:hc-float_24s_ease-in-out_infinite] dark:opacity-[.5]" />
          <div className="absolute -right-[120px] -top-[260px] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] opacity-[.32] blur-[110px] [animation:hc-float_30s_ease-in-out_infinite_reverse] dark:opacity-[.46]" />
          <div className="absolute -top-[180px] left-[38%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,#e0e7ff,rgba(224,231,255,0)_70%)] opacity-50 blur-[90px] [animation:hc-float_34s_ease-in-out_infinite] dark:opacity-[.18]" />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-8 pt-14">
          <div className="mb-6.5 flex items-center gap-2 text-[12.5px] text-slate-400 dark:text-slate-500">
            <Link href="/" className="text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50">
              Home
            </Link>
            <span>/</span>
            <span className="text-slate-600 dark:text-slate-400">Cylinders</span>
          </div>

          <h1 className="m-0 max-w-[640px] text-[38px] font-semibold leading-[1.05] tracking-[-.045em] text-balance sm:text-[52px]">
            Premium Cylinders
          </h1>
          <p className="mt-4.5 max-w-[520px] text-base leading-[1.6] text-slate-600 text-pretty dark:text-slate-400">
            Factory-sealed, AHRI-700 certified refrigerants for commercial and residential HVAC.
          </p>

          {/* Filter & sort bar: glassmorphism, sits over the fading edge of the mesh */}
          <div className="mt-11 flex flex-wrap items-center gap-3 rounded-[18px] border border-white/75 bg-white/60 p-3.5 shadow-[0_22px_50px_-24px_rgba(15,23,42,0.24)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/55 dark:shadow-[0_22px_50px_-24px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-[7px] border-r border-slate-900/10 pr-3.5 text-xs tracking-[.06em] text-slate-500 dark:border-white/10 dark:text-slate-400">
              <SlidersHorizontal size={14} strokeWidth={2} />
              FILTER
            </div>

            <div className="flex flex-wrap gap-[7px]">
              {CATALOG_TYPES.map((t) => {
                const active = t === type;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectType(t)}
                    className={
                      active
                        ? "rounded-full border border-transparent bg-slate-900 px-3.5 py-[7px] text-[12.5px] font-semibold tracking-[-.01em] text-white dark:bg-slate-50 dark:text-slate-900"
                        : "rounded-full border border-slate-900/[.13] bg-white/70 px-3.5 py-[7px] text-[12.5px] font-medium tracking-[-.01em] text-slate-600 transition-colors hover:border-slate-900/[.36] hover:text-slate-900 dark:border-white/[.14] dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/30 dark:hover:text-slate-50"
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                className={selectClasses}
              >
                {WEIGHT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className={selectClasses}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-8 pb-[110px] pt-10">
        <div className="mb-6.5 flex items-baseline justify-between gap-5">
          <span className="text-[13px] text-slate-500 dark:text-slate-400">{resultLine}</span>
          <a href="#" className="text-[12.5px] text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-50">
            View compliance guide
          </a>
        </div>

        {shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((entry) => (
              <CatalogProductCard
                key={entry.id}
                entry={entry}
                onAddToCart={() => addEntryToCart(entry)}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-sm text-slate-400 dark:text-slate-500">
            No cylinders match these filters.
          </div>
        )}

        {hasMore && (
          <div className="mt-13 flex flex-col items-center gap-3.5">
            <button
              type="button"
              onClick={() => setLimit((l) => l + 4)}
              className="h-12 rounded-full border border-slate-900/[.14] bg-white px-[30px] text-[13.5px] font-semibold tracking-[-.01em] transition-colors hover:border-slate-900/[.36] dark:border-white/[.14] dark:bg-white/5 dark:text-slate-50 dark:hover:border-white/30"
            >
              Load more
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Showing {shown.length} of {filtered.length}
            </span>
          </div>
        )}
      </section>
      </div>

      <div className="block md:hidden">
        <MobileCatalogLayout products={products} />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
