"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Check,
  ChevronLeft,
  LayoutGrid,
  Plus,
  Rows3,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { smartMatch, type SmartMatchResult } from "@/lib/actions/smartMatch";
import { useCartStore, selectCartCount } from "@/lib/store/cart";
import { useCartCount } from "./CartCountProvider";
import type { StoreProduct } from "@/lib/data";

const STOCK_TONE = {
  in: { fg: "#34d399", bg: "rgba(16,185,129,.16)", bd: "rgba(16,185,129,.32)", labelKey: "stockIn" },
  low: { fg: "#fbbf24", bg: "rgba(245,158,11,.16)", bd: "rgba(245,158,11,.34)", labelKey: "stockLow" },
  order: { fg: "#38bdf8", bg: "rgba(56,189,248,.16)", bd: "rgba(56,189,248,.32)", labelKey: "stockOrder" },
} as const;

const CATEGORY_KEY: Record<string, string> = {
  cylinders: "catCylinders",
  blends: "catBlends",
  equipment: "catEquipment",
  recovery: "catRecovery",
};

const PURITY_MIN = 99;
const PURITY_MAX = 99.99;

interface Filters {
  cat: string[];
  weight: string[];
  stock: string[];
}

interface MobileProductsLayoutProps {
  products: StoreProduct[];
  initialCategory: string | null;
}

export default function MobileProductsLayout({ products, initialCategory }: MobileProductsLayoutProps) {
  const t = useTranslations("Products");
  const tm = useTranslations("HomeMobile");
  const format = useFormatter();
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const [density, setDensity] = useState<"grid" | "rows">("grid");
  const [sheet, setSheet] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    cat: initialCategory ? [initialCategory] : [],
    weight: [],
    stock: [],
  });
  // Real price bounds from the live catalog, rounded to €10.
  // Ceil so the slider's leftmost stop still matches the cheapest product.
  const priceMin = useMemo(() => Math.ceil(Math.min(...products.map((p) => p.price)) / 10) * 10, [products]);
  const priceMax = useMemo(() => Math.ceil(Math.max(...products.map((p) => p.price)) / 10) * 10, [products]);
  const [purity, setPurity] = useState(PURITY_MIN);
  const [maxPrice, setMaxPrice] = useState(priceMax);

  const [aiQuery, setAiQuery] = useState("");
  const [aiState, setAiState] = useState<"idle" | "thinking" | "done" | "error">("idle");
  const [aiSkus, setAiSkus] = useState<string[]>([]);
  const [aiReason, setAiReason] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);

  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const realCartCount = useCartStore(selectCartCount);
  const { setCartCount } = useCartCount();
  useEffect(() => {
    setCartCount(realCartCount);
  }, [realCartCount, setCartCount]);

  // Facet options with live counts, derived from the catalog itself.
  const weightOptions = useMemo(() => {
    const distinct = [...new Set(products.map((p) => p.weightLb).filter((w): w is number => !!w && w > 0))];
    return distinct.sort((a, b) => a - b).map((w) => ({ value: String(w), label: `${w} lb` }));
  }, [products]);

  const countFor = (key: keyof Filters, value: string) =>
    products.filter((p) =>
      key === "cat" ? p.category === value : key === "weight" ? String(p.weightLb) === value : p.stockLevel === value
    ).length;

  const toggle = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));

  const resetFilters = () => {
    setFilters({ cat: [], weight: [], stock: [] });
    setPurity(PURITY_MIN);
    setMaxPrice(priceMax);
    setAiQuery("");
    setAiState("idle");
    setAiSkus([]);
  };

  const runAi = async (query?: string) => {
    const text = (query ?? aiQuery).trim();
    if (!text || aiState === "thinking") return;
    setAiQuery(text);
    setAiState("thinking");
    setAiSkus([]);
    let result: SmartMatchResult;
    try {
      result = await smartMatch(text);
    } catch {
      result = { ok: false, code: "UNAVAILABLE" };
    }
    if (!result.ok) {
      setAiState("error");
      return;
    }
    setAiSkus(result.skus);
    setAiReason(result.reason);
    setAiState("done");
  };

  const thinking = aiState === "thinking";
  const answered = aiState === "done";

  const rows = useMemo(() => {
    let list = products.filter(
      (p) =>
        (filters.cat.length === 0 || filters.cat.includes(p.category)) &&
        (filters.weight.length === 0 || filters.weight.includes(String(p.weightLb))) &&
        (filters.stock.length === 0 || filters.stock.includes(p.stockLevel)) &&
        (purity <= PURITY_MIN || (p.purity !== null && p.purity >= purity)) &&
        p.price <= maxPrice
    );
    if (answered && aiSkus.length > 0) {
      list = list
        .filter((p) => aiSkus.includes(p.sku))
        .sort((a, b) => aiSkus.indexOf(a.sku) - aiSkus.indexOf(b.sku));
    }
    return list;
  }, [products, filters, purity, maxPrice, answered, aiSkus]);

  const activeCount =
    filters.cat.length +
    filters.weight.length +
    filters.stock.length +
    (purity > PURITY_MIN ? 1 : 0) +
    (maxPrice < priceMax ? 1 : 0);

  const activeChips: Array<{ id: string; label: string; clear: () => void }> = [
    ...filters.cat.map((v) => ({ id: `cat-${v}`, label: t(CATEGORY_KEY[v] ?? "catCylinders"), clear: () => toggle("cat", v) })),
    ...filters.weight.map((v) => ({ id: `w-${v}`, label: `${v} lb`, clear: () => toggle("weight", v) })),
    ...filters.stock.map((v) => ({
      id: `s-${v}`,
      label: t(STOCK_TONE[v as keyof typeof STOCK_TONE].labelKey),
      clear: () => toggle("stock", v),
    })),
    ...(purity > PURITY_MIN ? [{ id: "purity", label: `≥ ${purity.toFixed(2)}%`, clear: () => setPurity(PURITY_MIN) }] : []),
    ...(maxPrice < priceMax ? [{ id: "price", label: `≤ €${maxPrice}`, clear: () => setMaxPrice(priceMax) }] : []),
  ];

  const twoUp = density === "grid";
  const sliderBg = (value: number, min: number, max: number) => {
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return `linear-gradient(90deg,#2563eb 0%,#2563eb ${pct}%,var(--hc-cat-border,rgba(15,23,42,.16)) ${pct}%,var(--hc-cat-border,rgba(15,23,42,.16)) 100%)`;
  };

  const groups: Array<{ key: keyof Filters; label: string; options: Array<{ value: string; label: string }> }> = [
    {
      key: "cat",
      label: t("groupCategory"),
      options: Object.entries(CATEGORY_KEY).map(([value, k]) => ({ value, label: t(k) })),
    },
    { key: "weight", label: t("groupWeight"), options: weightOptions },
    {
      key: "stock",
      label: t("groupStock"),
      options: (["in", "low", "order"] as const).map((value) => ({ value, label: t(STOCK_TONE[value].labelKey) })),
    },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-white dark:bg-canvas">
      {/* ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[170px] left-[-26%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.28] blur-[90px] [animation:hc-breathe_11s_ease-in-out_infinite]" />
        <div className="absolute -top-[120px] right-[-24%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.26] blur-[86px] [animation:hc-breathe_14s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[8%] top-[430px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.16] blur-[84px] [animation:hc-breathe_17s_ease-in-out_infinite]" />
      </div>

      {/* sticky glass bar */}
      <div className="sticky top-0 z-[80] border-b border-slate-900/[.06] bg-white/80 px-[18px] pb-3 pt-3 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-[#141518]/80">
        <div className="mb-[11px] flex items-center gap-2">
          <motion.div whileTap={{ scale: 0.9 }} className="flex flex-none">
            <Link
              href="/categories"
              aria-label={t("backAria")}
              className="-ml-[11px] flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-slate-900/[.06] dark:hover:bg-white/10"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </Link>
          </motion.div>
          <span className="min-w-0 flex-1 text-base font-semibold tracking-[-.03em]">{t("mobileTitle")}</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setDensity((v) => (v === "grid" ? "rows" : "grid"))}
            aria-label={t("layoutToggleAria")}
            data-density-toggle
            className="-mr-[11px] flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/[.06] dark:text-ink-muted dark:hover:bg-white/10"
          >
            {twoUp ? <Rows3 size={18} strokeWidth={1.9} /> : <LayoutGrid size={18} strokeWidth={1.9} />}
          </motion.button>
        </div>

        <div className="flex items-center gap-[9px]">
          {/* compact AI match input */}
          <div
            className="relative min-w-0 flex-1 overflow-hidden rounded-2xl p-[1.5px]"
            style={
              thinking
                ? {
                    background: "linear-gradient(90deg,#2563eb,#22d3ee,#7c3aed,#2563eb)",
                    backgroundSize: "300% 100%",
                    animation: "hc-sweep 2.2s linear infinite",
                  }
                : { background: "var(--hc-cat-border, rgba(15,23,42,.14))" }
            }
          >
            <div className="flex h-[45px] items-center gap-2 rounded-[14.5px] bg-white pl-3 pr-[5px] dark:bg-[#090A0C]/90">
              <motion.span
                animate={thinking ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                transition={thinking ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : undefined}
                className="flex flex-none"
              >
                <Sparkles size={15} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
              </motion.span>
              <input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAi()}
                placeholder={t("aiPlaceholderShort")}
                data-ai-input
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[12.5px] tracking-[-.01em] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => runAi()}
                aria-label={t("aiButton")}
                data-ai-send
                className="flex h-[35px] w-[35px] flex-none items-center justify-center rounded-[11px] bg-blue-700 shadow-[0_10px_20px_-10px_#2563eb] transition-colors hover:bg-blue-800"
              >
                <Send size={13} strokeWidth={2} className="text-white" />
              </motion.button>
            </div>
          </div>

          {/* filter trigger with glowing count */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setSheet(true)}
            aria-label={t("filters")}
            data-filter-open
            className={`relative flex h-12 w-12 flex-none items-center justify-center rounded-2xl border transition-colors ${
              activeCount > 0
                ? "border-blue-700 bg-blue-700 text-white shadow-[0_14px_28px_-14px_#2563eb,0_0_20px_-8px_#2563eb]"
                : "border-slate-900/[.14] bg-slate-100 text-slate-900 dark:border-hairline-strong dark:bg-surface-3 dark:text-slate-50"
            }`}
          >
            <SlidersHorizontal size={19} strokeWidth={2} />
            {activeCount > 0 && (
              <span
                data-filter-count
                className="absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-white bg-white px-[5px] text-[10px] font-bold text-[#0b0d10] shadow-[0_0_14px_0_rgba(255,255,255,.55)] dark:border-[#0b0d10]"
              >
                {activeCount}
              </span>
            )}
          </motion.button>
        </div>

        {/* active filter chips */}
        {activeChips.length > 0 && (
          <div className="mt-[11px] flex flex-wrap gap-[7px]" data-active-chips>
            {activeChips.map((chip) => (
              <motion.button
                key={chip.id}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={chip.clear}
                className="inline-flex min-h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-700/[.34] bg-blue-700/[.12] py-0 pl-[11px] pr-[9px] text-[11px] font-semibold text-blue-700 dark:bg-blue-600/[.16] dark:text-blue-400"
              >
                {chip.label}
                <X size={11} strokeWidth={2.6} />
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <div className="relative pb-[calc(118px+env(safe-area-inset-bottom))]">
        {/* AI state strip */}
        {(thinking || answered || aiState === "error") && (
          <div className="px-[18px] pt-3">
            {thinking ? (
              <div className="flex items-center gap-[5px] rounded-[15px] border border-slate-900/[.08] bg-white/70 px-3.5 py-3 backdrop-blur-xl dark:border-hairline dark:bg-glass">
                {[0, 0.16, 0.32].map((d) => (
                  <span
                    key={d}
                    className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400"
                    style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                  />
                ))}
                <span className="ml-1 text-[11.5px] text-slate-500 dark:text-ink-muted">{tm("aiThinking")}</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                data-ai-answer
                className={`flex items-start gap-[9px] rounded-[15px] border px-3.5 py-3 ${
                  aiState === "error"
                    ? "border-[rgba(245,158,11,.28)] bg-[rgba(245,158,11,.1)]"
                    : "border-blue-700/[.28] bg-blue-700/[.08] dark:bg-blue-600/[.12]"
                }`}
              >
                <Check size={13} strokeWidth={2.6} className="mt-0.5 flex-none text-blue-700 dark:text-blue-400" />
                <span className="min-w-0 flex-1 text-[11.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
                  {aiState === "error" ? t("aiError") : aiReason}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAiQuery("");
                    setAiState("idle");
                    setAiSkus([]);
                  }}
                  className="flex-none text-[11px] font-semibold text-blue-700 dark:text-blue-400"
                >
                  {t("clear")}
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* heading row */}
        <div className="flex items-baseline justify-between gap-3 px-[18px] pt-4">
          <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
            {answered ? t("aiRecommended") : t("allProducts")}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-ink-muted" data-result-count>
            {t("resultCount", { count: rows.length })}
          </span>
        </div>

        {/* shimmer skeletons while the model runs */}
        {thinking && (
          <div className={`grid gap-[13px] px-[18px] pt-[13px] ${twoUp ? "grid-cols-2" : "grid-cols-1"}`} data-skeletons>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[22px] border border-slate-900/[.08] bg-white/70 p-3 dark:border-hairline dark:bg-glass">
                {[
                  { h: twoUp ? "h-[104px]" : "h-[132px]", w: "w-full", mb: "mb-3.5", r: "rounded-2xl" },
                  { h: "h-[11px]", w: "w-[70%]", mb: "mb-[9px]", r: "rounded-full" },
                  { h: "h-2.5", w: "w-[42%]", mb: "", r: "rounded-full" },
                ].map((line, j) => (
                  <div
                    key={j}
                    className={`${line.h} ${line.w} ${line.mb} ${line.r} bg-[linear-gradient(90deg,var(--hc-cat-tile,#f1f5f9)_0%,rgba(127,127,140,.15)_40%,var(--hc-cat-tile,#f1f5f9)_80%)] [background-size:300px_100%]`}
                    style={{ animation: `hc-shimmer 1.3s linear infinite ${i * 0.12}s` }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* product grid */}
        {!thinking && rows.length > 0 && (
          <div
            className={`grid items-start gap-[13px] px-[18px] pt-[13px] ${twoUp ? "grid-cols-2" : "grid-cols-1"}`}
            data-product-grid={density}
          >
            <AnimatePresence mode="popLayout">
              {rows.map((product, i) => {
                const st = STOCK_TONE[product.stockLevel];
                const isAi = answered && aiSkus.includes(product.sku);
                const inCart = cartItems.some((c) => c.sku === product.sku);
                const down = pressed === product.sku;
                return (
                  <motion.div
                    key={product.sku}
                    layout
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 } }}
                    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
                    className="flex"
                  >
                    <div
                      data-product-card={product.sku}
                      className={`relative flex w-full overflow-hidden rounded-[22px] border border-slate-900/[.08] bg-white/70 shadow-[0_16px_40px_-34px_rgba(0,0,0,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass ${
                        twoUp ? "flex-col" : "flex-row"
                      }`}
                    >
                      <span
                        className="pointer-events-none absolute -top-[56%] right-[-30%] h-[260px] w-[260px] rounded-full opacity-[.14] blur-[58px]"
                        style={{ background: `radial-gradient(circle,${st.fg},transparent 68%)` }}
                      />

                      {/* image tile → PDP */}
                      <Link
                        href={`/products/${product.id}`}
                        className={`relative flex flex-none items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-surface-3 ${
                          twoUp ? "m-2.5 mb-0 h-[104px]" : "m-2.5 mr-0 w-[108px]"
                        }`}
                      >
                        <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(127,127,140,.06)_0_1px,transparent_1px_9px)]" />
                        <span
                          className={`block rounded-t-2xl rounded-b-[5px] border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))] ${
                            twoUp ? "h-[60px] w-[30px]" : "h-[70px] w-[34px]"
                          }`}
                        />
                        <span
                          className="absolute left-2 top-2 inline-flex items-center gap-[5px] rounded-full border py-1 pl-1.5 pr-2 text-[9px] font-semibold"
                          style={{ background: st.bg, borderColor: st.bd, color: st.fg, boxShadow: `0 0 14px -5px ${st.fg}` }}
                        >
                          <span
                            className="h-1 w-1 flex-none rounded-full"
                            style={{
                              background: st.fg,
                              boxShadow: `0 0 6px 1px ${st.fg}`,
                              animation: product.stockLevel === "in" ? undefined : "hc-glow 2.2s ease-in-out infinite",
                            }}
                          />
                          {t(st.labelKey)}
                        </span>
                        {isAi && (
                          <span className="absolute right-2 top-2 inline-flex items-center rounded-full border border-[rgba(167,139,250,.44)] bg-[rgba(124,58,237,.24)] px-2 py-1 text-[9px] font-bold text-[#6d28d9] dark:text-[#c4b5fd]">
                            AI
                          </span>
                        )}
                      </Link>

                      <div className={`relative flex min-w-0 flex-1 flex-col ${twoUp ? "p-3 pt-3" : "p-3 pl-3"}`}>
                        <Link href={`/products/${product.id}`} className="block">
                          <span className={`block font-semibold leading-[1.25] tracking-[-.028em] ${twoUp ? "text-[13px]" : "text-[14.5px]"}`}>
                            {product.name}
                          </span>
                          <span className="mt-[3px] block text-[10.5px] text-slate-400 dark:text-ink-muted">
                            {twoUp ? product.weightLabel : `${product.sku} · ${product.weightLabel}`}
                          </span>
                        </Link>

                        <div className="mt-[11px] flex flex-wrap gap-1.5">
                          {(twoUp
                            ? [{ label: t("specGwp"), value: product.gwp !== null ? String(product.gwp) : t("na") }]
                            : [
                                { label: t("specPurity"), value: product.purity !== null ? `${product.purity}%` : t("na") },
                                { label: t("specVolume"), value: product.weightLabel },
                                { label: t("specGwp"), value: product.gwp !== null ? String(product.gwp) : t("na") },
                              ]
                          ).map((spec) => (
                            <span
                              key={spec.label}
                              className={`block rounded-[11px] border border-slate-900/[.07] bg-slate-100 px-[9px] py-[7px] dark:border-hairline dark:bg-surface-3 ${
                                twoUp ? "flex-none" : "min-w-0 flex-1"
                              }`}
                            >
                              <span className="block text-[8.5px] tracking-[.06em] text-slate-400 dark:text-ink-muted">{spec.label}</span>
                              <span className="mt-0.5 block text-[11px] font-semibold tracking-[-.015em]">{spec.value}</span>
                            </span>
                          ))}
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-2.5 pt-[13px]">
                          <span className="min-w-0">
                            <span className="block text-base font-semibold tracking-[-.035em]">{eur(product.price)}</span>
                            <span className="mt-px block text-[9.5px] text-slate-400 dark:text-ink-muted">
                              {twoUp ? t("exVatShort") : t("unitExVat", { volume: product.weightLabel })}
                            </span>
                          </span>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onTouchStart={() => setPressed(product.sku)}
                            onTouchEnd={() => setPressed(null)}
                            onMouseDown={() => setPressed(product.sku)}
                            onMouseUp={() => setPressed(null)}
                            onMouseLeave={() => setPressed(null)}
                            onClick={() =>
                              addItem(
                                { sku: product.sku, name: product.name, variant: product.weightLabel, price: product.price },
                                1
                              )
                            }
                            disabled={!product.inStock}
                            aria-label={tm("addToCartAria", { name: product.name })}
                            className={`flex h-11 w-11 flex-none items-center justify-center rounded-[15px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              inCart
                                ? "bg-green-600 shadow-[0_14px_28px_-12px_#16a34a]"
                                : "bg-blue-700 shadow-[0_14px_28px_-12px_#2563eb] hover:bg-blue-800"
                            } ${down ? "scale-90" : ""}`}
                          >
                            {inCart ? <Check size={18} strokeWidth={2.6} /> : <Plus size={18} strokeWidth={2.6} />}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* empty state */}
        {!thinking && rows.length === 0 && (
          <div className="mx-[18px] mt-[13px] rounded-3xl border border-dashed border-slate-900/[.16] bg-white/70 px-[22px] py-11 text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass" data-empty-state>
            <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-[18px] border border-slate-900/[.08] bg-slate-100 dark:border-hairline dark:bg-surface-3">
              <Search size={22} strokeWidth={1.9} className="text-slate-400 dark:text-ink-muted" />
            </span>
            <div className="mt-4 text-[14.5px] font-semibold tracking-[-.025em]">{t("emptyTitle")}</div>
            <p className="mb-[18px] mt-[9px] text-xs leading-[1.55] text-slate-500 dark:text-ink-muted">{t("emptyBody")}</p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={resetFilters}
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-blue-700 px-5 text-[13px] font-semibold tracking-[-.015em] text-white shadow-[0_16px_32px_-16px_#2563eb] transition-colors hover:bg-blue-800"
            >
              {t("resetFilters")}
            </motion.button>
          </div>
        )}
      </div>

      {/* filter bottom sheet */}
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              onClick={() => setSheet(false)}
              aria-hidden="true"
              className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[4px]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={t("filters")}
              data-filter-sheet
              className="fixed inset-x-0 bottom-0 z-[111] rounded-t-[28px] border border-b-0 border-slate-900/[.12] bg-white/95 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-[#141518]/95"
            >
              <div className="pb-1 pt-2.5">
                <div className="mx-auto h-1 w-11 rounded-full bg-slate-900/[.24] dark:bg-white/25" />
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-slate-900/[.08] px-5 pb-3.5 pt-1.5 dark:border-hairline">
                <span className="text-[15.5px] font-semibold tracking-[-.03em]">{t("filters")}</span>
                <button type="button" onClick={resetFilters} className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {t("resetAll")}
                </button>
              </div>

              <div className="max-h-[452px] overflow-y-auto px-5 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {groups.map((group) => (
                  <div key={group.key} className="mb-[18px] border-b border-slate-900/[.08] pb-[18px] dark:border-hairline">
                    <div className="mb-[11px] text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option) => {
                        const on = filters[group.key].includes(option.value);
                        return (
                          <motion.button
                            key={option.value}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggle(group.key, option.value)}
                            data-filter-option={`${group.key}-${option.value}`}
                            className={`inline-flex min-h-11 flex-none items-center gap-[7px] rounded-full border px-3.5 text-[12.5px] tracking-[-.01em] transition-colors ${
                              on
                                ? "border-blue-700 bg-blue-700/[.14] font-semibold text-blue-700 shadow-[0_0_18px_-8px_#2563eb] dark:bg-blue-600/[.2] dark:text-blue-400"
                                : "border-slate-900/[.08] bg-slate-100 font-medium text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted"
                            }`}
                          >
                            {on && <Check size={13} strokeWidth={3} />}
                            {option.label}
                            <span className={`text-[10.5px] font-semibold ${on ? "opacity-70" : "opacity-60"}`}>
                              {countFor(group.key, option.value)}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="mb-[18px] border-b border-slate-900/[.08] pb-[18px] dark:border-hairline">
                  <div className="mb-[13px] flex items-baseline justify-between gap-3">
                    <span className="text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("minPurity")}</span>
                    <span className="text-[12.5px] font-semibold tracking-[-.02em] text-blue-700 dark:text-blue-400">
                      {purity.toFixed(2)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={PURITY_MIN}
                    max={PURITY_MAX}
                    step={0.01}
                    value={purity}
                    onChange={(e) => setPurity(Number(e.target.value))}
                    className="hc-range w-full"
                    style={{ background: sliderBg(purity, PURITY_MIN, PURITY_MAX) }}
                  />
                </div>

                <div className="pb-5">
                  <div className="mb-[13px] flex items-baseline justify-between gap-3">
                    <span className="text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("maxPrice")}</span>
                    <span className="text-[12.5px] font-semibold tracking-[-.02em] text-blue-700 dark:text-blue-400">
                      €{maxPrice}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={priceMin}
                    max={priceMax}
                    step={10}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="hc-range w-full"
                    style={{ background: sliderBg(maxPrice, priceMin, priceMax) }}
                  />
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400 dark:text-ink-muted">
                    <span>€{priceMin}</span>
                    <span>€{priceMax}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-900/[.08] bg-white/70 px-5 pb-[calc(22px+env(safe-area-inset-bottom))] pt-3.5 dark:border-hairline dark:bg-[#141518]/70">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSheet(false)}
                  data-filter-apply
                  className="flex h-[52px] w-full items-center justify-center rounded-[17px] bg-blue-700 text-[14.5px] font-semibold tracking-[-.02em] text-white shadow-[0_18px_36px_-16px_#2563eb] transition-colors hover:bg-blue-800"
                >
                  {t("applyShow", { count: rows.length })}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
