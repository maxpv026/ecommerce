"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, LayoutGrid, Loader2, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import StockNotifyModal from "./StockNotifyModal";
import MobileProductsLayout from "./MobileProductsLayout";
import SmartOrderButton from "./smartOrder/SmartOrderButton";
import { CatalogCard, CatalogRow, ROW_GRID } from "./catalog/CatalogItem";
import { CATEGORY_LABEL_KEY } from "./ProductCard";
import { ICON_TILE, SURFACE } from "./home/ui";
import { sortProducts } from "@/lib/productSort";
import { productHasGasMark } from "@/lib/gasMarks";
import { smartMatch } from "@/lib/actions/smartMatch";
import {
  CATEGORIES,
  EMPTY_FILTERS,
  GWP_LEVELS,
  KNOWN_MARKS,
  SAFETY_CLASSES,
  STOCK_LEVELS,
  USE_CASES,
  WEIGHT_BANDS,
  activeFilterCount,
  facetCount,
  filtersFromParams,
  filtersToParams,
  matchLocally,
  passes,
  type CatalogFilters,
  type FacetGroup,
  type UseCase,
} from "@/lib/catalogFacets";
import type { StoreProduct } from "@/lib/data";

/**
 * /products on desktop, in the Cart / Settings design language: the cart's
 * header bar (34 px title, middle-dot meta, pills on the same row),
 * max-w-7xl, 22 px surfaces, cart micro-badges, and a table view that is
 * the cart's line layout.
 *
 * Every filter runs in the browser over the whole catalog the server sent
 * (lib/catalogFacets) — instant, no request, no model call — and is
 * mirrored into the URL (replaceState) so a filtered view can be shared and
 * other pages can deep-link (?gasType=R32, ?category=equipment, ?use=ac).
 * Only `?search=` is applied on the server, with the header search's clause.
 *
 * The match bar reads gas codes, use cases, cylinder sizes and safety
 * classes locally (matchLocally); its presets are plain filter sets. Only a
 * sentence it cannot read goes to the AI matcher.
 */

const SORTS = ["featured", "price", "gwp"] as const;
const STOCK_KEY: Record<string, string> = { in: "stockIn", low: "stockLow", order: "stockOrder", out: "stockOut" };
type View = "grid" | "table";

interface ProductBrowserProps {
  /** The whole listed catalog (or the `?search=` result). */
  products: StoreProduct[];
  /** Free-text term from `?search=`, already applied to `products` by the server. */
  searchTerm: string;
}

export default function ProductBrowser({ products, searchTerm }: ProductBrowserProps) {
  const t = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);

  const [filters, setFilters] = useState<CatalogFilters>(() => filtersFromParams(new URLSearchParams(searchParams.toString())));
  const [view, setView] = useState<View>(() => (searchParams.get("view") === "table" ? "table" : "grid"));
  const [sort, setSort] = useState<(typeof SORTS)[number]>("featured");
  const [gasExpanded, setGasExpanded] = useState(false);

  // ── Match bar ──
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<{ kind: "local"; parts: string[] } | { kind: "ai"; reason: string; skus: string[] } | { kind: "error" } | null>(null);
  const [aiPending, startAi] = useTransition();
  const [searchPending, startSearch] = useTransition();

  // Mirror the filters and the view into the URL, without a navigation.
  useEffect(() => {
    const params = filtersToParams(filters, new URLSearchParams(window.location.search));
    if (view === "table") params.set("view", "table");
    else params.delete("view");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [filters, view]);

  const setGroup = (group: FacetGroup, value: string) =>
    setFilters((f) => {
      if (group === "use") return { ...f, use: f.use === value ? null : (value as UseCase) };
      const list = f[group];
      return { ...f, [group]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  const resetAll = () => {
    setFilters(EMPTY_FILTERS);
    setNote(null);
    setQuery("");
  };

  const aiSkus = note?.kind === "ai" ? note.skus : null;
  const rows = useMemo(() => {
    const list = products.filter((p) => passes(p, filters));
    if (aiSkus) return list.filter((p) => aiSkus.includes(p.sku)).sort((a, b) => aiSkus.indexOf(a.sku) - aiSkus.indexOf(b.sku));
    if (sort === "price") return sortProducts(list, (a, b) => a.cylinderPrice - b.cylinderPrice);
    if (sort === "gwp") return sortProducts(list, (a, b) => (a.gwp ?? 0) - (b.gwp ?? 0));
    return sortProducts(list);
  }, [products, filters, sort, aiSkus]);

  const count = (group: FacetGroup, value: string) => facetCount(products, filters, group, value);
  const label = (group: FacetGroup, value: string): string =>
    group === "use"
      ? t(`use_${value}`)
      : group === "marks"
        ? value.replace(/^R/, "R-")
        : group === "cat"
          ? tCat(CATEGORY_LABEL_KEY[value] ?? value)
          : group === "weight"
            ? t(`weight_${value}`)
            : group === "safety"
              ? t(`safety_${value}`)
              : group === "gwp"
                ? t(`gwp_${value}`)
                : t(STOCK_KEY[value] ?? "stockIn");

  const runMatch = (text = query) => {
    const q = text.trim();
    if (!q || aiPending) return;
    const local = matchLocally(q);
    if (local) {
      setFilters(local.filters);
      setNote({ kind: "local", parts: local.matched.map((m) => label(m.group, m.value)) });
      return;
    }
    // Nothing recognisable: the one path that asks the model.
    setNote(null);
    startAi(async () => {
      const result = await smartMatch(q).catch(() => null);
      if (!result?.ok) setNote({ kind: "error" });
      else {
        setFilters(EMPTY_FILTERS);
        setNote({ kind: "ai", reason: result.reason, skus: result.skus });
      }
    });
  };

  const clearSearch = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("search");
    const rest = params.toString();
    startSearch(() => router.replace(rest ? `/products?${rest}` : "/products", { scroll: false }));
  };

  const groups: Array<{ group: Exclude<FacetGroup, "use" | "marks">; title: string; values: readonly string[] }> = [
    { group: "cat", title: t("fCategory"), values: CATEGORIES },
    { group: "weight", title: t("fWeight"), values: WEIGHT_BANDS },
    { group: "safety", title: t("fSafety"), values: SAFETY_CLASSES },
    { group: "gwp", title: t("fGwp"), values: GWP_LEVELS },
    { group: "stock", title: t("fStock"), values: STOCK_LEVELS },
  ];
  const catalogMarks = KNOWN_MARKS.filter((m) => products.some((p) => productHasGasMark(p, m)));
  const sortedMarks = [...catalogMarks].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const visibleMarks = gasExpanded ? sortedMarks : sortedMarks.slice(0, 6);
  const active: Array<{ group: FacetGroup; value: string }> = [
    ...(filters.use ? [{ group: "use" as const, value: filters.use }] : []),
    ...filters.marks.map((value) => ({ group: "marks" as const, value })),
    ...(["cat", "weight", "safety", "gwp", "stock"] as const).flatMap((group) => filters[group].map((value) => ({ group, value }))),
  ];

  // Mobile keeps its own layout; it gets the gas filter from the same state.
  const mobileProducts = filters.marks.length ? products.filter((p) => filters.marks.some((m) => productHasGasMark(p, m))) : products;
  const mobileCounts = Object.fromEntries(KNOWN_MARKS.map((m) => [m, products.filter((p) => productHasGasMark(p, m)).length]));

  return (
    <div className="flex-1 bg-canvas">
      <div className="hidden md:block">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />

        <div className="relative overflow-x-clip">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
            <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
          </div>

          <main className="relative mx-auto max-w-7xl px-8 pb-24 pt-9" data-catalog>
            {/* ── Header bar (cart layout) ── */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4" data-catalog-header>
              <div className="min-w-0">
                <h1 className="m-0 text-[34px] font-semibold leading-[1.1] tracking-[-.04em]">{t("title")}</h1>
                <p className="m-0 mt-2 text-[14px] text-slate-500 dark:text-ink-muted" data-catalog-meta>
                  {t("lead")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SmartOrderButton variant="pill" source="catalog" label={t("bulkImport")} className="min-h-[38px] px-3.5" />
              </div>
            </div>

            {/* The term that produced this list, and the way out of it. */}
            {searchTerm && (
              <div data-search-chip className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-slate-900/[.12] bg-white/70 py-1.5 pl-3.5 pr-1.5 text-[12.5px] dark:border-white/[.14] dark:bg-white/[.04]">
                <Search size={13} strokeWidth={2.2} className="flex-none text-slate-500" />
                <span className="min-w-0 truncate">{t("searchResultsFor", { query: searchTerm })}</span>
                <span className="flex-none rounded-full bg-slate-900/[.06] px-2 py-[2px] text-[10.5px] font-semibold tabular-nums dark:bg-white/[.08]">{t("resultCount", { count: products.length })}</span>
                <button type="button" onClick={clearSearch} aria-label={t("searchClearAria")} data-search-chip-clear className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/[.06] dark:hover:bg-white/10">
                  {searchPending ? <Loader2 size={12} className="animate-spin" /> : <X size={13} strokeWidth={2.4} />}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              {/* ── Sidebar ── */}
              <aside className="lg:sticky lg:top-[88px] lg:col-span-3" data-filters>
                <div className="scrollbar-slim rounded-[22px] border border-slate-900/[.1] bg-white/80 p-5 shadow-[0_24px_60px_-44px_rgba(2,4,10,.55)] backdrop-blur-xl backdrop-saturate-150 lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto dark:border-white/[.1] dark:bg-white/[.04]">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("filtersTitle")}</h2>
                    {activeFilterCount(filters) > 0 && (
                      <button type="button" onClick={resetAll} className="text-[12px] font-semibold text-blue-700 dark:text-blue-400" data-filters-reset>
                        {t("clearAll")}
                      </button>
                    )}
                  </div>
                  {/* Use case (was a pill row above the grid): single-choice, same state and counts. */}
                  <FacetSection title={t("useLabel")}>
                    {USE_CASES.map((u) => (
                      <FacetOption key={u} label={t(`use_${u}`)} count={count("use", u)} on={filters.use === u} onClick={() => setGroup("use", u)} data={`use:${u}`} />
                    ))}
                  </FacetSection>
                  {groups.map(({ group, title, values }) => (
                    <FacetSection key={group} title={title}>
                      {values.map((v) => (
                        <FacetOption key={v} label={label(group, v)} count={count(group, v)} on={filters[group].includes(v)} onClick={() => setGroup(group, v)} data={`${group}:${v}`} />
                      ))}
                    </FacetSection>
                  ))}
                  <FacetSection title={t("fGas")} last>
                    {visibleMarks.map((m) => (
                      <FacetOption key={m} label={m.replace(/^R/, "R-")} mono count={count("marks", m)} on={filters.marks.includes(m)} onClick={() => setGroup("marks", m)} data={`marks:${m}`} />
                    ))}
                    {sortedMarks.length > 6 && (
                      <button type="button" onClick={() => setGasExpanded((v) => !v)} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-700/[.06] dark:text-blue-400 dark:hover:bg-blue-400/10">
                        {gasExpanded ? t("showLess") : t("showMore", { count: sortedMarks.length - 6 })}
                        <ChevronDown size={13} strokeWidth={2.4} className={gasExpanded ? "rotate-180" : ""} />
                      </button>
                    )}
                  </FacetSection>
                </div>
              </aside>

              <div className="min-w-0 lg:col-span-9">
                {/* ── Match bar: local first, AI only for what it can't read ── */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runMatch();
                  }}
                  className={`${SURFACE} px-4 py-3.5`}
                  data-match-bar
                >
                  <div className="flex items-center gap-3">
                    <span className={ICON_TILE}>
                      <SlidersHorizontal size={17} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <label htmlFor="catalog-match" className="block text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                        {t("matchTitle")}
                      </label>
                      <input
                        id="catalog-match"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("matchPlaceholder")}
                        data-match-input
                        className="mt-0.5 w-full border-0 bg-transparent text-[13.5px] tracking-[-.01em] outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <button type="submit" disabled={!query.trim() || aiPending} data-match-submit className="inline-flex h-10 flex-none items-center gap-1.5 rounded-[12px] bg-blue-700 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50">
                      {aiPending ? <Loader2 size={14} className="animate-spin" /> : null}
                      {t("matchButton")}
                      {!aiPending && <ArrowRight size={14} strokeWidth={2.4} />}
                    </button>
                  </div>
                </form>
                <AnimatePresence initial={false}>
                  {note && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2.5 flex items-center gap-2.5 rounded-[14px] border border-slate-900/[.08] bg-white/70 px-3.5 py-2 text-[12.5px] dark:border-white/[.1] dark:bg-white/[.04]" data-match-note={note.kind}>
                      <Check size={14} strokeWidth={2.4} className={note.kind === "error" ? "hidden" : "flex-none text-emerald-600 dark:text-emerald-400"} />
                      <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
                        {note.kind === "local" ? t("matchLocal", { items: note.parts.join(" · ") }) : note.kind === "ai" ? (note.skus.length ? t("matchAi", { reason: note.reason }) : t("matchAiNone")) : t("matchError")}
                      </span>
                      <button type="button" onClick={() => setNote(null)} className="flex-none text-[12px] font-semibold text-blue-700 dark:text-blue-400">
                        {t("clear")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Toolbar: count, active filters, sort ── */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[13px] font-semibold tabular-nums" data-result-count={rows.length}>
                      {t("resultCount", { count: rows.length })}
                    </span>
                    {active.map(({ group, value }) => (
                      <button key={`${group}:${value}`} type="button" onClick={() => setGroup(group, value)} data-active-filter={`${group}:${value}`} className="inline-flex h-7 items-center gap-1 rounded-full border border-blue-700/20 bg-blue-700/[.06] pl-2.5 pr-1.5 text-[11.5px] font-semibold text-blue-800 hover:bg-blue-700/[.1] dark:border-blue-400/25 dark:bg-blue-500/[.12] dark:text-blue-200">
                        {label(group, value)}
                        <X size={12} strokeWidth={2.4} />
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
    <div role="radiogroup" aria-label={t("viewLabel")} className="inline-flex rounded-full border border-slate-900/[.12] bg-white/70 p-1 dark:border-white/[.14] dark:bg-white/[.04]" data-view-switch>
                      {(["grid", "table"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={view === v}
                          onClick={() => setView(v)}
                          data-view={v}
                          className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${
                            view === v ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                          }`}
                        >
                          {v === "grid" ? <LayoutGrid size={14} strokeWidth={2} /> : <Rows3 size={14} strokeWidth={2} />}
                          {v === "grid" ? t("viewGrid") : t("viewTable")}
                        </button>
                      ))}
                    </div>
                    {SORTS.map((s) => {
                      const on = sort === s && !aiSkus;
                      return (
                        <button key={s} type="button" onClick={() => setSort(s)} aria-pressed={on} data-sort={s} className={`h-8 rounded-full px-3 text-[12px] font-semibold transition-colors ${on ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border border-slate-900/[.12] text-slate-600 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-300 dark:hover:bg-white/[.06]"}`}>
                          {t(`sort_${s}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {aiPending ? (
                  <div className="mt-4 grid grid-cols-3 gap-4" data-skeletons>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-[260px] animate-pulse rounded-[22px] border border-slate-900/[.06] bg-white/60 dark:border-white/[.06] dark:bg-white/[.03]" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="mt-4 rounded-[22px] border border-dashed border-slate-900/[.14] bg-white/70 px-7 py-14 text-center dark:border-white/[.14] dark:bg-white/[.03]" data-catalog-empty>
                    <div className="text-[15px] font-semibold tracking-[-.025em]">{t("emptyTitle")}</div>
                    <p className="mx-0 mb-[18px] mt-2.5 text-[13.5px] text-slate-600 dark:text-ink-muted">{t("emptyBodyFilters")}</p>
                    <button type="button" onClick={resetAll} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold text-white hover:bg-blue-800">
                      {t("resetFilters")}
                    </button>
                  </div>
                ) : view === "grid" ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-product-grid>
                    {rows.map((p) => (
                      <CatalogCard key={p.sku} p={p} onNotify={setNotifyFor} />
                    ))}
                  </div>
                ) : (
                  <div className={`mt-4 ${SURFACE}`} data-product-table>
                    <div className={`${ROW_GRID} border-b border-slate-900/[.06] bg-slate-900/[.015] px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:border-white/[.06] dark:bg-white/[.02] dark:text-ink-muted`}>
                      <span />
                      <span>{t("colProduct")}</span>
                      <span className="w-[84px] text-center">{t("colQty")}</span>
                      <span className="text-right">{t("colPrice")}</span>
                      <span />
                    </div>
                    {rows.map((p) => (
                      <CatalogRow key={p.sku} p={p} onNotify={setNotifyFor} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <StockNotifyModal isOpen={notifyFor !== null} onClose={() => setNotifyFor(null)} productId={notifyFor?.id ?? ""} productName={notifyFor?.name ?? ""} />
      </div>

      <div className="block md:hidden">
        <MobileProductsLayout
          products={mobileProducts}
          initialCategory={filters.cat[0] ?? null}
          gasMarks={filters.marks}
          gasMarkCounts={mobileCounts}
          onToggleGasMark={(m) => setGroup("marks", m)}
          gasMarksPending={false}
        />
      </div>
    </div>
  );
}

function FacetSection({ title, children, last = false }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`${last ? "" : "border-b border-slate-900/[.07] dark:border-white/[.07]"} py-3.5`}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400 dark:text-ink-muted">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function FacetOption({ label, count, on, onClick, mono = false, data }: { label: string; count: number; on: boolean; onClick: () => void; mono?: boolean; data: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      disabled={count === 0 && !on}
      data-facet={data}
      data-facet-count={count}
      className={`flex min-h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[12.5px] transition-colors hover:bg-slate-900/[.04] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-white/[.06] ${
        on ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-600 dark:text-slate-300"
      }`}
    >
      <span className={`flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] border-[1.5px] ${on ? "border-blue-700 bg-blue-700" : "border-slate-900/[.18] dark:border-white/[.22]"}`}>
        {on && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>
      <span className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""}`}>{label}</span>
      <span className="text-[11px] tabular-nums text-slate-400 dark:text-ink-muted">{count}</span>
    </button>
  );
}
