"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Bell, Check, ChevronRight, Pause, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import HeroModelGate from "@/components/HeroModelGate";
import { isPurchasable } from "@/lib/waitlist";
import { imagePathForProduct } from "@/lib/productMedia";
import { useCartStore } from "@/lib/store/cart";
import type { StoreProduct } from "@/lib/data";

/**
 * The hero's 3D stage with its gas dock.
 *
 * Which gas opens the page: the server renders the first dock gas, and the
 * browser switches to a random one right after hydration. The switch goes
 * through useSyncExternalStore — server snapshot = 0, client snapshot = one
 * pick per page load — which React reconciles without a hydration mismatch
 * (a random pick in render or in useState would differ from the HTML and
 * raise exactly the dev-overlay "Issue" this replaced). After that the dock
 * decides: a click, "next", or auto-rotate.
 *
 * Every chip is read from the gas's catalog row (lib/data getHomeShowcase).
 */

export interface ShowcaseItem {
  mark: string;
  product: StoreProduct;
}

let clientPick: number | null = null;
const noSubscribe = () => () => undefined;

const AUTO_MS = 6000;

const CHIP =
  "pointer-events-none absolute z-[2] rounded-2xl border border-white/80 bg-white/75 px-3.5 py-2.5 shadow-[0_20px_44px_-28px_rgba(15,23,42,.5)] backdrop-blur-lg max-md:rounded-[13px] max-md:px-2.5 max-md:py-1.5 dark:border-white/10 dark:bg-glass";

/** Phone chip positions: either side of the cylinder, clear of it and of the edges. */
const CHIP_POS_MOBILE: Record<string, string> = {
  safety: "max-md:left-0 max-md:right-auto max-md:top-[6%] max-md:bottom-auto",
  purity: "max-md:right-0 max-md:left-auto max-md:top-[6%] max-md:bottom-auto",
  gwp: "max-md:right-0 max-md:left-auto max-md:top-[40%] max-md:bottom-auto",
  // Both lower chips on the left: the bottom-right corner is where the chat button floats.
  weight: "max-md:left-0 max-md:right-auto max-md:bottom-[30%] max-md:top-auto",
  price: "max-md:left-0 max-md:right-auto max-md:bottom-[6%] max-md:top-auto",
};

export default function HeroShowcase({ items, onNotify }: { items: ShowcaseItem[]; onNotify: (product: StoreProduct) => void }) {
  const t = useTranslations("HomeDesktop");
  const format = useFormatter();
  const initial = useSyncExternalStore(
    noSubscribe,
    () => (clientPick ??= Math.floor(Math.random() * Math.max(1, items.length))),
    () => 0
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const index = Math.min(chosen ?? initial, Math.max(0, items.length - 1));
  const item = items[index];
  const dockRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  // Phones scroll the dock sideways: keep the gas on stage in view (auto-rotate, swipe, "next").
  useEffect(() => {
    const dock = dockRef.current;
    const on = dock?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!dock || !on || dock.scrollWidth <= dock.clientWidth) return;
    dock.scrollTo({ left: on.offsetLeft - (dock.clientWidth - on.offsetWidth) / 2, behavior: "smooth" });
  }, [index]);

  useEffect(() => {
    if (!auto || items.length < 2) return;
    const id = window.setInterval(() => setChosen((c) => ((c ?? initial) + 1) % items.length), AUTO_MS);
    return () => window.clearInterval(id);
  }, [auto, items.length, initial]);

  if (!item) return null;
  const p = item.product;
  const purchasable = isPurchasable(p);
  const eur = (n: number) => format.number(n, { style: "currency", currency: "EUR" });
  const pick = (i: number) => {
    setAuto(false);
    setChosen(i);
  };

  const addThis = () => {
    addItem({ sku: p.sku, name: p.name, variant: p.weightLabel, pricePerKg: p.pricePerKg, weightKg: p.weightKg, deposit: p.cylinderDeposit });
    setAdded(p.sku);
    window.setTimeout(() => setAdded((s) => (s === p.sku ? null : s)), 1600);
  };

  const chips = [
    { key: "purity", label: t("specPurity"), value: p.purity !== null ? `${format.number(p.purity, { maximumFractionDigits: 2 })}%` : "—", pos: "right-[3%] top-[8%]" },
    { key: "safety", label: t("specSafety"), value: p.gwpClass && p.gwpClass !== "n/a" ? p.gwpClass : "—", pos: "left-[2%] top-[14%]" },
    { key: "gwp", label: t("specGwp"), value: p.gwp !== null ? format.number(p.gwp) : "—", pos: "right-[0%] top-[44%]" },
    { key: "weight", label: t("specNetWeight"), value: `${format.number(p.weightKg, { maximumFractionDigits: 2 })} kg`, pos: "bottom-[10%] left-[0%]" },
    { key: "price", label: t("specPrice"), value: p.pricePerKg > 0 ? format.number(p.pricePerKg, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : t("priceOnRequest"), pos: "bottom-[6%] right-[4%]" },
  ];

  return (
    <div className="flex h-full w-full flex-col" data-hero-showcase data-hero-gas={item.mark}>
      {/* Stage + floating spec chips. Phones get the still render of the same model
          (HeroModelGate never loads the 3D below md) and change gas with a swipe. */}
      <div
        // pan-y: the page still scrolls vertically, a sideways drag is ours (otherwise the browser claims it and cancels the touch).
        className="relative min-h-0 flex-1 max-md:h-[380px] max-md:flex-none max-md:touch-pan-y"
        data-hero-stage
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start === null || end === undefined || Math.abs(end - start) < 40 || items.length < 2) return;
          pick((index + (end < start ? 1 : items.length - 1)) % items.length);
        }}
      >
        <HeroModelGate mark={item.mark} marks={items.map((i) => i.mark)} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-[22%] inset-y-[4%] md:hidden" aria-hidden data-hero-still>
          <AnimatePresence mode="popLayout" initial={false}>
            {imagePathForProduct(p) && (
              <motion.div
                key={item.mark}
                className="absolute inset-0"
                initial={{ opacity: 0, x: 24, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
              >
                <Image src={imagePathForProduct(p)!} alt="" fill sizes="(max-width: 767px) 56vw, 1px" className="object-contain drop-shadow-[0_28px_30px_rgba(15,23,42,.28)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {chips.map((c, i) => (
            <motion.div
              key={`${item.mark}-${c.key}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.04 * i, duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              className={`${CHIP} ${c.pos} ${CHIP_POS_MOBILE[c.key] ?? ""}`}
              data-hero-chip={c.key}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400 max-md:text-[8.5px] max-md:tracking-[.06em] dark:text-ink-muted">{c.label}</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-[-.03em] max-md:text-[13.5px]">{c.value}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Gas dock */}
      <div className="mt-3 flex items-center justify-center gap-2">
        <div
          ref={dockRef}
          role="radiogroup"
          aria-label={t("dockLabel")}
          className="scrollbar-hide inline-flex rounded-full border border-slate-900/[.1] bg-white/75 p-1 backdrop-blur-xl max-md:min-w-0 max-md:overflow-x-auto dark:border-white/[.12] dark:bg-white/[.04]"
          data-hero-dock
        >
          {items.map((it, i) => {
            const on = i === index;
            return (
              <button
                key={it.mark}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(i)}
                data-hero-dock-gas={it.mark}
                className={`h-8 flex-none whitespace-nowrap rounded-full px-3 text-[12.5px] max-md:px-2.5 max-md:text-[12px] font-semibold tracking-[-.01em] transition-colors ${
                  on ? "bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-900/[.05] dark:text-slate-300 dark:hover:bg-white/[.08]"
                }`}
              >
                {it.product.type}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => pick((index + 1) % items.length)}
          aria-label={t("dockNext")}
          title={t("dockNext")}
          data-hero-dock-next
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-slate-900/[.1] bg-white/75 text-slate-700 max-md:h-9 max-md:w-9 transition-colors hover:bg-white dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-200 dark:hover:bg-white/[.09]"
        >
          <ChevronRight size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => setAuto((a) => !a)}
          aria-pressed={auto}
          aria-label={t("dockAutoplay")}
          title={t("dockAutoplay")}
          data-hero-dock-auto
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border transition-colors max-md:h-9 max-md:w-9 ${
            auto ? "border-transparent bg-[#0B1020] text-white dark:bg-white dark:text-slate-900" : "border-slate-900/[.1] bg-white/75 text-slate-700 hover:bg-white dark:border-white/[.12] dark:bg-white/[.04] dark:text-slate-200 dark:hover:bg-white/[.09]"
          }`}
        >
          {auto ? <Pause size={15} strokeWidth={2.2} /> : <Play size={15} strokeWidth={2.2} />}
        </button>
      </div>

      {/* Actions for the gas on stage */}
      <div className="mt-3 flex items-center justify-center gap-2 max-sm:flex-col max-sm:items-stretch" data-hero-actions>
        {purchasable ? (
          <button
            type="button"
            onClick={addThis}
            data-hero-add={p.sku}
            className={`inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] px-5 text-[13.5px] max-sm:h-12 max-sm:justify-center font-semibold tracking-[-.015em] text-white transition-colors ${added === p.sku ? "bg-emerald-600" : "bg-blue-700 hover:bg-blue-800"}`}
          >
            {added === p.sku ? <Check size={16} strokeWidth={2.4} /> : null}
            {added === p.sku ? t("added") : t("addThisCylinder", { gas: p.type, price: eur(p.cylinderPrice) })}
            {added !== p.sku && <ArrowRight size={16} strokeWidth={2.2} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNotify(p)}
            data-hero-notify={p.sku}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[14px] border border-slate-900/[.12] bg-white/80 px-5 text-[13.5px] max-sm:h-12 max-sm:justify-center font-semibold text-slate-800 hover:bg-white dark:border-white/[.14] dark:bg-white/[.05] dark:text-slate-100"
          >
            <Bell size={15} strokeWidth={2} />
            {t("notifyThisCylinder", { gas: p.type })}
          </button>
        )}
        <Link
          href={p.pdpHref}
          data-hero-view={p.sku}
          className="inline-flex h-11 items-center whitespace-nowrap rounded-[14px] border border-slate-900/[.12] bg-white/80 px-4 text-[13.5px] max-sm:justify-center font-semibold text-slate-800 transition-colors hover:bg-white dark:border-white/[.14] dark:bg-white/[.05] dark:text-slate-100 dark:hover:bg-white/[.09]"
        >
          {t("viewInCatalog")}
        </Link>
      </div>
    </div>
  );
}
