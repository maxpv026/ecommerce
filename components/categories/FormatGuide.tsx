"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SURFACE } from "@/components/home/ui";
import { SurfaceHead } from "@/components/profile/hub/parts";
import { formatSummaries, type FormatSummary } from "@/lib/categorySectors";
import type { StoreProduct } from "@/lib/data";

/**
 * Supply formats as the catalog actually has them — its four net-weight
 * bands (the same bands as the /products weight filter, so the filter link
 * lands on exactly these sizes). Sizes, gases, €/kg range, deposit and
 * container type are read from the products; delivery names the carrier
 * options the order system has. Valve type and thread are not catalog data,
 * and the guide says where they are instead of guessing.
 */
export default function FormatGuide({ products }: { products: StoreProduct[] }) {
  const t = useTranslations("CategoryExplorer");
  const format = useFormatter();
  const formats = formatSummaries(products).filter((f) => f.products > 0);
  const [active, setActive] = useState(formats[1]?.band ?? formats[0]?.band);
  const f = formats.find((x) => x.band === active) ?? formats[0];
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const kg = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  if (!f) return null;

  return (
    <section className={SURFACE} data-format-guide>
      <SurfaceHead title={t("guideTitle")} meta={[t("guideMeta")]} id="formats" />
      <div className="grid gap-2 border-b border-slate-900/[.06] p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/[.06]" role="tablist" aria-label={t("guideTitle")}>
        {formats.map((x) => {
          const on = x.band === f.band;
          return (
            <button
              key={x.band}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(x.band)}
              data-format={x.band}
              className={`rounded-[16px] border px-3.5 py-3 text-left transition-colors ${
                on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.1] hover:bg-slate-900/[.03] dark:border-white/[.12] dark:hover:bg-white/[.05]"
              }`}
            >
              <span className="block text-[13px] font-semibold leading-[1.3]">{t(`fmt_${x.band}`)}</span>
              <span className={`mt-1 block text-[11.5px] tabular-nums ${on ? "opacity-75" : "text-slate-500 dark:text-ink-muted"}`}>
                {t("fmtCount", { n: x.products })} · {range(x, kg, t)}
              </span>
            </button>
          );
        })}
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-2.5 px-5 py-4 text-[12.5px] sm:grid-cols-2" data-format-detail={f.band}>
        <Row label={t("fSizes")} value={range(f, kg, t)} />
        <Row label={t("fContainer")} value={f.containers.map((c) => t(`container_${c}`)).join(", ")} />
        <Row label={t("fGases")} value={f.gases.join(", ")} />
        <Row label={t("fPrice")} value={f.perKg ? t("perKgRange", { min: eur(f.perKg.min), max: eur(f.perKg.max) }) : t("priceOnRequest")} />
        <Row label={t("fDeposit")} value={f.deposits.length ? f.deposits.map(eur).join(" / ") + " " + t("perCylinder") : "—"} />
        <Row label={t("fDelivery")} value={f.band === "over30" ? t("delivery_bulk") : t("delivery_cyl")} />
        <div className="flex items-start gap-2 rounded-[12px] border border-slate-900/[.08] bg-slate-900/[.02] px-3 py-2 sm:col-span-2 dark:border-white/[.08] dark:bg-white/[.03]" data-format-valve>
          <Info size={14} strokeWidth={2.2} className="mt-[2px] flex-none text-slate-500" />
          <span>
            <span className="font-semibold">{t("fValve")}: </span>
            {t("valveNote")}
          </span>
        </div>
      </dl>
      <div className="flex justify-end border-t border-slate-900/[.06] px-5 py-3 dark:border-white/[.06]">
        <Link href={`/products?kg=${f.band}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400" data-format-filter={f.band}>
          {t("filterCta")}
          <ArrowRight size={13} strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  );
}

function range(f: FormatSummary, kg: (n: number) => string, t: ReturnType<typeof useTranslations>) {
  return f.minKg === f.maxKg ? t("kgValue", { value: kg(f.minKg) }) : t("kgRange", { min: kg(f.minKg), max: kg(f.maxKg) });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="text-slate-500 dark:text-ink-muted">{label}</dt>
      <dd className="m-0 font-medium">{value}</dd>
    </div>
  );
}
