"use client";

import { useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight, Clock, Search, X } from "lucide-react";
import { RECENT_SEARCHES, searchAll, type SearchResult } from "@/lib/mobileSearch";

function groupResults(results: SearchResult[]) {
  const groups: Record<SearchResult["type"], SearchResult[]> = {
    Cylinders: [],
    Documents: [],
    Orders: [],
  };
  for (const result of results) groups[result.type].push(result);
  return groups;
}

export default function MobileSearchLayout() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchAll(query), [query]);
  const grouped = useMemo(() => groupResults(results), [results]);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header: ambient mesh gradient strictly at the top, behind the header row only */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_54%,transparent_100%)]">
          <div className="absolute -left-[130px] -top-[190px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_70%)] blur-[80px] [animation:hc-float_22s_ease-in-out_infinite]" />
          <div className="absolute -right-[110px] -top-[160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_70%)] blur-[80px] [animation:hc-float_28s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="relative flex items-center gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/75 bg-white/66 text-slate-900 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-50"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <span className="flex-1 text-center text-[19px] font-semibold tracking-[-.035em]">Search</span>
          <span className="w-11 flex-none" />
        </div>

        <div className="relative px-4 pb-4">
          <div className="flex h-[50px] items-center gap-2.5 rounded-2xl border border-white/80 bg-white/72 px-4 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.4)] backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/60">
            <Search size={17} className="flex-none text-slate-500 dark:text-slate-400" strokeWidth={2} />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cylinders, orders, documents..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 focus:outline-none dark:text-slate-50 dark:placeholder:text-slate-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900/[.08] text-slate-500 dark:bg-white/10 dark:text-slate-400"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pb-[calc(120px+env(safe-area-inset-bottom))]">
        {!hasQuery ? (
          <div className="px-4 pt-2">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[11px] tracking-[.08em] text-slate-400 dark:text-slate-500">
                RECENT SEARCHES
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {RECENT_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12.5px] font-medium text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"
                >
                  <Clock size={13} strokeWidth={2} className="text-slate-400 dark:text-slate-500" />
                  {term}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 pt-10 text-center text-[13.5px] text-slate-400 dark:text-slate-500">
            No results for &ldquo;{query}&rdquo;
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            {(Object.keys(grouped) as (keyof typeof grouped)[]).map((type) =>
              grouped[type].length > 0 ? (
                <div key={type} className="px-4">
                  <div className="mb-2.5 px-1 text-[11px] tracking-[.08em] text-slate-400 dark:text-slate-500">
                    {type.toUpperCase()}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {grouped[type].map((result) => (
                      <Link
                        key={result.id}
                        href={result.href}
                        className="flex items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold tracking-[-.02em]">
                            {result.title}
                          </span>
                          <span className="mt-1 block truncate text-[12px] text-slate-400 dark:text-slate-500">
                            {result.subtitle}
                          </span>
                        </span>
                        <ChevronRight size={16} strokeWidth={2} className="flex-none text-slate-300 dark:text-slate-600" />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
