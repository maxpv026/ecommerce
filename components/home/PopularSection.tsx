"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CatalogCard } from "@/components/catalog/CatalogItem";
import type { StoreProduct } from "@/lib/data";
import { PILL, PILL_ON, SectionHeader } from "./ui";

/**
 * Popular cylinders: the catalog's own card (components/catalog/CatalogItem)
 * — the same badges, price lines and `- 1 +` as /products and the cart.
 */

const TABS = ["all", "lowGwp", "standard", "equipment"] as const;
type Tab = (typeof TABS)[number];

const inTab = (p: StoreProduct, tab: Tab) =>
  tab === "all"
    ? true
    : tab === "lowGwp"
      ? p.gwpClass === "A2L" || p.gwpClass === "A3"
      : tab === "standard"
        ? p.gwpClass === "A1"
        : p.category === "equipment" || p.category === "recovery";


const VISIBLE = 6;

export default function PopularSection({ products, onNotify }: { products: StoreProduct[]; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("HomeDesktop");
  const [tab, setTab] = useState<Tab>("all");
  const shown = products.filter((p) => inTab(p, tab)).slice(0, VISIBLE);
  const tabLabel: Record<Tab, string> = { all: t("tabAll"), lowGwp: t("tabLowGwp"), standard: t("tabStandard"), equipment: t("tabEquipment") };

  return (
    <section className="pt-16" data-home-section="popular">
      <SectionHeader
        id="popular"
        title={t("popularTitle")}
        meta={[t("popularLead")]}
        actions={
          <>
            <div role="tablist" aria-label={t("popularTitle")} className="flex flex-wrap items-center gap-2">
              {TABS.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-popular-tab={id} className={tab === id ? PILL_ON : PILL}>
                  {tabLabel[id]}
                  <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? "bg-white/15 dark:bg-slate-900/10" : "bg-slate-900/[.06] dark:bg-white/[.08]"}`}>
                    {products.filter((p) => inTab(p, id)).length}
                  </span>
                </button>
              ))}
            </div>
            <Link href="/products" className={`${PILL} text-blue-700 dark:text-blue-400`} data-popular-catalog>
              {t("fullCatalog")}
              <ArrowRight size={14} strokeWidth={2.4} />
            </Link>
          </>
        }
      />

      {shown.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-900/[.14] px-6 py-10 text-center text-[13px] text-slate-500 dark:border-white/[.14] dark:text-ink-muted" data-popular-empty>
          {t("emptyTab")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-popular-grid>
          {shown.map((p) => (
            <CatalogCard key={p.id} p={p} onNotify={onNotify} />
          ))}
        </div>
      )}
    </section>
  );
}
