"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Car, Container, Leaf, Refrigerator, Snowflake, Wrench, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PILL } from "@/components/home/ui";
import { fromPerKg, gasLabel, SECTOR_DEFS, SECTORS, sectorProducts, type Sector } from "@/lib/categorySectors";
import { gasMarkForProduct } from "@/lib/productMedia";
import { normalizeMark } from "@/lib/gasMarks";
import type { StoreProduct } from "@/lib/data";

/**
 * /categories — a calm directory: six sector cards in a 2 × 3 grid. Each card
 * says what the sector is in one sentence, which gases it uses (each a link
 * into the catalog, pre-filtered), the lowest €/kg, and one way in. Buying,
 * specs and configuration live on /products and the product pages.
 */

const ICON: Record<Sector, LucideIcon> = { ac: Snowflake, auto: Car, heatpump: Leaf, commercial: Refrigerator, bulk: Container, equipment: Wrench };
const TINT: Record<Sector, string> = {
  ac: "text-blue-700 bg-blue-600/[.08] dark:text-blue-300 dark:bg-blue-400/[.12]",
  auto: "text-slate-700 bg-slate-900/[.06] dark:text-slate-200 dark:bg-white/[.08]",
  heatpump: "text-emerald-700 bg-emerald-600/[.08] dark:text-emerald-300 dark:bg-emerald-400/[.12]",
  commercial: "text-cyan-700 bg-cyan-600/[.08] dark:text-cyan-300 dark:bg-cyan-400/[.12]",
  bulk: "text-amber-700 bg-amber-600/[.08] dark:text-amber-300 dark:bg-amber-400/[.12]",
  equipment: "text-slate-700 bg-slate-900/[.06] dark:text-slate-200 dark:bg-white/[.08]",
};
const CHIP = "inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[12px] font-semibold transition-colors";

export default function CategoryExplorer({ products }: { products: StoreProduct[] }) {
  const t = useTranslations("CategoryExplorer");
  const format = useFormatter();
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });

  return (
    <div className="relative overflow-x-clip">
      <main className="relative mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-8 md:pb-24 md:pt-9" data-category-explorer>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap" data-cat-header>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-.04em] sm:text-[34px]">{t("title")}</h1>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-slate-500 dark:text-ink-muted" data-cat-meta>
              {t("lead")}
            </p>
          </div>
          <div className="flex-none lg:pt-1">
            <Link href="/products" className={PILL} data-cat-action="catalog">
              {t("actionCatalog")}
              <ArrowRight size={14} strokeWidth={2.2} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" data-cat-grid>
          {SECTORS.map((s) => {
            const list = sectorProducts(products, s);
            const from = fromPerKg(list);
            const Icon = ICON[s];
            const def = SECTOR_DEFS[s];
            // Gas sectors list their own gases; bulk lists the gases its large packs carry.
            const marks = def.gases.length ? def.gases : [...new Set(list.map((p) => gasMarkForProduct(p)).filter((m): m is NonNullable<typeof m> => m !== null))];
            const stocked = new Set(list.map((p) => gasMarkForProduct(p)).filter(Boolean).map((m) => normalizeMark(m!)));
            return (
              <article key={s} className="flex flex-col rounded-[22px] border border-slate-900/[.08] bg-white/75 p-6 backdrop-blur-xl dark:border-white/[.08] dark:bg-white/[.03]" data-sector={s}>
                <span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${TINT[s]}`}>
                  <Icon size={20} strokeWidth={1.9} />
                </span>
                <h2 className="m-0 mt-4 text-[18px] font-semibold tracking-[-.025em]">{t(`card_${s}`)}</h2>
                <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-slate-500 dark:text-ink-muted">{t(`blurb_${s}`)}</p>

                <div className="mt-4 flex flex-wrap gap-1.5" data-sector-gases>
                  {s === "equipment" ? (
                    <Link href="/compliance/sds" className={`${CHIP} border-slate-900/[.12] font-sans text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]`} data-sector-sds>
                      {t("chipSds")}
                    </Link>
                  ) : (
                    marks.map((m) =>
                      stocked.has(normalizeMark(m)) ? (
                        <Link key={m} href={`/products?gasType=${encodeURIComponent(m)}`} className={`${CHIP} border-slate-900/[.12] text-slate-700 hover:border-blue-600/40 hover:text-blue-700 dark:border-white/[.14] dark:text-slate-200 dark:hover:text-blue-300`} data-sector-gas={gasLabel(m)}>
                          {gasLabel(m)}
                        </Link>
                      ) : (
                        <span key={m} title={t("notStocked")} className={`${CHIP} border-dashed border-slate-900/[.12] text-slate-400 dark:border-white/[.14]`} data-sector-gas={gasLabel(m)} data-stocked="0">
                          {gasLabel(m)}
                        </span>
                      )
                    )
                  )}
                </div>

                <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-6">
                  <span className="text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200" data-sector-from>
                    {from ? t("fromPerKg", { price: eur(from.perKg) }) : " "}
                  </span>
                  <Link href={`/products?${new URLSearchParams(def.href).toString()}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-sector-all data-sector-count={String(list.length)}>
                    {t("viewItems", { n: list.length })}
                    <ArrowRight size={14} strokeWidth={2.4} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
