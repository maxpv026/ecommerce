"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MicroBadge, SURFACE, safetyTone, type BadgeTone } from "@/components/home/ui";
import { CatalogLine } from "@/components/catalog/CatalogItem";
import { fromPerKg, gasFacts, SECTOR_DEFS, sectorProducts, type Sector } from "@/lib/categorySectors";
import type { StoreProduct } from "@/lib/data";

/**
 * One application sector: header bar (title, technical summary, live count,
 * "from €/kg", link into the filtered catalog), the spec strip for its
 * headline gases, and the real catalog sizes as buyable lines.
 */

export const SECTOR_EMOJI: Record<Sector, string> = { ac: "❄️", auto: "🚗", heatpump: "🌱", commercial: "🧊", bulk: "🏭", equipment: "🧰" };
const EU_TONE: Record<string, BadgeTone> = { banned2025: "bad", restricted: "warn", phaseout: "info", ok: "ok", unknown: "muted" };
const COLLAPSED = 6;

export default function SectorModule({ sector, products, onNotify }: { sector: Sector; products: StoreProduct[]; onNotify: (p: StoreProduct) => void }) {
  const t = useTranslations("CategoryExplorer");
  const tHub = useTranslations("MarketHub");
  const format = useFormatter();
  const [expanded, setExpanded] = useState(false);
  const list = sectorProducts(products, sector);
  const facts = gasFacts(products, sector);
  const from = fromPerKg(list);
  const def = SECTOR_DEFS[sector];
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const n1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const shown = expanded ? list : list.slice(0, COLLAPSED);
  const query = new URLSearchParams(def.href).toString();

  const classes = [...new Set(facts.map((f) => f.safety).filter(Boolean))].join(" / ");
  const summary =
    sector === "bulk"
      ? t("summary_bulk", { containers: [...new Set(list.map((p) => t(`container_${p.containerType}`)))].join(", ") })
      : sector === "equipment"
        ? t("summary_equipment")
        : t("summary_gas", { gases: facts.map((f) => f.label).join(", "), classes });

  return (
    <section className={SURFACE} data-sector={sector} id={`sector-${sector}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-900/[.06] px-5 py-4 dark:border-white/[.06]">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h2 className="m-0 flex items-center gap-2 text-[17px] font-semibold tracking-[-.025em]">
            <span aria-hidden>{SECTOR_EMOJI[sector]}</span>
            {t(`title_${sector}`)}
            <MicroBadge tone="muted" data-sector-count={String(list.length)}>
              {t("count", { n: list.length })}
            </MicroBadge>
          </h2>
          <p className="m-0 mt-1 text-[12.5px] text-slate-500 dark:text-ink-muted" data-sector-summary>
            {summary}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-between">
          {from && (
            <span className="text-[13.5px] font-semibold tabular-nums" data-sector-from>
              {from.available ? t("fromPerKg", { price: eur(from.perKg) }) : t("fromPerKgOut", { price: eur(from.perKg) })}
            </span>
          )}
          <Link href={`/products?${query}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-sector-all>
            {t("allItems")}
            <ArrowRight size={13} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* Spec strip */}
      {facts.length > 0 ? (
        <div className="grid gap-px border-b border-slate-900/[.06] bg-slate-900/[.06] sm:grid-cols-2 dark:border-white/[.06] dark:bg-white/[.06]" data-sector-specs>
          {facts.map((f) => (
            <div key={f.mark} className="bg-white/80 px-5 py-3 dark:bg-[#0d1017]" data-sector-gas={f.label} data-stocked={f.stocked ? "1" : "0"}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13.5px] font-semibold">{f.label}</span>
                {f.safety && <MicroBadge tone={safetyTone(f.safety)}>{f.safety}</MicroBadge>}
                {f.gwp !== null && <MicroBadge>GWP {format.number(f.gwp)}</MicroBadge>}
                <MicroBadge tone={EU_TONE[f.eu]}>{tHub(`eu_${f.eu}`)}</MicroBadge>
                {!f.stocked && <MicroBadge tone="muted">{t("notStocked")}</MicroBadge>}
              </div>
              <dl className="m-0 mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12px]">
                {f.p45 !== null && (
                  <>
                    <dt className="text-slate-500 dark:text-ink-muted">{t("specPressure")}</dt>
                    <dd className="m-0 tabular-nums">{tHub("barG", { value: n1(f.p45) })}</dd>
                  </>
                )}
                {f.oilKey && (
                  <>
                    <dt className="text-slate-500 dark:text-ink-muted">{t("specOil")}</dt>
                    <dd className="m-0">{tHub(f.oilKey)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
          {def.portKey && (
            <div className="bg-white/80 px-5 py-2.5 text-[12px] sm:col-span-2 dark:bg-[#0d1017]" data-sector-port>
              <span className="text-slate-500 dark:text-ink-muted">{t("specPort")}: </span>
              <span className="font-medium">{t(def.portKey)}</span>
            </div>
          )}
        </div>
      ) : sector === "equipment" ? (
        <div className="border-b border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]">
          <Link href="/compliance/sds" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-sector-sds>
            <FileText size={14} strokeWidth={2.2} />
            {t("sdsLibrary")}
            <ArrowRight size={13} strokeWidth={2.4} />
          </Link>
        </div>
      ) : null}

      {/* Live rows */}
      <div className="divide-y divide-slate-900/[.06] dark:divide-white/[.06]">
        {list.length === 0 ? (
          <p className="m-0 px-5 py-6 text-center text-[13px] text-slate-500 dark:text-ink-muted">{t("sectorEmpty")}</p>
        ) : (
          shown.map((p) => (
            <CatalogLine key={p.sku} p={p} onNotify={onNotify} size={p.pricedPerKg ? t("sizeOf", { kg: format.number(p.weightKg, { maximumFractionDigits: 2 }), container: t(`container_${p.containerType}`) }) : undefined} />
          ))
        )}
      </div>
      {list.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-slate-900/[.06] px-5 py-2.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-900/[.02] dark:border-white/[.06] dark:text-slate-300 dark:hover:bg-white/[.03]"
          data-sector-more
        >
          {expanded ? t("showLess") : t("showAll", { n: list.length })}
          <ChevronDown size={14} strokeWidth={2.2} className={expanded ? "rotate-180" : ""} />
        </button>
      )}
    </section>
  );
}
