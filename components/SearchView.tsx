"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ChevronRight, Clock, FileText, Package, Search, ShoppingBag, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GAS_SAFETY, matchesQuery } from "@/lib/sdsLibrary";
import { usePackLabel } from "@/lib/hooks/usePackLabel";
import { MicroBadge, SURFACE, safetyTone } from "./home/ui";

/**
 * /search — one page at every width: the catalog (/api/search, the header's
 * own filter), the buyer's OWN orders (same response, scoped to the session),
 * and the safety-data-sheet library (lib/sdsLibrary, matched by mark, CAS or
 * UN number in the browser).
 *
 * Nothing here is sample data. Recent searches are this browser's own last
 * queries (localStorage) — an empty list until the person has searched.
 */

interface Hit {
  id: string;
  name: string;
  sku: string;
  weightKg: number;
  containerType: string | null;
  cylinderPrice: number;
  pricePerKg: number;
  pricedPerKg: boolean;
  inStock: boolean;
  href: string;
}
interface OrderHit {
  id: string;
  orderNumber: string;
  createdAt: string;
  total: number;
  paid: boolean;
  cancelled: boolean;
  stage: string | null;
  lines: number;
}
interface Response {
  ok: boolean;
  total: number;
  results: Hit[];
  signedIn?: boolean;
  orders?: OrderHit[];
}

const RECENT_KEY = "me-recent-searches";
const MIN = 2;
const STAGE_KEY: Record<string, string> = {
  ORDER_PLACED: "stageOrderPlaced",
  ADR_PACKING: "stageAdrPacking",
  DISPATCHED: "dispatched",
  IN_TRANSIT: "inTransit",
  OUT_FOR_DELIVERY: "stageOutForDelivery",
  READY_FOR_PICKUP: "stageReadyForPickup",
  DELIVERED: "delivered",
};

// Recent searches live in this browser only. Read through useSyncExternalStore
// (server snapshot "[]") so the first render matches the server HTML.
const RECENT_EVENT = "me-recent-searches";
function subscribeRecent(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(RECENT_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(RECENT_EVENT, cb);
  };
}
function rawRecent(): string {
  try {
    return localStorage.getItem(RECENT_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function parseRecent(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_KEY);
  } catch {}
  window.dispatchEvent(new Event(RECENT_EVENT));
}

export default function SearchView() {
  const t = useTranslations("SearchPage");
  const td = useTranslations("Dashboard");
  const format = useFormatter();
  const pack = usePackLabel();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ term: string; res: Response } | null>(null);
  const [loading, setLoading] = useState(false);
  const recentRaw = useSyncExternalStore(subscribeRecent, rawRecent, () => "[]");
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });

  useEffect(() => {
    if (term.length < MIN) return;
    const controller = new AbortController();
    const id = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => r.json() as Promise<Response>)
        .then((res) => setData({ term, res }))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [term]);

  const remember = (q: string) => writeRecent([q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6));
  const clearRecent = () => writeRecent([]);

  const res = data && data.term === term ? data.res : null;
  const docs = useMemo(() => (term.length >= MIN ? GAS_SAFETY.filter((g) => matchesQuery(g, term)).slice(0, 6) : []), [term]);
  const nothing = res && res.results.length === 0 && (res.orders ?? []).length === 0 && docs.length === 0;

  return (
    // w-full: a flex item with auto margins sizes to its content; a long result title then widened the page.
    <main className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-8 sm:pb-24 sm:pt-9" data-search-page>
      <h1 className="m-0 text-[34px] font-semibold leading-[1.1] tracking-[-.04em] max-sm:text-[28px]">{t("title")}</h1>
      <p className="m-0 mt-2 text-[14px] text-slate-500 dark:text-ink-muted">{t("lead")}</p>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.length >= MIN) remember(term);
        }}
        className="mt-5 flex h-12 items-center gap-2.5 rounded-[14px] border border-slate-900/[.12] bg-white px-4 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/15 dark:border-white/[.14] dark:bg-white/[.04]"
      >
        <Search size={17} strokeWidth={2} className="flex-none text-slate-400" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 80))}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          data-search-input
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={t("clear")}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-900/[.07] text-slate-500 dark:bg-white/10"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
      </form>

      {term.length < MIN ? (
        <section className="mt-6" data-search-idle>
          {recent.length > 0 ? (
            <>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("recent")}</h2>
                <button type="button" onClick={clearRecent} className="text-[12px] font-semibold text-blue-700 dark:text-blue-400" data-search-recent-clear>
                  {t("recentClear")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2" data-search-recent>
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => setQuery(r)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-900/[.1] bg-white/70 px-3.5 text-[13px] font-medium text-slate-700 dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-200">
                    <Clock size={13} strokeWidth={2} className="text-slate-400" />
                    {r}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="m-0 text-[13.5px] text-slate-500 dark:text-ink-muted" data-search-hint>
              {t("hint", { n: MIN })}
            </p>
          )}
        </section>
      ) : nothing ? (
        <p className="mt-8 text-center text-[14px] text-slate-500 dark:text-ink-muted" data-search-empty>
          {t("none", { q: term })}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6" data-search-results={loading && !res ? "loading" : "ready"}>
          {res && res.results.length > 0 && (
            <Group title={t("groupProducts")} icon={<Package size={14} strokeWidth={2} />} data="products">
              {res.results.map((h) => (
                <Row key={h.id} href={h.href} onClick={() => remember(term)} title={h.name} sub={`${pack(h.weightKg, h.containerType, h.pricedPerKg)} · ${h.sku}`} right={eur(h.pricedPerKg ? h.cylinderPrice : h.pricePerKg)} badge={h.inStock ? null : t("outOfStock")} />
              ))}
              {res.total > res.results.length && (
                <Link href={{ pathname: "/products", query: { search: term } }} className="flex items-center justify-center gap-1.5 px-5 py-3 text-[13px] font-semibold text-blue-700 dark:text-blue-400" data-search-all>
                  {t("seeAll", { count: res.total })}
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
              )}
            </Group>
          )}
          {res?.signedIn && (res.orders ?? []).length > 0 && (
            <Group title={t("groupOrders")} icon={<ShoppingBag size={14} strokeWidth={2} />} data="orders">
              {res.orders!.map((o) => (
                <Row
                  key={o.id}
                  href={`/profile/orders/${o.id}`}
                  onClick={() => remember(term)}
                  title={o.orderNumber}
                  mono
                  sub={`${format.dateTime(new Date(o.createdAt), { dateStyle: "medium" })} · ${t("lines", { count: o.lines })} · ${o.cancelled ? t("cancelled") : !o.paid ? t("awaitingPayment") : td(STAGE_KEY[o.stage ?? "ORDER_PLACED"] ?? "stageOrderPlaced")}`}
                  right={eur(o.total)}
                />
              ))}
            </Group>
          )}
          {docs.length > 0 && (
            <Group title={t("groupDocs")} icon={<FileText size={14} strokeWidth={2} />} data="docs">
              {docs.map((g) => (
                <Row key={g.key} href="/compliance/sds" onClick={() => remember(term)} title={t("sdsTitle", { gas: g.label })} sub={`CAS ${g.cas.join(" · ")} · UN ${g.un}`} tag={<MicroBadge tone={safetyTone(g.safety)}>{g.safety}</MicroBadge>} />
              ))}
            </Group>
          )}
          {res && !res.signedIn && (
            <p className="m-0 text-[12.5px] text-slate-500 dark:text-ink-muted" data-search-orders-signin>
              <Link href="/auth" className="font-semibold text-blue-700 dark:text-blue-400">
                {t("signIn")}
              </Link>{" "}
              {t("signInOrders")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Group({ title, icon, data, children }: { title: string; icon: React.ReactNode; data: string; children: React.ReactNode }) {
  return (
    <section data-search-group={data}>
      <h2 className="m-0 mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-ink-muted">
        {icon}
        {title}
      </h2>
      <div className={`${SURFACE} divide-y divide-slate-900/[.06] dark:divide-white/[.06]`}>{children}</div>
    </section>
  );
}

function Row({ href, title, sub, right, badge, tag, mono = false, onClick }: { href: string; title: string; sub: string; right?: string; badge?: string | null; tag?: React.ReactNode; mono?: boolean; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-900/[.03] sm:px-5 dark:hover:bg-white/[.04]" data-search-row>
      <span className="min-w-0 flex-1">
        <span className={`flex min-w-0 items-center gap-2 text-[14px] font-semibold tracking-[-.015em] ${mono ? "font-mono text-[13.5px]" : ""}`}>
          <span className="truncate">{title}</span>
          {tag}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-slate-500 dark:text-ink-muted">{sub}</span>
      </span>
      {(right || badge) && (
        <span className="flex flex-none flex-col items-end">
          {right && <span className="text-[13.5px] font-semibold tabular-nums">{right}</span>}
          {badge && <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">{badge}</span>}
        </span>
      )}
      <ChevronRight size={16} strokeWidth={2} className="flex-none text-slate-300 dark:text-slate-600" />
    </Link>
  );
}
