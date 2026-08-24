"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FlaskConical,
  Lock,
  Minus,
  Plus,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
} from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { checkCompatibility, type CompatibilityResult } from "@/lib/actions/compatibility";
import type { StoreProduct } from "@/lib/data";

const ThreeCylinder = dynamic(() => import("./ThreeCylinder"), { ssr: false });

/* Volume-discount policy applied to the live base price. */
const TIERS = [
  { labelKey: "tier1", min: 1, discount: 0 },
  { labelKey: "tier2", min: 5, discount: 7 },
  { labelKey: "tier3", min: 20, discount: 13 },
] as const;

/* Stage light follows the product: A2L low-GWP = emerald, A1 = cyan, gear = blue. */
const brandFor = (p: StoreProduct) =>
  p.gwpClass === "A2L"
    ? { glow: "#34d399", glow2: "#22d3ee" }
    : p.gwpClass === "A1"
      ? { glow: "#22d3ee", glow2: "#2563eb" }
      : { glow: "#60a5fa", glow2: "#7c3aed" };

const STOCK_BADGE = {
  in: { key: "stockIn", dot: "#34d399", cls: "border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.14)] text-[#047857] dark:text-[#34d399] shadow-[0_0_18px_-6px_#34d399]" },
  low: { key: "stockLow", dot: "#fbbf24", cls: "border-[rgba(245,158,11,.32)] bg-[rgba(245,158,11,.15)] text-[#b45309] dark:text-[#fbbf24] shadow-[0_0_18px_-6px_#fbbf24]" },
  order: { key: "stockOrder", dot: "#22d3ee", cls: "border-[rgba(56,189,248,.3)] bg-[rgba(56,189,248,.14)] text-[#0369a1] dark:text-[#38bdf8] shadow-[0_0_18px_-6px_#22d3ee]" },
} as const;

const RELATED_TINTS = ["#22d3ee", "#34d399", "#60a5fa", "#a78bfa", "#34d399", "#22d3ee"];

const DOCS = [
  { id: "sds", nameKey: "docSds", metaKey: "docSdsMeta", icon: FileText },
  { id: "adr", nameKey: "docAdr", metaKey: "docAdrMeta", icon: Truck },
  { id: "coa", nameKey: "docCoa", metaKey: "docCoaMeta", icon: FlaskConical },
  { id: "ahri", nameKey: "docAhri", metaKey: "docAhriMeta", icon: ShieldCheck },
] as const;

interface ProductDetailProps {
  product: StoreProduct;
  related: StoreProduct[];
}

export default function ProductDetail({ product, related }: ProductDetailProps) {
  const t = useTranslations("ProductDetail");
  const tProducts = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const tHome = useTranslations("HomeDesktop");
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);

  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [tierIdx, setTierIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<Extract<CompatibilityResult, { ok: true }> | null>(null);
  const [aiPending, startAi] = useTransition();
  const [relAdded, setRelAdded] = useState<string[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  const brand = brandFor(product);
  const stock = STOCK_BADGE[product.stockLevel];
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const tier = TIERS[tierIdx];
  const tierUnit = (discount: number) => Math.round(product.price * (1 - discount / 100) * 100) / 100;
  const unitPrice = tierUnit(tier.discount);

  // The real 3D viewer for actual cylinders; the design's stylized parallax
  // cylinder stands in for equipment/services with no GLB model.
  const has3dModel = product.category === "cylinders" || product.category === "blends";

  const categoryKey =
    { cylinders: "cylTitle", blends: "blendTitle", equipment: "eqTitle", recovery: "recTitle" }[product.category] ?? "cylTitle";

  const specs = useMemo(
    () => [
      { label: t("specRefrigerant"), value: product.type },
      { label: tProducts("specPurity"), value: product.purity !== null ? `${product.purity}%` : tProducts("na") },
      { label: tProducts("specGwp"), value: product.gwp !== null ? String(product.gwp) : tProducts("na") },
      { label: t("specSafety"), value: product.gwpClass },
      { label: t("specNetWeight"), value: product.weightLabel },
      { label: t("specSku"), value: product.sku },
      { label: t("specCategory"), value: tCat(categoryKey) },
      { label: t("specAvailability"), value: t(stock.key) },
    ],
    [product, t, tProducts, tCat, categoryKey, stock.key]
  );

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (has3dModel) return; // OrbitControls owns interaction there
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
  };

  const addToCart = () => {
    addItem({ sku: product.sku, name: product.name, variant: product.weightLabel, price: unitPrice }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const runAi = () => {
    const system = aiQuery.trim();
    if (!system || aiPending) return;
    setAiResult(null);
    startAi(async () => {
      const result = await checkCompatibility({ sku: product.sku, system });
      if (!result.ok) {
        toast.error(tProducts("aiError"));
        return;
      }
      setAiResult(result);
    });
  };

  const verdictStyles =
    aiResult?.verdict === "compatible"
      ? { box: "border-[rgba(16,185,129,.24)] bg-[rgba(16,185,129,.09)]", text: "text-[#047857] dark:text-[#34d399]", label: t("aiCompatible") }
      : aiResult?.verdict === "incompatible"
        ? { box: "border-[rgba(239,68,68,.26)] bg-[rgba(239,68,68,.09)]", text: "text-red-600 dark:text-red-400", label: t("aiIncompatible") }
        : { box: "border-[rgba(245,158,11,.26)] bg-[rgba(245,158,11,.09)]", text: "text-[#b45309] dark:text-[#fbbf24]", label: t("aiUnknown") };

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header query={query} onQueryChange={setQuery} onSignInClick={() => setIsAuthModalOpen(true)} />

      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1000px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)]">
          <div className="absolute -top-[280px] left-[-10%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.28] blur-[120px] [animation:hc-float_28s_ease-in-out_infinite]" />
          <div className="absolute -top-[180px] right-[-6%] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_66%)] opacity-[.26] blur-[120px] [animation:hc-float_36s_ease-in-out_infinite_reverse]" />
        </div>

        {/* page mount: elegant fade + glide up */}
        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-8"
        >
          {/* breadcrumb */}
          <div className="mb-7 flex items-center gap-[9px] text-xs text-slate-400 dark:text-ink-muted">
            <Link href="/products" className="hover:text-blue-700 dark:hover:text-blue-400">
              {t("crumbRoot")}
            </Link>
            <span>/</span>
            <Link
              href={{ pathname: "/products", query: { category: product.category } }}
              className="hover:text-blue-700 dark:hover:text-blue-400"
            >
              {tCat(categoryKey)}
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-900 dark:text-slate-50">{product.name}</span>
          </div>

          {/* ── hero: 3D stage + purchase card ── */}
          <div className="grid items-stretch gap-5 lg:grid-cols-[1.08fr_.92fr]">
            <div
              onMouseMove={onStageMove}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
              data-stage
              className="relative flex min-h-[420px] cursor-grab items-center justify-center overflow-hidden rounded-[30px] border border-transparent bg-[#0b1020] shadow-[0_46px_96px_-50px_rgba(2,4,10,.8)] [perspective:1200px] lg:min-h-[620px] dark:border-white/[.08] dark:bg-[#0b0d12]"
            >
              {/* breathing ambient light in the product's own colour */}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px] [animation:hc-breathe_6s_ease-in-out_infinite]"
                style={{
                  background: `radial-gradient(circle,${brand.glow},${brand.glow2}33,transparent 68%)`,
                  translate: `${tilt.x * -34}px ${tilt.y * -26}px`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(circle_at_50%_50%,#000_30%,transparent_72%)] [-webkit-mask-image:radial-gradient(circle_at_50%_50%,#000_30%,transparent_72%)]" />

              {has3dModel ? (
                <div className="absolute inset-0" data-r3f-stage>
                  <ThreeCylinder variant="full" />
                </div>
              ) : (
                <div
                  className="relative [transform-style:preserve-3d]"
                  style={{ transform: `rotateY(${tilt.x * 22}deg) rotateX(${tilt.y * -14}deg)` }}
                >
                  <div className="relative flex flex-col items-center [animation:hc-bob_7s_ease-in-out_infinite] [transform-style:preserve-3d]">
                    <div className="relative h-[280px] w-[150px] rounded-t-[120px] rounded-b-[26px] border border-white/[.22] bg-[linear-gradient(112deg,rgba(255,255,255,.2),rgba(255,255,255,.05)_42%,rgba(255,255,255,.14))] shadow-[inset_0_0_44px_rgba(255,255,255,.14)] [animation:hc-sway_14s_ease-in-out_infinite] [transform-style:preserve-3d] lg:h-[350px] lg:w-[190px]"
                      style={{ boxShadow: `inset 0 0 44px rgba(255,255,255,.14), 0 0 70px -14px ${brand.glow}88` }}
                    >
                      <div className="pointer-events-none absolute left-[14%] top-[8%] h-[78%] w-[16%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.05))] blur-[7px] [animation:hc-sheen_9s_ease-in-out_infinite]" />
                      <div className="absolute -top-4 left-1/2 h-[26px] w-[62px] -translate-x-1/2 rounded-[10px] border border-white/[.24] bg-[linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,.12))]" />
                      <div className="absolute -top-[34px] left-1/2 h-[22px] w-[22px] -translate-x-1/2 rounded-md bg-[linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,.2))]" />
                      <div className="absolute left-1/2 top-[44%] w-[122px] -translate-x-1/2 rounded-xl border border-white/[.18] bg-[rgba(10,12,18,.5)] px-3 py-[11px] text-center text-white backdrop-blur-[6px]">
                        <span className="block text-[9px] tracking-[.14em] opacity-70">MY ENERGY</span>
                        <span className="mt-[3px] block text-[15px] font-semibold tracking-[-.02em]">{product.type}</span>
                      </div>
                    </div>
                    <div className="mt-[30px] h-[26px] w-[170px] rounded-full bg-[rgba(2,4,10,.6)] blur-[18px] lg:w-[220px]" />
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute bottom-[18px] left-5 right-5 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-[7px] rounded-full border border-white/[.16] bg-white/[.08] py-1.5 pl-[9px] pr-3 text-[10.5px] font-semibold text-white/[.86]">
                  <span className="h-[5px] w-[5px] rounded-full" style={{ background: brand.glow, boxShadow: `0 0 8px 1px ${brand.glow}` }} />
                  {t("stageTag")}
                </span>
                <span className="text-[10.5px] uppercase tracking-[.06em] text-white/50">
                  {product.gwpClass}{product.gwp !== null ? ` · GWP ${product.gwp}` : ""}
                </span>
              </div>
            </div>

            {/* purchase card */}
            <div className="flex min-w-0">
              <div className="relative w-full overflow-hidden rounded-[30px] border border-slate-900/[.07] bg-white/70 p-[30px] shadow-[0_26px_60px_-46px_rgba(2,4,10,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/5 dark:bg-surface/60">
                <div
                  className="pointer-events-none absolute -top-[42%] right-[-22%] h-[380px] w-[380px] rounded-full opacity-[.16] blur-[80px]"
                  style={{ background: `radial-gradient(circle,${brand.glow},transparent 68%)` }}
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3.5">
                    <div className="min-w-0">
                      <div className="mb-[9px] text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{product.sku}</div>
                      <h1 className="m-0 text-[31px] font-semibold leading-[1.08] tracking-[-.045em]">{product.name}</h1>
                    </div>
                    <span className={`inline-flex flex-none items-center gap-[7px] rounded-full border py-1.5 pl-[9px] pr-3 text-[11px] font-semibold ${stock.cls}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: stock.dot, boxShadow: `0 0 8px 1px ${stock.dot}` }} />
                      {t(stock.key)}
                    </span>
                  </div>

                  <p className="mt-3.5 text-[13.5px] leading-[1.62] text-slate-600 dark:text-ink-muted">
                    {t(`blurb_${product.category}`)}
                  </p>

                  <div className="mt-6 flex flex-wrap items-end gap-3.5">
                    <span>
                      <span className="block text-[38px] font-semibold leading-none tracking-[-.05em]">{eur(unitPrice)}</span>
                      <span className="mt-1.5 block text-[11.5px] text-slate-400 dark:text-ink-muted">
                        {t("perUnit", { volume: product.weightLabel })}
                      </span>
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        tier.discount
                          ? "border-[rgba(16,185,129,.28)] bg-[rgba(16,185,129,.14)] text-[#047857] dark:text-[#34d399]"
                          : "border-slate-900/[.07] bg-slate-100 text-slate-400 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted"
                      }`}
                    >
                      {tier.discount ? t("saveTier", { pct: tier.discount }) : t("listPrice")}
                    </span>
                  </div>

                  <div className="mt-[22px]">
                    <div className="mb-2.5 text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{t("volumeTier")}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {TIERS.map((tr, i) => {
                        const on = i === tierIdx;
                        return (
                          <motion.button
                            key={tr.labelKey}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setTierIdx(i)}
                            className={`rounded-[15px] border px-2.5 py-3 text-center transition-colors ${
                              on
                                ? "border-blue-700 bg-blue-700 text-white shadow-[0_14px_28px_-14px_#1d4ed8]"
                                : "border-slate-900/[.07] bg-slate-100 text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted"
                            }`}
                          >
                            <span className="block text-[12.5px] font-semibold tracking-[-.015em]">{t(tr.labelKey)}</span>
                            <span className="mt-[3px] block text-[11px] opacity-75">{eur(tierUnit(tr.discount))}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-[22px] flex items-center gap-3">
                    <div className="flex h-[52px] items-center gap-0.5 rounded-2xl border border-slate-900/[.07] bg-slate-100 px-1 dark:border-hairline dark:bg-surface-3">
                      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t("qtyDec")} className="flex h-11 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-900/[.05] dark:text-ink-muted dark:hover:bg-white/10">
                        <Minus size={15} strokeWidth={2} />
                      </button>
                      <span className="min-w-[34px] text-center text-[15px] font-semibold">{qty}</span>
                      <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label={t("qtyInc")} className="flex h-11 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-900/[.05] dark:text-ink-muted dark:hover:bg-white/10">
                        <Plus size={15} strokeWidth={2} />
                      </button>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ y: -1 }}
                      onClick={addToCart}
                      data-add-to-cart
                      className={`flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl px-[22px] text-[15px] font-semibold tracking-[-.02em] text-white transition-[background-color,box-shadow] duration-300 ${
                        added
                          ? "bg-green-600 shadow-[0_26px_52px_-18px_#16a34a,0_0_34px_-8px_#16a34a]"
                          : "bg-blue-700 shadow-[0_18px_38px_-18px_#1d4ed8] hover:bg-blue-800 hover:shadow-[0_26px_52px_-18px_#1d4ed8,0_0_34px_-8px_#1d4ed8]"
                      }`}
                    >
                      {added ? t("addedToCart") : tHome("addToCart")}
                      {added ? <Check size={17} strokeWidth={2.4} /> : <ShoppingCart size={17} strokeWidth={2} />}
                    </motion.button>
                  </div>

                  {/* AI compatibility checker */}
                  <div
                    data-ai-checker
                    className={`mt-[22px] overflow-hidden rounded-[20px] border bg-slate-100 transition-colors duration-300 dark:bg-surface-3 ${
                      aiOpen ? "border-[rgba(96,165,250,.4)]" : "border-slate-900/[.07] dark:border-hairline"
                    }`}
                  >
                    <button type="button" onClick={() => setAiOpen((v) => !v)} className="flex w-full items-center gap-3 p-[15px] text-left">
                      <motion.span
                        animate={aiPending ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                        transition={aiPending ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_12px_24px_-12px_rgba(37,99,235,.7)]"
                      >
                        <Sparkles size={18} strokeWidth={2} className="text-white" />
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold tracking-[-.02em]">{t("aiTitle")}</span>
                        <span className="mt-[3px] block text-[11.5px] text-slate-400 dark:text-ink-muted">{t("aiSub")}</span>
                      </span>
                      <motion.span animate={{ rotate: aiOpen ? 180 : 0 }} transition={{ duration: 0.3 }} className="flex flex-none">
                        <ChevronDown size={15} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                      </motion.span>
                    </button>

                    <AnimatePresence>
                      {aiOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-2 px-3.5 pt-0">
                            <input
                              value={aiQuery}
                              onChange={(e) => setAiQuery(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && runAi()}
                              placeholder={t("aiPlaceholder")}
                              className="h-11 min-w-0 flex-1 rounded-[14px] border border-slate-900/[.14] bg-white px-3.5 text-[13px] tracking-[-.01em] text-slate-900 focus:outline-none dark:border-hairline-strong dark:bg-white/[.04] dark:text-slate-50 dark:placeholder:text-slate-500"
                            />
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.95 }}
                              onClick={runAi}
                              aria-label={t("aiTitle")}
                              className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-blue-700 shadow-[0_12px_24px_-12px_#1d4ed8] transition-colors hover:bg-blue-800"
                            >
                              <Send size={16} strokeWidth={2} className="text-white" />
                            </motion.button>
                          </div>

                          {aiPending && (
                            <div className="flex items-center gap-1.5 px-[15px] pt-3.5">
                              {[0, 0.16, 0.32].map((d) => (
                                <span key={d} className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400" style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }} />
                              ))}
                              <span className="ml-1 text-xs text-slate-400 dark:text-ink-muted">{t("aiChecking")}</span>
                            </div>
                          )}

                          <AnimatePresence>
                            {aiResult && (
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                data-ai-answer
                                className={`mx-[15px] mt-3.5 rounded-2xl border p-[15px] ${verdictStyles.box}`}
                              >
                                <span className="mb-[9px] flex items-center gap-2">
                                  <ShieldCheck size={15} strokeWidth={2} className={verdictStyles.text} />
                                  <span className={`text-[12.5px] font-semibold tracking-[-.015em] ${verdictStyles.text}`}>
                                    {verdictStyles.label}
                                  </span>
                                </span>
                                <span className="block text-[12.5px] leading-[1.62] text-slate-600 dark:text-slate-300">
                                  {aiResult.summary}
                                </span>
                                {aiResult.checks.length > 0 && (
                                  <span className="mt-3 flex flex-wrap gap-[7px]">
                                    {aiResult.checks.map((chip) => (
                                      <span key={chip} className="inline-flex items-center rounded-full border border-slate-900/[.07] bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                                        {chip}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div className="pb-3.5" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-5 border-t border-slate-900/[.07] pt-[18px] dark:border-hairline">
                    {[
                      { label: t("assurance1"), icon: FlaskConical },
                      { label: t("assurance2"), icon: Truck },
                      { label: t("assurance3"), icon: Lock },
                    ].map(({ label, icon: Icon }) => (
                      <span key={label} className="flex items-center gap-2 text-[11.5px] text-slate-600 dark:text-ink-muted">
                        <Icon size={14} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── bento: specs 5 / docs 4 / handling 3 ── */}
          <div className="mt-[22px] grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
              className="relative overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white/70 p-[26px] backdrop-blur-xl backdrop-saturate-150 lg:col-span-5 dark:border-white/5 dark:bg-surface/60"
            >
              <h2 className="m-0 mb-5 text-[12.5px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("specsTitle")}</h2>
              <div className="grid grid-cols-2 gap-[11px]">
                {specs.map((spec) => (
                  <div key={spec.label} className="rounded-2xl border border-slate-900/[.07] bg-slate-100 px-4 py-[15px] dark:border-hairline dark:bg-surface-3">
                    <div className="mb-[7px] text-[10px] tracking-[.07em] text-slate-400 dark:text-ink-muted">{spec.label}</div>
                    <div className="truncate text-[14.5px] font-semibold tracking-[-.025em]">{spec.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
              className="relative overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white/70 p-[26px] backdrop-blur-xl backdrop-saturate-150 lg:col-span-4 dark:border-white/5 dark:bg-surface/60"
            >
              <h2 className="m-0 mb-5 text-[12.5px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("docsTitle")}</h2>
              <div className="flex flex-col gap-2.5">
                {DOCS.map(({ id, nameKey, metaKey, icon: Icon }) => (
                  <motion.div key={id} whileTap={{ scale: 0.97 }}>
                    <Link
                      href="/compliance/sds"
                      className="group flex w-full items-center gap-3 rounded-[18px] border border-slate-900/[.07] p-[13px] text-left transition-[background-color,border-color,box-shadow] duration-300 hover:border-[rgba(96,165,250,.34)] hover:bg-slate-100 hover:shadow-[0_0_22px_-8px_rgba(59,130,246,.6)] dark:border-hairline dark:hover:bg-surface-3"
                    >
                      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] border border-slate-900/[.07] bg-slate-100 transition-colors group-hover:border-[rgba(37,99,235,.3)] group-hover:bg-blue-700/[.08] dark:border-hairline dark:bg-surface-3 dark:group-hover:bg-blue-600/[.18]">
                        <Icon size={17} strokeWidth={2} className="text-slate-600 transition-colors group-hover:text-blue-700 dark:text-ink-muted dark:group-hover:text-blue-400" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold tracking-[-.02em]">{t(nameKey)}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-ink-muted">{t(metaKey)}</span>
                      </span>
                      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] transition-[background-color,box-shadow] duration-300 group-hover:bg-blue-700 group-hover:shadow-[0_12px_24px_-12px_#1d4ed8]">
                        <Download size={15} strokeWidth={2} className="text-slate-400 transition-colors group-hover:text-white dark:text-ink-muted" />
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.19 }}
              className="relative overflow-hidden rounded-[28px] bg-[#0b1020] p-[26px] shadow-[0_40px_80px_-46px_rgba(11,16,32,.9)] lg:col-span-3"
            >
              <div
                className="pointer-events-none absolute -bottom-[40%] left-[-24%] h-[360px] w-[360px] rounded-full opacity-60 blur-[80px]"
                style={{ background: `radial-gradient(circle,${brand.glow},transparent 68%)` }}
              />
              <div className="relative">
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[15px] border border-white/[.18] bg-white/10">
                  <ShieldCheck size={20} strokeWidth={2} className="text-white" />
                </span>
                <h2 className="m-0 mt-[18px] text-[19px] font-semibold tracking-[-.035em] text-white">{t("noteTitle")}</h2>
                <p className="m-0 mt-3 text-[13px] leading-[1.66] text-white/[.72]">{t("noteBody")}</p>
                <Link href="/compliance/sds" className="mt-[18px] inline-flex text-[12.5px] font-semibold text-white hover:text-blue-300">
                  {t("noteLink")}
                </Link>
              </div>
            </motion.div>
          </div>

          {/* ── frequently bought together rail ── */}
          <div className="mt-16">
            <div className="mb-5 flex items-baseline justify-between gap-5">
              <h2 className="m-0 text-[12.5px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("fbtTitle")}</h2>
              <div className="flex items-center gap-2">
                {[
                  { dir: -1, Icon: ChevronLeft, label: t("railPrev") },
                  { dir: 1, Icon: ChevronRight, label: t("railNext") },
                ].map(({ dir, Icon, label }) => (
                  <button
                    key={dir}
                    type="button"
                    aria-label={label}
                    onClick={() => railRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" })}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-900/[.14] text-slate-600 transition-colors hover:bg-slate-900/[.05] dark:border-hairline-strong dark:text-ink-muted dark:hover:bg-white/10"
                  >
                    <Icon size={15} strokeWidth={2} />
                  </button>
                ))}
              </div>
            </div>

            <div ref={railRef} className="scrollbar-hide flex gap-4 overflow-x-auto p-1 pb-[18px]">
              {related.map((rel, i) => {
                const tint = RELATED_TINTS[i % RELATED_TINTS.length];
                const inCart = relAdded.includes(rel.sku);
                return (
                  <motion.div
                    key={rel.id}
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 + i * 0.06 }}
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="group flex flex-none"
                    data-related-card
                  >
                    <Link
                      href={`/products/${rel.id}`}
                      className="relative block w-[236px] flex-none overflow-hidden rounded-[22px] border border-slate-900/[.07] bg-white/60 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:border-white/5 dark:bg-surface/60"
                      style={{ boxShadow: "0 14px 34px -32px rgba(2,4,10,.5)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${tint}80`;
                        e.currentTarget.style.boxShadow = `0 40px 80px -44px rgba(2,4,10,.66), 0 0 28px -8px ${tint}88`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.boxShadow = "0 14px 34px -32px rgba(2,4,10,.5)";
                      }}
                    >
                      <span
                        className="pointer-events-none absolute -top-[52%] right-[-24%] h-[260px] w-[260px] rounded-full opacity-10 blur-[64px] transition-opacity duration-500 group-hover:opacity-30"
                        style={{ background: `radial-gradient(circle,${tint},transparent 68%)` }}
                      />
                      <span className="relative m-3 mb-0 flex h-[132px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-surface-3">
                        <span className="block h-[84px] w-[42px] rounded-t-[22px] rounded-b-md border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
                      </span>
                      <span className="relative block p-4">
                        <span className="block text-[13.5px] font-semibold tracking-[-.025em]">{rel.name}</span>
                        <span className="mt-[3px] block text-[11px] text-slate-400 dark:text-ink-muted">
                          {rel.weightLabel}
                          {rel.gwp !== null ? ` · GWP ${rel.gwp}` : ""}
                        </span>
                        <span className="mt-[13px] flex items-center justify-between gap-2.5">
                          <span className="text-[15px] font-semibold tracking-[-.03em]">{eur(rel.price)}</span>
                          <motion.span
                            whileTap={{ scale: 0.9 }}
                            role="button"
                            aria-label={tHome("addToCart")}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addItem({ sku: rel.sku, name: rel.name, variant: rel.weightLabel, price: rel.price });
                              setRelAdded((a) => [...a, rel.sku]);
                            }}
                            className={`flex h-8 w-8 flex-none items-center justify-center rounded-[11px] border transition-colors ${
                              inCart
                                ? "border-green-600 bg-green-600 text-white"
                                : "border-slate-900/[.07] bg-slate-100 text-slate-600 group-hover:border-blue-700 group-hover:bg-blue-700 group-hover:text-white dark:border-hairline dark:bg-surface-3 dark:text-ink-muted"
                            }`}
                          >
                            {inCart ? <Check size={14} strokeWidth={2.4} /> : <Plus size={14} strokeWidth={2} />}
                          </motion.span>
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
