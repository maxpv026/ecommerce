"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, ShieldAlert, ShieldCheck, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EYEBROW, PRIMARY, SUMMARY_CARD, TrustChips } from "@/components/home/ui";
import { useCartStore } from "@/lib/store/cart";
import { regulationStatus } from "@/lib/regulation";
import { buildBundle, gasLabel, OBJECTS, PRIORITIES, SCALES, type ObjectType, type Priority } from "@/lib/categorySectors";
import type { StoreProduct } from "@/lib/data";

/**
 * The right card: a deterministic 3-step picker (object → priority → scale)
 * over the catalog the page holds (lib/categorySectors.buildBundle). It
 * recommends real, purchasable sizes only; when the right gas isn't stocked
 * or is out of stock it says so instead of substituting silently.
 */

const choice = (on: boolean) =>
  `w-full rounded-[12px] border px-3 py-2 text-left text-[12.5px] font-semibold leading-[1.35] transition-colors ${
    on ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.12] text-slate-700 hover:bg-slate-900/[.04] dark:border-white/[.14] dark:text-slate-200 dark:hover:bg-white/[.06]"
  }`;

export default function Configurator({ products }: { products: StoreProduct[] }) {
  const t = useTranslations("CategoryExplorer");
  const tHub = useTranslations("MarketHub");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);
  const [object, setObject] = useState<ObjectType>("split");
  const [priority, setPriority] = useState<Priority>("oem");
  const [scale, setScale] = useState<number>(3);
  const [added, setAdded] = useState<string | null>(null);
  const bundle = useMemo(() => buildBundle(products, object, priority, scale), [products, object, priority, scale]);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const n2 = (n: number) => format.number(n, { maximumFractionDigits: 2 });
  const key = `${object}|${priority}|${scale}`;

  const add = () => {
    if (!bundle.ok || bundle.shortBy > 0) return;
    for (const l of bundle.lines) addItem({ sku: l.product.sku, name: l.product.name, variant: l.product.weightLabel, pricePerKg: l.product.pricePerKg, weightKg: l.product.weightKg, deposit: l.product.cylinderDeposit }, l.qty);
    setAdded(key);
    toast.success(t("toastAdded", { n: bundle.lines.reduce((s, l) => s + l.qty, 0) }));
    window.setTimeout(() => setAdded((cur) => (cur === key ? null : cur)), 2200);
  };

  const status = bundle.ok && bundle.gwp !== null ? regulationStatus(bundle.gwp) : null;
  const gas = bundle.gas ? gasLabel(bundle.gas) : null;

  return (
    <div className={SUMMARY_CARD} data-configurator>
      <h2 className={EYEBROW}>{t("cfgEyebrow")}</h2>

      <fieldset className="m-0 mt-4 border-0 p-0">
        <legend className="mb-2 p-0 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t("step1")}</legend>
        <div className="grid gap-1.5" role="radiogroup" data-cfg-objects>
          {OBJECTS.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={object === o} onClick={() => setObject(o)} className={choice(object === o)} data-cfg-object={o}>
              {t(`obj_${o}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {object !== "service" && (
        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className="mb-2 p-0 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t("step2")}</legend>
          <div className="grid gap-1.5" role="radiogroup" data-cfg-priorities>
            {PRIORITIES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={choice(priority === p)} data-cfg-priority={p}>
                {t(`pri_${p}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {object !== "service" && (
        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className="mb-2 p-0 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{t("step3")}</legend>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" data-cfg-scales>
            {SCALES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scale === s} onClick={() => setScale(s)} className={choice(scale === s)} data-cfg-scale={s}>
                {t(`scale_${s}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* ── The recommendation ── */}
      <div className="mt-5 border-t border-slate-900/[.08] pt-4 dark:border-white/[.08]" data-cfg-result={bundle.ok ? "ok" : bundle.reason}>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.07em] text-slate-500 dark:text-ink-muted">{t("bundleTitle")}</div>
        {bundle.ok ? (
          <>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {bundle.lines.map((l) => (
                <li key={l.product.sku} className="flex items-baseline justify-between gap-3 text-[13px]" data-cfg-line={l.product.sku}>
                  <Link href={l.product.pdpHref} className="min-w-0 truncate font-semibold hover:underline">
                    {l.qty} × {l.product.name} <span className="font-normal text-slate-500 dark:text-ink-muted">· {l.product.weightLabel}</span>
                  </Link>
                  <span className="flex-none tabular-nums">{eur(l.product.cylinderPrice * l.qty)}</span>
                </li>
              ))}
            </ul>
            {bundle.noteKey && <p className="m-0 mt-1.5 text-[11.5px] leading-[1.45] text-slate-500 dark:text-ink-muted">{t(bundle.noteKey)}</p>}
            <dl className="m-0 mt-3 grid grid-cols-2 gap-2">
              {[
                { k: "net", label: t("kpiNet"), value: bundle.netKg > 0 ? `${n2(bundle.netKg)} ${t("kgUnit")}` : "—" },
                { k: "co2e", label: t("kpiCo2e"), value: bundle.co2eT > 0 ? `${n2(bundle.co2eT)} ${t("tUnit")}` : "—" },
                { k: "deposit", label: t("kpiDeposit"), value: eur(bundle.deposit) },
                { k: "goods", label: t("kpiGoods"), value: eur(bundle.goods) },
              ].map((m) => (
                <div key={m.k} className="rounded-[12px] border border-slate-900/[.07] bg-white/60 px-3 py-2 dark:border-white/[.08] dark:bg-white/[.03]" data-cfg-kpi={m.k}>
                  <dt className="truncate text-[11px] text-slate-500 dark:text-ink-muted">{m.label}</dt>
                  <dd className="m-0 mt-0.5 text-[14.5px] font-semibold tabular-nums">{m.value}</dd>
                </div>
              ))}
            </dl>
            {bundle.shortBy > 0 && (
              <p className="m-0 mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-400" data-cfg-short>
                {t("shortBy", { n: Math.min(...bundle.lines.map((l) => l.product.stockQuantity)) })}
              </p>
            )}

            {/* F-Gas status of the recommended gas */}
            {gas && status ? (
              status === "banned2025" ? (
                <div className="mt-3 flex items-start gap-2 rounded-[16px] border border-amber-500/30 bg-amber-500/10 py-2.5 pl-3 pr-3.5 text-[11.5px] font-semibold leading-[1.45] text-amber-800 dark:text-amber-300" data-cfg-compliance="restricted">
                  <ShieldAlert size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                  <span>{t("complianceBanned", { gas, gwp: bundle.gwp ?? 0 })}</span>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 py-2.5 pl-3 pr-3.5 text-[11.5px] font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300" data-cfg-compliance="ok">
                  <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                  <span>{t("complianceOk", { gas, status: tHub(`eu_${status}`) })}</span>
                </div>
              )
            ) : (
              <div className="mt-3 flex items-start gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 py-2.5 pl-3 pr-3.5 text-[11.5px] font-semibold leading-[1.45] text-emerald-700 dark:text-emerald-300" data-cfg-compliance="tools">
                <ShieldCheck size={13} strokeWidth={2.2} className="mt-[2px] flex-none" />
                <span>{t("complianceTools")}</span>
              </div>
            )}

            <button type="button" onClick={add} disabled={bundle.shortBy > 0} className={`${PRIMARY} mt-4 h-auto min-h-12 px-4 py-2.5 text-center leading-[1.3]`} data-cfg-add>
              {added === key ? <Check size={16} strokeWidth={2.4} /> : <ShoppingCart size={16} strokeWidth={2.2} />}
              {added === key ? t("added") : t("cta")}
              {added !== key && <ArrowRight size={16} strokeWidth={2.4} />}
            </button>
          </>
        ) : (
          <div className="mt-2" data-cfg-unavailable>
            <p className="m-0 text-[13px] leading-[1.5] text-slate-700 dark:text-slate-300">
              {bundle.reason === "notStocked" ? t("unavailable_notStocked", { gas: gas ?? "" }) : t("unavailable_outOfStock")}
            </p>
            {bundle.noteKey && <p className="m-0 mt-1.5 text-[11.5px] leading-[1.45] text-slate-500 dark:text-ink-muted">{t(bundle.noteKey)}</p>}
            {bundle.reason === "notStocked" ? (
              <Link href="/hub?tab=compare" className={`${PRIMARY} mt-4`} data-cfg-compat>
                {t("openCompat")}
                <ArrowRight size={16} strokeWidth={2.4} />
              </Link>
            ) : (
              bundle.candidates[0] && (
                <Link href={bundle.candidates[0].pdpHref} className={`${PRIMARY} mt-4`} data-cfg-notify>
                  {t("notifyOnPage")}
                  <ArrowRight size={16} strokeWidth={2.4} />
                </Link>
              )
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <TrustChips />
      </div>
    </div>
  );
}
