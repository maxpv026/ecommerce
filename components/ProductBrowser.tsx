"use client";

import { formatKg } from "@/lib/pricing";
import { sortProducts } from "@/lib/productSort";
import { GAS_MARKS, GAS_MARKS_COLLAPSED_COUNT, serializeGasMarks } from "@/lib/gasMarks";
import { isPurchasable } from "@/lib/waitlist";
import StockNotifyModal from "./StockNotifyModal";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, Check, ChevronDown, Loader2, Search, Sparkles, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Header from "./Header";
import AuthModal from "./AuthModal";
import MobileProductsLayout from "./MobileProductsLayout";
import { useCartStore } from "@/lib/store/cart";
import { smartMatch } from "@/lib/actions/smartMatch";
import ProductThumbnail from "./ProductThumbnail";
import type { StoreProduct } from "@/lib/data";

/**
 * The original placeholder. Still the fallback for equipment, custom blends
 * and anything whose render is missing, so a card is never an empty tile.
 */
const CYLINDER_OUTLINE = (
  <div className="absolute inset-0 grid place-items-center">
    <div className="relative h-[108px] w-[58px] rounded-t-[30px] rounded-b-lg border border-dashed border-slate-900/[.24] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.28] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
  </div>
);

const ACCENT = "#1d4ed8";

/* ── stock tones: glowing badges per the design's STOCK table ── */
const STOCK_TONES = {
  in: {
    labelKey: "stockIn",
    dot: "#34d399",
    badge:
      "border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.14)] text-[#047857] dark:text-[#34d399] shadow-[0_0_16px_-6px_#34d399]",
    pulse: false,
  },
  low: {
    labelKey: "stockLow",
    dot: "#fbbf24",
    badge:
      "border-[rgba(245,158,11,.32)] bg-[rgba(245,158,11,.15)] text-[#b45309] dark:text-[#fbbf24] shadow-[0_0_16px_-6px_#fbbf24]",
    pulse: true,
  },
  order: {
    labelKey: "stockOrder",
    dot: "#22d3ee",
    badge:
      "border-[rgba(56,189,248,.3)] bg-[rgba(56,189,248,.14)] text-[#0369a1] dark:text-[#38bdf8] shadow-[0_0_16px_-6px_#22d3ee]",
    pulse: true,
  },
  out: {
    labelKey: "stockOut",
    dot: "#f87171",
    badge:
      "border-[rgba(248,113,113,.32)] bg-[rgba(239,68,68,.12)] text-[#b91c1c] dark:text-[#fca5a5] shadow-[0_0_16px_-6px_#f87171]",
    pulse: false,
  },
} as const;

const CATEGORY_LABEL_KEY: Record<string, string> = {
  cylinders: "cylTitle",
  blends: "blendTitle",
  equipment: "eqTitle",
  recovery: "recTitle",
};

const WEIGHT_OPTIONS = ["25", "30", "50", "100"];
const STOCK_OPTIONS = ["in", "low", "order", "out"] as const;
const SORTS = ["featured", "price", "gwp"] as const;

interface Filters {
  cat: string[];
  weight: string[];
  stock: string[];
}

const EMPTY_FILTERS: Filters = { cat: [], weight: [], stock: [] };

/* slider track: blue fill runs exactly to the thumb */
const sliderTrack = (value: number, min: number, max: number) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return {
    background: `linear-gradient(90deg,${ACCENT} 0%,${ACCENT} ${pct}%,var(--hc-border-idle) ${pct}%,var(--hc-border-idle) 100%)`,
  };
};

interface ProductBrowserProps {
  products: StoreProduct[];
  initialCategory: string | null;
  /** Marks currently applied by the server, straight from `?gasType=`. */
  gasMarks: string[];
  /** Per-mark totals over the whole catalog, so unselected marks still show a count. */
  gasMarkCounts: Record<string, number>;
  /** Free-text term from `?search=`, already applied to `products` by the server. */
  searchTerm: string;
}

export default function ProductBrowser({
  products,
  initialCategory,
  gasMarks,
  gasMarkCounts,
  searchTerm,
}: ProductBrowserProps) {
  const t = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const tHome = useTranslations("HomeDesktop");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // Product whose waitlist dialog is open; null when the dialog is closed.
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);

  // ─── Refrigerant mark filter ───
  // The URL is the source of truth (the server queries Prisma with it), but a
  // checkbox has to answer instantly, so the selection is mirrored locally and
  // the navigation runs in a transition.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [marksExpanded, setMarksExpanded] = useState(false);
  const [marksPending, startMarks] = useTransition();
  // The checkbox ticks immediately while the server round-trip is in flight;
  // once it lands, React drops the optimistic value for the real prop, so
  // back/forward and a failed navigation both self-correct.
  const [marks, setOptimisticMarks] = useOptimistic(gasMarks);

  /** Applies a new mark selection to the URL — the server re-queries from it. */
  const applyMarks = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    const serialized = serializeGasMarks(next);
    if (serialized) params.set("gasType", serialized);
    else params.delete("gasType");
    const query = params.toString();
    startMarks(() => {
      setOptimisticMarks(next);
      router.replace(query ? `/products?${query}` : "/products", { scroll: false });
    });
  };

  const toggleMark = (mark: string) => {
    applyMarks(marks.includes(mark) ? marks.filter((m) => m !== mark) : [...marks, mark]);
  };

  /** Drops `?search=` — like the marks, the term lives in the URL. */
  const clearSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    const rest = params.toString();
    startMarks(() => router.replace(rest ? `/products?${rest}` : "/products", { scroll: false }));
  };

  const visibleMarks = marksExpanded ? GAS_MARKS : GAS_MARKS.slice(0, GAS_MARKS_COLLAPSED_COUNT);
  const [filters, setFilters] = useState<Filters>(() =>
    initialCategory ? { ...EMPTY_FILTERS, cat: [initialCategory] } : EMPTY_FILTERS
  );
  const [purity, setPurity] = useState(99);
  const [maxPrice, setMaxPrice] = useState(900);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("featured");
  const [aiQuery, setAiQuery] = useState("");
  const [aiMatch, setAiMatch] = useState<{ skus: string[]; reason: string } | null>(null);
  const [aiPending, startAi] = useTransition();
  const [hovered, setHovered] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const toggle = (key: keyof Filters, value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPurity(99);
    setMaxPrice(900);
    setAiQuery("");
    setAiMatch(null);
    // Marks and the search term live in the URL, so clearing them is a
    // navigation — one, not two, so the two don't race each other.
    if (marks.length > 0 || searchTerm) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("gasType");
      params.delete("search");
      const rest = params.toString();
      startMarks(() => {
        setOptimisticMarks([]);
        router.replace(rest ? `/products?${rest}` : "/products", { scroll: false });
      });
    }
  };

  const runSmartMatch = (q?: string) => {
    const text = (q ?? aiQuery).trim();
    if (!text || aiPending) return;
    if (q) setAiQuery(q);
    setAiMatch(null);
    startAi(async () => {
      const result = await smartMatch(text);
      if (!result.ok) {
        toast.error(t("aiError"));
        return;
      }
      setAiMatch({ skus: result.skus, reason: result.reason });
    });
  };

  const rows = useMemo(() => {
    let list = products.filter(
      (p) =>
        (filters.cat.length === 0 || filters.cat.includes(p.category)) &&
        (filters.weight.length === 0 || (p.weightLb !== null && filters.weight.includes(String(p.weightLb)))) &&
        (filters.stock.length === 0 || filters.stock.includes(p.stockLevel)) &&
        (p.purity === null || p.purity >= purity) &&
        p.cylinderPrice <= maxPrice
    );
    if (aiMatch && aiMatch.skus.length > 0) {
      list = list.filter((p) => aiMatch.skus.includes(p.sku));
      list.sort((a, b) => aiMatch.skus.indexOf(a.sku) - aiMatch.skus.indexOf(b.sku));
      return list;
    }
    // Availability is the primary key for every sort, so re-sorting by price
    // or GWP can never lift an out-of-stock cylinder above a purchasable one.
    if (sort === "price") return sortProducts(list, (a, b) => a.cylinderPrice - b.cylinderPrice);
    if (sort === "gwp") return sortProducts(list, (a, b) => (a.gwp ?? 0) - (b.gwp ?? 0));
    return sortProducts(list);
  }, [products, filters, purity, maxPrice, sort, aiMatch]);

  const countFor = (key: keyof Filters, value: string) =>
    products.filter((p) =>
      key === "cat" ? p.category === value : key === "weight" ? String(p.weightLb) === value : p.stockLevel === value
    ).length;

  const filterGroups: Array<{ key: keyof Filters; labelKey: string; options: Array<{ value: string; label: string }> }> = [
    {
      key: "cat",
      labelKey: "groupCategory",
      options: Object.entries(CATEGORY_LABEL_KEY).map(([value, k]) => ({ value, label: tCat(k) })),
    },
    { key: "weight", labelKey: "groupWeight", options: WEIGHT_OPTIONS.map((w) => ({ value: w, label: `${w} lb` })) },
    { key: "stock", labelKey: "groupStock", options: STOCK_OPTIONS.map((s) => ({ value: s, label: t(STOCK_TONES[s].labelKey) })) },
  ];

  const addToCart = (product: StoreProduct) => {
    // Belt and braces: the button is disabled and the server re-checks at
    // checkout, but never let an out-of-stock line into the cart from here.
    if (!isPurchasable(product)) return;
    addItem({
      sku: product.sku,
      name: product.name,
      variant: product.weightLabel,
      pricePerKg: product.pricePerKg,
      weightKg: product.weightKg,
      deposit: product.cylinderDeposit,
    });
    setAdded((a) => [...a, product.sku]);
  };

  const chips = [t("chip1"), t("chip2"), t("chip3")];

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
      <Header onSignInClick={() => setIsAuthModalOpen(true)} />

      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1100px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_46%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_46%,transparent_100%)]">
          <div className="absolute -top-[300px] left-[16%] h-[880px] w-[880px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-30 blur-[120px] [animation:hc-float_28s_ease-in-out_infinite]" />
          <div className="absolute -top-[200px] right-[-8%] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.28] blur-[120px] [animation:hc-float_34s_ease-in-out_infinite_reverse]" />
          <div className="absolute left-[-6%] top-[120px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-20 blur-[110px] [animation:hc-float_40s_ease-in-out_infinite]" />
        </div>

        <main className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-11">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("eyebrow")}</div>
            <h1 className="m-0 text-[40px] font-semibold leading-[1.05] tracking-[-.045em]">{t("title")}</h1>
            <p className="mt-3 max-w-[520px] text-[15px] leading-[1.6] text-slate-600 dark:text-ink-muted">
              {t("subtitle")}
            </p>

            {/* The term that produced this list, and the way out of it. */}
            <AnimatePresence initial={false}>
              {searchTerm && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  data-search-chip
                  className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-cyan-500/40 bg-cyan-500/[.08] py-2 pl-3.5 pr-2 text-[12.5px] shadow-[0_0_24px_-10px_rgba(6,182,212,.9)]"
                >
                  <Search size={13} strokeWidth={2.2} className="flex-none text-cyan-700 dark:text-cyan-300" />
                  <span className="min-w-0 truncate">{t("searchResultsFor", { query: searchTerm })}</span>
                  <span className="flex-none rounded-full bg-cyan-500/15 px-2 py-[3px] text-[10.5px] font-semibold tabular-nums text-cyan-800 dark:text-cyan-200">
                    {t("resultCount", { count: products.length })}
                  </span>
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label={t("searchClearAria")}
                    data-search-chip-clear
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300"
                  >
                    <X size={13} strokeWidth={2.4} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* strict 12-col grid: sidebar locked to 3, content to 9 */}
          <div className="mt-10 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <motion.aside
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              // Sticks under the 70px header (+24px breathing room) with a fixed
              // height. It does NOT scroll itself — scrolling here would drag the
              // glass card's own rounded top and padding out of view. The inner
              // body below owns the scrolling instead.
              className="lg:sticky lg:top-[94px] lg:col-span-3 lg:h-[calc(100vh-118px)]"
              data-filters
            >
              <div className="relative rounded-[26px] border border-slate-900/[.14] bg-white/70 p-[22px] shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 lg:flex lg:h-full lg:flex-col lg:overflow-hidden dark:border-hairline-strong dark:bg-glass">
                {/* Pinned: stays put while the groups below scroll */}
                <div className="mb-5 flex flex-none items-baseline justify-between gap-3">
                  <h2 className="m-0 text-[12.5px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("filters")}</h2>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11.5px] font-semibold text-blue-700 dark:text-blue-400"
                  >
                    {t("reset")}
                  </button>
                </div>

                {/* The only scroll container: pr-2 keeps the thin bar off the
                    controls, pb-4 stops the last filter touching the card edge. */}
                <div className="scrollbar-slim lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-4 lg:pr-2" data-filters-scroll>

                  {filterGroups.map((group) => (
                    <div key={group.key} className="mb-5 border-b border-slate-900/[.07] pb-5 dark:border-hairline">
                      <div className="mb-3 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t(group.labelKey)}
                      </div>
                      <div className="flex flex-col gap-[3px]">
                        {group.options.map((option) => {
                          const on = filters[group.key].includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => toggle(group.key, option.value)}
                              className={`flex min-h-[38px] w-full items-center gap-[11px] rounded-[11px] px-2 text-left text-[12.5px] tracking-[-.01em] transition-colors hover:bg-slate-900/[.05] dark:hover:bg-white/10 ${
                                on ? "font-semibold text-slate-900 dark:text-slate-50" : "font-medium text-slate-600 dark:text-ink-muted"
                              }`}
                            >
                              <span
                                className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-[1.5px] transition-all duration-200 ${
                                  on
                                    ? "border-blue-700 bg-blue-700 shadow-[0_0_14px_-2px_#1d4ed8]"
                                    : "border-slate-900/[.14] dark:border-hairline-strong"
                                }`}
                              >
                                {on && <Check size={11} strokeWidth={3} className="text-white" />}
                              </span>
                              <span className="min-w-0 flex-1">{option.label}</span>
                              <span className="text-[11px] text-slate-400 dark:text-ink-muted">
                                {countFor(group.key, option.value)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Refrigerant mark — URL-backed, so it survives a share or reload */}
                  <div className="mb-5 border-b border-slate-900/[.07] pb-5 dark:border-hairline" data-gas-filter>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t("groupGasMark")}
                      </span>
                      {marksPending && <Loader2 size={12} strokeWidth={2.4} className="animate-spin text-blue-700 dark:text-blue-400" />}
                    </div>
                    <div className="flex flex-col gap-[3px]">
                      {visibleMarks.map((mark) => {
                        const on = marks.includes(mark);
                        const count = gasMarkCounts[mark] ?? 0;
                        return (
                          <button
                            key={mark}
                            type="button"
                            onClick={() => toggleMark(mark)}
                            aria-pressed={on}
                            data-gas-mark={mark}
                            className={`flex min-h-[38px] w-full items-center gap-[11px] rounded-[11px] px-2 text-left text-[12.5px] tracking-[-.01em] transition-colors hover:bg-slate-900/[.05] dark:hover:bg-white/10 ${
                              on ? "font-semibold text-slate-900 dark:text-slate-50" : "font-medium text-slate-600 dark:text-ink-muted"
                            }`}
                          >
                            <span
                              className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-[1.5px] transition-all duration-200 ${
                                on
                                  ? "border-blue-700 bg-blue-700 shadow-[0_0_14px_-2px_#1d4ed8]"
                                  : "border-slate-900/[.14] dark:border-hairline-strong"
                              }`}
                            >
                              {on && <Check size={11} strokeWidth={3} className="text-white" />}
                            </span>
                            <span className="min-w-0 flex-1">{mark}</span>
                            <span className="text-[11px] text-slate-400 dark:text-ink-muted">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {GAS_MARKS.length > GAS_MARKS_COLLAPSED_COUNT && (
                      <button
                        type="button"
                        onClick={() => setMarksExpanded((v) => !v)}
                        data-gas-toggle
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[11px] py-2 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-700/[.07] dark:text-blue-400 dark:hover:bg-blue-400/10"
                      >
                        {marksExpanded ? t("showLess") : t("showMore", { count: GAS_MARKS.length - GAS_MARKS_COLLAPSED_COUNT })}
                        <ChevronDown
                          size={13}
                          strokeWidth={2.4}
                          className={`transition-transform duration-200 ${marksExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  <div className="mb-5 border-b border-slate-900/[.07] pb-5 dark:border-hairline">
                    <div className="mb-3.5 flex items-baseline justify-between gap-3">
                      <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t("minPurity")}
                      </span>
                      <span className="text-[12.5px] font-semibold tracking-[-.02em] text-blue-700 dark:text-blue-400">
                        {purity.toFixed(2)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={99}
                      max={99.99}
                      step={0.01}
                      value={purity}
                      onChange={(e) => setPurity(Number(e.target.value))}
                      aria-label={t("minPurity")}
                      className="hc-range w-full"
                      style={sliderTrack(purity, 99, 99.99)}
                    />
                  </div>

                  <div>
                    <div className="mb-3.5 flex items-baseline justify-between gap-3">
                      <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t("maxPrice")}
                      </span>
                      <span className="text-[12.5px] font-semibold tracking-[-.02em] text-blue-700 dark:text-blue-400">
                        €{maxPrice}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={900}
                      step={10}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                      aria-label={t("maxPrice")}
                      className="hc-range w-full"
                      style={sliderTrack(maxPrice, 100, 900)}
                    />
                    <div className="mt-2 flex justify-between text-[10.5px] text-slate-400 dark:text-ink-muted">
                      <span>€100</span>
                      <span>€900</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>

            <div className="min-w-0 lg:col-span-9">
              {/* Smart Match — sweeping gradient border while the real AI runs */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                data-smart-match
                className="relative w-full overflow-hidden rounded-3xl p-[1.5px]"
                style={{
                  background: aiPending
                    ? `linear-gradient(90deg,${ACCENT},#22d3ee,#7c3aed,${ACCENT})`
                    : "var(--hc-cat-border)",
                  backgroundSize: aiPending ? "300% 100%" : undefined,
                  animation: aiPending ? "hc-sweep 2.4s linear infinite" : undefined,
                }}
              >
                <div className="relative rounded-[22.5px] bg-white/90 p-5 backdrop-blur-xl backdrop-saturate-150 dark:bg-[rgba(20,21,24,.92)]">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <motion.span
                      animate={aiPending ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                      transition={aiPending ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : undefined}
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-[15px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_14px_30px_-14px_rgba(37,99,235,.7)]"
                    >
                      <Sparkles size={20} strokeWidth={2} className="text-white" />
                    </motion.span>
                    <div className="min-w-[240px] flex-1">
                      <div className="mb-[7px] text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t("smartMatch")}
                      </div>
                      <input
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && runSmartMatch()}
                        placeholder={t("aiPlaceholder")}
                        className="w-full border-0 bg-transparent text-sm tracking-[-.015em] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
                      />
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => runSmartMatch()}
                      disabled={aiPending}
                      className="flex h-11 flex-none items-center justify-center gap-2 rounded-[14px] bg-blue-700 px-5 text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_16px_32px_-16px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800 disabled:opacity-70"
                    >
                      {aiPending && <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />}
                      {aiPending ? t("aiThinking") : t("aiButton")}
                    </motion.button>
                  </div>

                  <div className="mt-3.5 flex w-full flex-wrap gap-2">
                    {chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => runSmartMatch(chip)}
                        className="h-[30px] flex-none whitespace-nowrap rounded-full border border-slate-900/[.14] px-3 text-[11.5px] font-medium tracking-[-.005em] text-slate-600 transition-colors hover:bg-slate-900/[.05] dark:border-hairline-strong dark:text-ink-muted dark:hover:bg-white/10"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* AI result banner — the model's own reasoning */}
              <AnimatePresence>
                {aiMatch && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-blue-700/[.26] bg-blue-700/[.1] px-[18px] py-3.5"
                  >
                    <span className="h-[7px] w-[7px] flex-none rounded-full bg-blue-700 shadow-[0_0_10px_1px_#1d4ed8] dark:bg-blue-400 dark:shadow-[0_0_10px_1px_#60a5fa]" />
                    <span className="min-w-0 flex-1 text-[13px] leading-[1.6] text-slate-600 dark:text-slate-300">
                      {aiMatch.reason}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAiMatch(null)}
                      className="flex-none text-[11.5px] font-semibold text-blue-700 dark:text-blue-400"
                    >
                      {t("clear")}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* heading + sorts */}
              <div className="mt-6 flex flex-wrap items-baseline justify-between gap-5">
                <h2 className="m-0 text-[12.5px] tracking-[.09em] text-slate-400 dark:text-ink-muted">
                  {aiMatch ? t("aiRecommended") : t("allProducts")}
                </h2>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11.5px] text-slate-400 dark:text-ink-muted">
                    {t("resultCount", { count: rows.length })}
                  </span>
                  {SORTS.map((s) => {
                    const on = sort === s && !aiMatch;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSort(s)}
                        className={`h-8 rounded-full px-[13px] text-xs font-semibold tracking-[-.01em] transition-colors ${
                          on
                            ? "bg-blue-700 text-white"
                            : "border border-slate-900/[.14] text-slate-600 hover:bg-slate-900/[.05] dark:border-hairline-strong dark:text-ink-muted dark:hover:bg-white/10"
                        }`}
                      >
                        {t(`sort_${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* skeleton shimmer while the AI thinks */}
              {aiPending && (
                <div className="mt-[18px] grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-[18px]" data-skeletons>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-3xl border border-slate-900/[.07] bg-white/70 p-5 backdrop-blur-xl dark:border-hairline dark:bg-glass"
                    >
                      {["h-[150px] rounded-2xl mb-[18px]", "h-[13px] w-[72%] rounded-full mb-2.5", "h-[11px] w-[48%] rounded-full mb-2.5", "h-[11px] w-[32%] rounded-full"].map(
                        (cls, n) => (
                          <div
                            key={n}
                            className={`${cls} bg-[linear-gradient(90deg,var(--hc-cat-tile)_0%,var(--hc-cat-border)_40%,var(--hc-cat-tile)_80%)] bg-[length:340px_100%]`}
                            style={{ animation: `hc-shimmer 1.3s linear infinite ${i * 0.12}s` }}
                          />
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* product grid — layout animations glide survivors into place */}
              {!aiPending && rows.length > 0 && (
                <motion.div
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.15 } } }}
                  initial="hidden"
                  animate="show"
                  // No items-start: grid rows stretch so every card matches the
                  // tallest in its row, whether or not it carries the waitlist.
                  className="mt-[18px] grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-[18px]"
                  data-product-grid
                >
                  <AnimatePresence mode="popLayout">
                    {rows.map((product) => {
                      const tone = STOCK_TONES[product.stockLevel];
                      const on = hovered === product.sku;
                      const inCart = added.includes(product.sku);
                      const purchasable = isPurchasable(product);
                      const isAi = Boolean(aiMatch?.skus.includes(product.sku));
                      return (
                        <motion.div
                          key={product.sku}
                          layout
                          variants={{
                            hidden: { opacity: 0, y: 20, scale: 0.96 },
                            show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
                          }}
                          initial="hidden"
                          animate="show"
                          exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.25 } }}
                          whileHover={{ y: -5, scale: 1.02 }}
                          transition={{ layout: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }, type: "spring", stiffness: 300, damping: 26 }}
                          onMouseEnter={() => setHovered(product.sku)}
                          onMouseLeave={() => setHovered(null)}
                          data-product-card
                          className="relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white/60 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-surface/60"
                          style={{
                            borderColor: on ? "rgba(96,165,250,.5)" : "var(--hc-cat-border)",
                            boxShadow: on
                              ? "0 44px 88px -44px rgba(2,4,10,.66), 0 0 30px -8px rgba(59,130,246,.5)"
                              : "0 16px 40px -36px rgba(2,4,10,.5)",
                          }}
                        >
                          <span
                            className="pointer-events-none absolute -top-[46%] right-[-20%] h-[340px] w-[340px] rounded-full blur-[70px] transition-opacity duration-500"
                            style={{
                              background: `radial-gradient(circle,${tone.dot},transparent 68%)`,
                              opacity: on ? 0.26 : 0.1,
                            }}
                          />

                          <Link href={`/products/${product.id}`} className="relative m-3.5 mb-0 flex h-[168px] items-center justify-center overflow-hidden rounded-[18px] bg-slate-100 dark:bg-surface-3">
                            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(127,127,140,.07)_0_1px,transparent_1px_9px)]" />
                            {/* A still rendered from the product's own model;
                                the interactive version lives on the PDP. */}
                            <ProductThumbnail
                              sku={product.sku}
                              name={product.name}
                              fallback={CYLINDER_OUTLINE}
                              sizes="(max-width: 1024px) 45vw, 300px"
                            />
                            <span
                              className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border py-[5px] pl-2 pr-2.5 text-[10.5px] font-semibold ${tone.badge}`}
                            >
                              <motion.span
                                animate={tone.pulse ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                                transition={tone.pulse ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
                                className="h-[5px] w-[5px] flex-none rounded-full"
                                style={{ background: tone.dot, boxShadow: `0 0 7px 1px ${tone.dot}` }}
                              />
                              {t(tone.labelKey)}
                            </span>
                            {isAi && (
                              <span className="absolute right-3 top-3 inline-flex items-center rounded-full border border-[rgba(167,139,250,.4)] bg-[rgba(124,58,237,.18)] px-2.5 py-[5px] text-[10.5px] font-semibold text-[#6d28d9] dark:text-[#c4b5fd]">
                                {t("aiMatchTag")}
                              </span>
                            )}
                          </Link>

                          <div className="relative flex flex-1 flex-col p-5">
                            {/* Grows to absorb the spare height, so the price row
                                and the buy / waitlist block below it always sit
                                on the card's bottom edge. */}
                            <div className="flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <Link href={`/products/${product.id}`} className="text-[15px] font-semibold tracking-[-.03em] hover:text-blue-700 dark:hover:text-blue-400">
                                {product.name}
                              </Link>
                              <span className="text-[11px] text-slate-400 dark:text-ink-muted">{product.sku}</span>
                            </div>
                            <div className="mt-[5px] text-[11.5px] text-slate-400 dark:text-ink-muted">
                              {tCat(CATEGORY_LABEL_KEY[product.category] ?? "cylTitle")}
                            </div>

                            <div className="mt-[15px] grid grid-cols-3 gap-2">
                              {[
                                { label: t("specPurity"), value: product.purity !== null ? `${product.purity}%` : t("na") },
                                { label: t("specVolume"), value: product.pricedPerKg ? formatKg(product.weightKg) : product.weightLabel },
                                { label: t("specGwp"), value: product.gwp !== null ? String(product.gwp) : t("na") },
                              ].map((spec) => (
                                <span
                                  key={spec.label}
                                  className="block rounded-xl border border-slate-900/[.07] bg-slate-100 px-2.5 py-[9px] dark:border-hairline dark:bg-surface-3"
                                >
                                  <span className="block text-[9.5px] tracking-[.06em] text-slate-400 dark:text-ink-muted">
                                    {spec.label}
                                  </span>
                                  {/* Two-line box always: a long value like
                                      "50 lb cylinder" wraps without making this
                                      card taller than the rest of the grid. */}
                                  <span className="mt-[3px] line-clamp-2 block min-h-[34px] text-xs font-semibold leading-[17px] tracking-[-.015em]">
                                    {spec.value}
                                  </span>
                                </span>
                              ))}
                            </div>
                            </div>

                            <div className="mt-[18px] flex items-center justify-between gap-3">
                              {/* Fixed height and single lines: a long fallback like
                                  "Price on request" must not wrap and make this
                                  card taller than its neighbours. */}
                              <span className="flex h-16 min-w-0 flex-col justify-center">
                                {/* The cylinder is what gets ordered, so it
                                    leads; the €/kg rate follows below. */}
                                <span className="flex items-baseline gap-1">
                                  <span
                                    data-card-price
                                    className={`block truncate font-semibold tracking-[-.04em] ${
                                      product.pricePerKg > 0 ? "text-xl" : "text-[13.5px]"
                                    }`}
                                  >
                                    {product.pricePerKg > 0 ? eur(product.cylinderPrice) : t("priceOnRequest")}
                                  </span>
                                </span>
                                {/* Two lines allowed so the cylinder price is
                                    never cut off; the box height is fixed so it
                                    costs the same on every card. */}
                                <span
                                  className="mt-0.5 line-clamp-2 block text-[11px] leading-[16px] text-slate-400 dark:text-ink-muted"
                                  data-cylinder-price
                                >
                                  {!product.pricedPerKg
                                    ? t("unitExVat", { volume: product.weightLabel })
                                    : product.pricePerKg > 0
                                      ? t("perKgAmount", { amount: eur(product.pricePerKg) })
                                      : product.weightLabel}
                                </span>
                              </span>
                              {/* The action slot is the ONLY thing that differs
                                  between an in-stock and an out-of-stock card —
                                  same box, same height, muted styling. */}
                              {purchasable ? (
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => addToCart(product)}
                                  disabled={inCart}
                                  className={`flex h-10 flex-none items-center justify-center rounded-[13px] px-4 text-[12.5px] font-semibold tracking-[-.01em] text-white transition-[opacity,background-color,box-shadow] duration-300 ${
                                    inCart
                                      ? "bg-green-600 opacity-100 shadow-[0_16px_32px_-14px_#16a34a]"
                                      : `bg-blue-700 hover:bg-blue-800 ${on ? "opacity-100 shadow-[0_16px_32px_-14px_#1d4ed8]" : "opacity-[.45]"}`
                                  }`}
                                >
                                  {inCart ? tHome("added") : tHome("addToCart")}
                                </motion.button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setNotifyFor(product)}
                                  title={t("notifyModalTitle")}
                                  data-unavailable-cta
                                  className="flex h-10 flex-none items-center justify-center gap-1.5 rounded-[13px] border border-slate-900/[.14] bg-slate-900/[.04] px-4 text-[12.5px] font-semibold tracking-[-.01em] text-slate-500 transition-colors hover:bg-slate-900/[.08] hover:text-slate-700 dark:border-hairline-strong dark:bg-white/[.05] dark:text-ink-muted dark:hover:bg-white/[.09] dark:hover:text-slate-300"
                                >
                                  <BellRing size={13} strokeWidth={2.2} />
                                  {t("unavailableCta")}
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* empty state */}
              {!aiPending && rows.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-[18px] rounded-3xl border border-dashed border-slate-900/[.14] bg-white/70 px-7 py-14 text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass"
                >
                  <div className="text-[15px] font-semibold tracking-[-.025em]">{t("emptyTitle")}</div>
                  <p className="mx-0 mb-[18px] mt-2.5 text-[13.5px] text-slate-600 dark:text-ink-muted">{t("emptyBody")}</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-11 items-center justify-center rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800"
                  >
                    {t("resetFilters")}
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Waitlist lives here, not in the card, so the grid stays uniform */}
      <StockNotifyModal
        isOpen={notifyFor !== null}
        onClose={() => setNotifyFor(null)}
        productId={notifyFor?.id ?? ""}
        productName={notifyFor?.name ?? ""}
      />
      </div>

      <div className="block md:hidden">
        <MobileProductsLayout
          products={products}
          initialCategory={initialCategory}
          gasMarks={marks}
          gasMarkCounts={gasMarkCounts}
          onToggleGasMark={toggleMark}
          gasMarksPending={marksPending}
        />
      </div>
    </div>
  );
}
