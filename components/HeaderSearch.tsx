"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowRight, Loader2, PackageX, Search, X } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { SEARCH_MIN_LENGTH, isSearchable, normalizeSearchTerm } from "@/lib/search";

/** One row of the dropdown, as /api/search returns it. */
interface SearchHit {
  id: string;
  name: string;
  sku: string;
  type: string;
  weightLabel: string;
  pricePerKg: number;
  cylinderPrice: number;
  pricedPerKg: boolean;
  inStock: boolean;
  href: string;
}

interface SearchResponse {
  ok: boolean;
  query: string;
  total: number;
  results: SearchHit[];
}

/**
 * A settled response, tagged with the term that produced it. Keeping the
 * term alongside the data means "results for what I'm typing now" is a
 * derivation rather than something an effect has to clear — a late reply
 * for an older term simply stops matching and is ignored.
 */
interface SearchState {
  term: string;
  hits: SearchHit[];
  total: number;
  failed: boolean;
}

interface HeaderSearchProps {
  /** Mirrors the term to a parent that still tracks it; the box owns the value. */
  onQueryChange?: (value: string) => void;
}

/**
 * The global catalog search: a debounced live dropdown over /api/search, with
 * Enter falling back to the full product list.
 *
 * The input seeds itself from `?search=` so landing on /products?search=134a
 * (or hitting back) shows the term that produced the page rather than an
 * empty box pretending nothing is filtered.
 */
/**
 * `useSearchParams` cannot be read while a page is being prerendered — there
 * is no request yet — so React needs a boundary to prerender *around*. Without
 * one, every page that renders the header is forced to render on demand: this
 * component alone kept the whole catalogue, categories, compliance and legal
 * routes out of static generation, across all 29 locales.
 *
 * The boundary lives here rather than at each call site so that simply
 * rendering a `<Header>` cannot un-static a page again.
 */
export default function HeaderSearch(props: HeaderSearchProps) {
  return (
    <Suspense fallback={<div className="relative flex h-[38px] w-[180px] max-w-[280px] flex-1" />}>
      <HeaderSearchBox {...props} />
    </Suspense>
  );
}

function HeaderSearchBox({ onQueryChange }: HeaderSearchProps) {
  const t = useTranslations("Header");
  // The result count is already correctly pluralised for every locale in the
  // Products namespace — reuse it rather than duplicate 29 sets of rules.
  const tProducts = useTranslations("Products");
  const format = useFormatter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listboxId = useId();

  const urlTerm = normalizeSearchTerm(searchParams.get("search"));
  // Initialised, not synced: after first paint the box is the source of
  // truth, so typing is never yanked back by a navigation it caused.
  const [value, setValue] = useState(urlTerm);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SearchState | null>(null);
  // -1 = nothing highlighted; Enter then falls through to the full list.
  const [active, setActive] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebouncedValue(value, 300);
  const term = normalizeSearchTerm(debounced);
  const searchable = isSearchable(term);

  const eur = (amount: number) => format.number(amount, { style: "currency", currency: "EUR" });

  // ─── Fetch, debounced, with the previous request abandoned ───
  // Nothing is cleared here: the state below is derived from whether the
  // stored result still belongs to the term being typed.
  useEffect(() => {
    if (!searchable) return;

    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<SearchResponse>) : Promise.reject(response.status)))
      .then((data) => setResult({ term, hits: data.results ?? [], total: data.total ?? 0, failed: false }))
      .catch((error) => {
        // An aborted request is the expected outcome of typing on, not a failure.
        if (controller.signal.aborted || (error as Error)?.name === "AbortError") return;
        setResult({ term, hits: [], total: 0, failed: true });
      });

    return () => controller.abort();
  }, [term, searchable]);

  // Only a result for the CURRENT term counts; anything else is in flight.
  const current = searchable && result?.term === term ? result : null;
  const hits = current?.hits ?? [];
  const total = current?.total ?? 0;
  const failed = current?.failed ?? false;
  const loading = searchable && current === null;
  // A shrinking result set must not leave the highlight pointing past the end.
  const activeIndex = active < hits.length ? active : -1;

  // ─── Dismiss on outside click / Escape ───
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const update = (next: string) => {
    setValue(next);
    setOpen(next.trim().length >= SEARCH_MIN_LENGTH);
    // Typing invalidates whatever was highlighted.
    setActive(-1);
    onQueryChange?.(next);
  };

  /** The fallback: the full product list, filtered server-side by the same rule. */
  const goToResults = (raw = value) => {
    const q = normalizeSearchTerm(raw);
    if (!isSearchable(q)) return;
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/products?search=${encodeURIComponent(q)}`);
  };

  const openHit = (hit: SearchHit) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // A highlighted suggestion wins; otherwise fall through to the list.
      if (open && activeIndex >= 0 && hits[activeIndex]) openHit(hits[activeIndex]);
      else goToResults();
      return;
    }
    if (event.key === "Escape") {
      // Escape dismisses the dropdown and keeps the query — a second
      // Escape is not a shortcut for "throw my typing away".
      event.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive(() => {
        const next = event.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1;
        // Wrap through -1 so arrowing off either end returns to "no choice",
        // where Enter means "show me everything".
        if (next >= hits.length) return -1;
        if (next < -1) return hits.length - 1;
        return next;
      });
    }
  };

  const clear = () => {
    setValue("");
    setOpen(false);
    setActive(-1);
    onQueryChange?.("");
    inputRef.current?.focus();
  };

  const showDropdown = open && searchable;
  const empty = !loading && !failed && hits.length === 0;

  return (
    <div ref={wrapRef} className="relative flex h-[38px] w-[180px] max-w-[280px] flex-1" data-header-search>
      <div
        className={`flex h-[38px] w-full items-center gap-2 rounded-full border bg-slate-50 px-3.5 transition-[border-color,box-shadow] duration-200 dark:bg-surface ${
          showDropdown
            ? "border-cyan-500/60 shadow-[0_0_0_3px_rgba(6,182,212,.16)] dark:border-cyan-400/50"
            : "border-slate-900/[.12] dark:border-hairline-strong"
        }`}
      >
        {loading ? (
          <Loader2 size={15} className="shrink-0 animate-spin text-cyan-600 dark:text-cyan-400" strokeWidth={2} />
        ) : (
          <Search size={15} className="shrink-0 text-slate-500 dark:text-ink-muted" strokeWidth={2} />
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => update(e.target.value)}
          onFocus={() => setOpen(searchable)}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          // Deliberately NOT type="search": Chrome's native Escape handling
          // on that type wipes the whole query, so dismissing the dropdown
          // would throw away what was typed. role="combobox" below is the
          // markup that matters here, and the clear button is our own.
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-label={t("searchPlaceholder")}
          data-header-search-input
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-ink-muted"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label={t("searchClear")}
            data-header-search-clear
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-900/[.06] hover:text-slate-700 dark:text-ink-muted dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            data-search-dropdown
            className="absolute right-0 top-[calc(100%+9px)] z-[60] w-[420px] max-w-[calc(100vw-40px)] origin-top overflow-hidden rounded-xl border border-slate-900/[.1] bg-white/90 shadow-[0_28px_64px_-24px_rgba(15,23,42,.4)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/90 dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,.8)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(circle,#22d3ee,transparent_68%)] opacity-[.18] blur-[42px]"
            />

            {hits.length > 0 && (
              <ul id={listboxId} role="listbox" aria-label={t("searchResults")} className="relative m-0 list-none p-1.5">
                {hits.map((hit, index) => (
                  <li key={hit.id} id={`${listboxId}-${index}`} role="option" aria-selected={index === activeIndex}>
                    <Link
                      href={hit.href}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActive(index)}
                      data-search-hit={hit.sku}
                      className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors ${
                        index === activeIndex
                          ? "bg-cyan-500/[.12] dark:bg-cyan-400/[.12]"
                          : "hover:bg-slate-900/[.04] dark:hover:bg-white/[.06]"
                      }`}
                    >
                      <span className="relative flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-[11px] border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3">
                        <span className="h-6 w-3.5 rounded-t-[7px] rounded-b-[2px] border border-dashed border-slate-900/25 bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/25 dark:bg-[linear-gradient(118deg,rgba(255,255,255,.12),rgba(255,255,255,.03))]" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold tracking-[-.02em]">{hit.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-ink-muted">
                          {/* The SKU is what a B2B buyer orders by — it never
                              truncates; the pack label gives way instead. */}
                          <span className="flex-none font-medium">{hit.sku}</span>
                          <span aria-hidden className="flex-none">·</span>
                          <span className="truncate">{hit.weightLabel}</span>
                          {!hit.inStock && (
                            <span className="flex-none font-semibold text-amber-600 dark:text-amber-400">
                              {t("searchOutOfStock")}
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="flex-none text-right">
                        <span className="block text-[13px] font-semibold tracking-[-.02em]">
                          {eur(hit.cylinderPrice)}
                        </span>
                        {hit.pricedPerKg && (
                          <span className="block text-[10.5px] text-slate-400 dark:text-ink-muted">
                            {eur(hit.pricePerKg)} / kg
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {empty && (
              <div className="relative flex items-center gap-2.5 px-4 py-5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                <PackageX size={15} strokeWidth={2} className="flex-none text-slate-400 dark:text-ink-muted" />
                {t("searchNoResults", { query: term })}
              </div>
            )}

            {failed && (
              <div className="relative px-4 py-5 text-[12.5px] text-red-600 dark:text-red-400" role="alert">
                {t("searchFailed")}
              </div>
            )}

            {/* Always offered: the dropdown shows five, the list shows all. */}
            <button
              type="button"
              onClick={() => goToResults()}
              data-search-see-all
              className="relative flex w-full items-center justify-between gap-3 border-t border-slate-900/[.08] px-4 py-3 text-left text-[12px] font-semibold tracking-[-.01em] text-blue-700 transition-colors hover:bg-blue-700/[.06] dark:border-white/[.08] dark:text-blue-400 dark:hover:bg-blue-400/[.08]"
            >
              <span className="min-w-0 truncate">
                {total > 0 ? t("searchSeeAll") : t("searchBrowseAll")}
              </span>
              <span className="ml-auto flex flex-none items-center gap-2">
                {total > 0 && (
                  <span className="rounded-full bg-blue-700/10 px-2 py-[3px] text-[10.5px] font-semibold tabular-nums dark:bg-blue-400/[.14]">
                    {tProducts("resultCount", { count: total })}
                  </span>
                )}
                <ArrowRight size={14} strokeWidth={2.2} />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
