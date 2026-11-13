"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PILL } from "@/components/home/ui";
import SmartOrderButton from "@/components/smartOrder/SmartOrderButton";
import StockNotifyModal from "@/components/StockNotifyModal";
import { SECTORS, type Sector } from "@/lib/categorySectors";
import type { StoreProduct } from "@/lib/data";
import SectorModule from "./SectorModule";
import Configurator from "./Configurator";
import FormatGuide from "./FormatGuide";

/**
 * /categories — the catalog by application, in the Cart / Catalog / Profile
 * / Hub language: the single-row header bar, one row of sector pills (the
 * sector lives in ?sector=), then 8 + 4 — sector modules with the real
 * catalog sizes, buyable inline, beside the order configurator — and the
 * supply-format guide below. Everything runs over the listed catalog the
 * page was rendered with; 0 model calls.
 */

type Filter = "all" | Sector;

export default function CategoryExplorer({ products, initialSector }: { products: StoreProduct[]; initialSector: Filter }) {
  const t = useTranslations("CategoryExplorer");
  const format = useFormatter();
  const [filter, setFilter] = useState<Filter>(initialSector);
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);

  // The sector in the URL, without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filter === "all") params.delete("sector");
    else params.set("sector", filter);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [filter]);

  const gasKg = products.filter((p) => p.pricedPerKg).map((p) => p.weightKg);
  const kg = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  const meta = [
    t("metaSectors", { n: SECTORS.length }),
    gasKg.length ? t("metaRange", { min: kg(Math.min(...gasKg)), max: kg(Math.max(...gasKg)) }) : null,
    t("metaAhri"),
    t("metaEur"),
  ].filter(Boolean);
  const visible = filter === "all" ? SECTORS : [filter];

  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,var(--orb-cyan),rgba(34,211,238,0)_66%)] opacity-[.2] blur-[120px]" />
        <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.16] blur-[120px]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-category-explorer>
        {/* ── Header bar (cart layout) ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-cat-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 tabular-nums dark:text-ink-muted" data-cat-meta>
              {meta.join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:flex-none lg:pt-1">
            <SmartOrderButton variant="pill" source="catalog" label={t("actionBom")} className="min-h-[38px] px-3.5" />
            <Link href="/hub?tab=compare" className={PILL} data-cat-action="compat">
              {t("actionCompat")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
            <Link href="/products" className={PILL} data-cat-action="catalog">
              {t("actionCatalog")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        {/* ── Sector strip: one row of seven segments (name, then its gases). All visible from lg up;
            narrower screens scroll it sideways rather than wrapping. ── */}
        <nav
          className="-mx-1 mb-6 grid auto-cols-[minmax(148px,1fr)] grid-flow-col gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("sectorsLabel")}
          data-cat-sectors
        >
          {(["all", ...SECTORS] as const).map((id) => {
            const on = filter === id;
            // "❄️ Кондиціонування та VRF (R-32, R-410A)" → name + the parenthesised gases on their own line.
            const label = t(`sector_${id}`);
            const parts = label.match(/^(.*?)\s*\((.+)\)\s*$/);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(id)}
                data-cat-sector={id}
                title={label}
                className={`flex min-h-[52px] flex-col justify-center rounded-[14px] border px-3 py-1.5 text-left transition-colors ${
                  on
                    ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900"
                    : "border-slate-900/[.12] bg-white/70 text-slate-800 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.09]"
                }`}
              >
                <span className="text-[12.5px] font-semibold leading-[1.25] tracking-[-.01em]">{parts ? parts[1] : label}</span>
                {parts && <span className={`mt-0.5 text-[11px] leading-[1.25] ${on ? "opacity-70" : "text-slate-500 dark:text-ink-muted"}`}>{parts[2]}</span>}
              </button>
            );
          })}
        </nav>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-8" data-cat-modules={visible.join(",")}>
            {visible.map((s) => (
              <SectorModule key={s} sector={s} products={products} onNotify={setNotifyFor} />
            ))}
          </div>
          <aside className="min-w-0 lg:sticky lg:top-[88px] lg:col-span-4" data-cat-aside>
            <Configurator products={products} />
          </aside>
        </div>

        <div className="mt-6">
          <FormatGuide products={products} />
        </div>
      </main>

      <StockNotifyModal isOpen={notifyFor !== null} onClose={() => setNotifyFor(null)} productId={notifyFor?.id ?? ""} productName={notifyFor?.name ?? ""} />
    </div>
  );
}
