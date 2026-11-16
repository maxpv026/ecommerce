"use client";

import { cylinderGasPrice } from "@/lib/pricing";
import { isPurchasable } from "@/lib/waitlist";
import { showSizeInUrl } from "@/lib/productFamily";
import MobileTopBar from "./MobileTopBar";
import StockNotifyBlock from "./StockNotifyBlock";
import FavoriteButton from "./FavoriteButton";
import AdminRestockTest from "./AdminRestockTest";
import { useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useLocale, useTranslations } from "next-intl";
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
  ArrowLeft,
} from "lucide-react";
import Header from "./Header";
import { usePackLabel } from "@/lib/hooks/usePackLabel";
import { keepUnits } from "@/lib/keepUnits";
import AuthModal from "./AuthModal";
import { Link } from "@/i18n/navigation";
import { useCartStore } from "@/lib/store/cart";
import { checkCompatibility, type CompatibilityResult } from "@/lib/actions/compatibility";
import { modelPathForProduct } from "@/lib/productMedia";
import ProductThumbnail from "./ProductThumbnail";
import { productDocument, type ProductDocumentType } from "@/lib/productDocuments";
import type { StoreProduct } from "@/lib/data";

// WebGL has no business in the server bundle, and the viewer pulls in
// three + drei — keep it out of the page's initial JS.
const ProductModelViewer = dynamic(() => import("./3d/ProductModelViewer"), { ssr: false });

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
  out: { key: "stockOut", dot: "#f87171", cls: "border-[rgba(248,113,113,.32)] bg-[rgba(239,68,68,.12)] text-[#b91c1c] dark:text-[#fca5a5] shadow-[0_0_18px_-6px_#f87171]" },
} as const;

const RELATED_OUTLINE = (
  <span className="absolute inset-0 grid place-items-center">
    <span className="block h-[84px] w-[42px] rounded-t-[22px] rounded-b-md border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
  </span>
);

const RELATED_TINTS =["#22d3ee", "#34d399", "#60a5fa", "#a78bfa", "#34d399", "#22d3ee"];

// Which of these a product actually has is decided by lib/productDocuments;
// a row with no file behind it renders as "on request", not as a dead link.
const DOCS = [
  { id: "sds", nameKey: "docSds", icon: FileText },
  { id: "adr", nameKey: "docAdr", icon: Truck },
  { id: "coa", nameKey: "docCoa", icon: FlaskConical },
  { id: "ahri", nameKey: "docAhri", icon: ShieldCheck },
] as const satisfies readonly { id: ProductDocumentType; nameKey: string; icon: unknown }[];

interface ProductDetailProps {
  product: StoreProduct;
  related: StoreProduct[];
  /** Every size of this product (its family), smallest first; includes `product`. */
  variants: StoreProduct[];
}

export default function ProductDetail({ product: initialProduct, related, variants }: ProductDetailProps) {
  const locale = useLocale();
  const t = useTranslations("ProductDetail");
  const tProducts = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const tHome = useTranslations("HomeDesktop");
  // Localized size ("13,61 кг · балон"); weightLabel is the catalog's English "13.61 kg cylinder".
  const pack = usePackLabel();
  const packOf = (p: Pick<StoreProduct, "weightKg" | "containerType" | "pricedPerKg">) => pack(p.weightKg, p.containerType, p.pricedPerKg);
  const format = useFormatter();
  const addItem = useCartStore((s) => s.addItem);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<Extract<CompatibilityResult, { ok: true }> | null>(null);
  const [aiPending, startAi] = useTransition();
  const [relAdded, setRelAdded] = useState<string[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  // The size selector. Each size is its own row with its own SKU, price,
  // weight, deposit and stock, so `product` below is simply the chosen row:
  // the price, net weight, spec sheet, stock badge, waitlist and cart line
  // all follow the selection with no request and no reload.
  const [selectedId, setSelectedId] = useState(initialProduct.id);
  const product = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? initialProduct,
    [variants, selectedId, initialProduct]
  );
  const selectSize = (id: string) => {
    setSelectedId(id);
    setAdded(false);
    showSizeInUrl(id);
  };

  const brand = brandFor(product);

  // ─── Single source of truth for availability ───
  // Every availability-dependent branch in this render — the badge, the
  // spec sheet's Availability row and the action area — reads this one
  // boolean, so they cannot contradict each other. `stockLevel` already
  // honours it (lib/data.ts), but deriving the badge here too means a
  // regression upstream can never put "In Stock" next to a waitlist form.
  const isAvailable = isPurchasable(product);
  // While available, keep the in / low / order nuance; anything not
  // purchasable is "out", whatever the facet column says.
  const stockKey = !isAvailable ? "out" : product.stockLevel === "out" ? "in" : product.stockLevel;
  const stock = STOCK_BADGE[stockKey];
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  // One price per size: the container's gas figure, pricePerKg × weightKg.
  // There is no quantity discount — the volume tiers that used to sit here
  // were never applied at checkout (prepareOrder prices from the row), so
  // the cart showed a discount the order then didn't give.
  const unitPerKg = product.pricePerKg;
  const unitPrice = cylinderGasPrice(unitPerKg, product.weightKg);

  // Which .glb this product gets, resolved from its refrigerant mark. Null
  // for equipment/services, which fall back to the design's stylized
  // parallax cylinder. Resolved here rather than inside the viewer because
  // the stage's mouse-tilt has to know whether OrbitControls owns the
  // pointer — see onStageMove.
  const modelPath = useMemo(() => modelPathForProduct(product), [product]);
  const has3dModel = modelPath !== null;

  const categoryKey =
    { cylinders: "cylTitle", blends: "blendTitle", equipment: "eqTitle", recovery: "recTitle" }[product.category] ?? "cylTitle";

  // Eight labels — cheap to rebuild every render, so no memo (and no dependency list to keep in sync).
  const specs = [
      { label: t("specRefrigerant"), value: product.type },
      { label: tProducts("specPurity"), value: product.purity !== null ? `${product.purity}%` : tProducts("na") },
      { label: tProducts("specGwp"), value: product.gwp !== null ? String(product.gwp) : tProducts("na") },
      { label: t("specSafety"), value: product.gwpClass && product.gwpClass !== "n/a" ? product.gwpClass : tProducts("na") },
      { label: t("specNetWeight"), value: packOf(product) },
      { label: t("specSku"), value: product.sku },
      { label: t("specCategory"), value: tCat(categoryKey) },
      { label: t("specAvailability"), value: t(stock.key) },
  ];

  // Handling & transport follows THIS product's safety class (it used to
  // say "A2L" on every page, A1 gases included). Refrigerants: the ASHRAE 34
  // class and its ADR class (A1 → 2.2 non-flammable gas; A2L, A3 → 2.1
  // flammable gas). No class: equipment, or an empty recovery cylinder.
  const handling = (() => {
    const cls = product.gwpClass;
    if (cls === "A1") return { key: "A1", body: "noteBody_A1", chip: "A1 · ADR 2.2" } as const;
    if (cls === "A2L") return { key: "A2L", body: "noteBody_A2L", chip: "A2L · ADR 2.1" } as const;
    if (cls === "A3") return { key: "A3", body: "noteBody_A3", chip: "A3 · ADR 2.1" } as const;
    if (product.category === "recovery") return { key: "recovery", body: "noteBody_recovery", chip: null } as const;
    return { key: "equipment", body: "noteBody_equipment", chip: null } as const;
  })();

  const onStageMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (has3dModel) return; // OrbitControls owns interaction there
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
  };

  const addToCart = () => {
    // The control is replaced by the waitlist when unavailable; this guard
    // covers a stale render between a restock push and the next fetch.
    if (!isAvailable) return;
    addItem(
      {
        sku: product.sku,
        name: product.name,
        variant: product.weightLabel,
        pricePerKg: unitPerKg,
        weightKg: product.weightKg,
        deposit: product.cylinderDeposit,
      },
      qty
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const runAi = () => {
    const system = aiQuery.trim();
    if (!system || aiPending) return;
    setAiResult(null);
    startAi(async () => {
      const result = await checkCompatibility({ sku: product.sku, system, locale });
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
    <div className="flex-1 bg-canvas">
      {/* One product page at every width (the separate phone PDP is gone):
          the desktop Header above md, the phone app bar below it. Phones get a
          shorter stage so price, quantity and "add to cart" sit near the fold. */}
      <div className="hidden md:contents">
        <Header onSignInClick={() => setIsAuthModalOpen(true)} />
      </div>
      <MobileTopBar />
      <div>

      <div className="relative overflow-x-clip">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1000px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)]">
          <div className="absolute -top-[280px] left-[-10%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),rgba(37,99,235,0)_66%)] opacity-[.28] blur-[120px] [animation:hc-float_28s_ease-in-out_infinite]" />
          <div className="absolute -top-[180px] right-[-6%] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),rgba(124,58,237,0)_66%)] opacity-[.26] blur-[120px] [animation:hc-float_36s_ease-in-out_infinite_reverse]" />
        </div>

        {/* page mount: elegant fade + glide up */}
        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto max-w-[1320px] px-4 pb-16 pt-4 sm:px-8 sm:pb-[120px] sm:pt-8"
        >
          {/* Phones: a back pill instead of the breadcrumb trail. */}
          <Link href="/products" className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-900/[.12] bg-white/70 px-3.5 text-[12.5px] font-semibold text-slate-700 sm:hidden dark:border-white/[.14] dark:bg-white/[.04] dark:text-slate-200" data-pdp-back>
            <ArrowLeft size={14} strokeWidth={2.2} />
            {t("backToCatalog")}
          </Link>
          {/* breadcrumb */}
          <div className="mb-7 flex items-center gap-[9px] text-xs text-slate-400 max-sm:hidden dark:text-ink-muted">
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
            <span className="font-semibold text-slate-900 dark:text-slate-50">{keepUnits(product.name)}</span>
          </div>

          {/* ── hero: 3D stage + purchase card ── */}
          <div className="grid items-stretch gap-5 lg:grid-cols-[1.08fr_.92fr]">
            <div
              onMouseMove={onStageMove}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
              data-stage
              className="relative flex min-h-[420px] cursor-grab items-center justify-center overflow-hidden rounded-[30px] border border-transparent max-sm:min-h-[260px] max-sm:rounded-[24px] bg-[#0b1020] shadow-[0_46px_96px_-50px_rgba(2,4,10,.8)] [perspective:1200px] lg:min-h-[620px] dark:border-white/[.08] dark:bg-[#0b0d12]"
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

              {/* The real cylinder, orbiting under studio light. Products
                  with no model of their own (equipment, services) — and any
                  model that fails to load — get the stylized poster instead,
                  which is what `poster` carries. */}
              <ProductModelViewer
                name={product.name}
                sku={product.sku}
                modelPath={modelPath}
                badgeLabel={t("stageTag")}
                className="absolute inset-0"
                poster={
                  <div
                    className="absolute inset-0 grid place-items-center [transform-style:preserve-3d]"
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
                }
              />

              {/* The "3D · drag to orbit" badge that used to sit on the left
                  of this row now belongs to the viewer, which only shows it
                  once a model is actually orbiting. */}
              <div className="pointer-events-none absolute bottom-[18px] left-5 right-5 flex items-center justify-end gap-3">
                {/* Equipment has no class: say nothing rather than a raw "N/A". */}
                {product.gwpClass && product.gwpClass !== "n/a" && (
                  <span className="text-[10.5px] uppercase tracking-[.06em] text-white/50">
                    {product.gwpClass}{product.gwp !== null ? ` · GWP ${format.number(product.gwp)}` : ""}
                  </span>
                )}
              </div>
            </div>

            {/* purchase card */}
            <div className="flex min-w-0">
              <div className="relative w-full overflow-hidden rounded-[30px] border border-slate-900/[.07] bg-white/70 p-[30px] max-sm:rounded-[24px] max-sm:p-5 shadow-[0_26px_60px_-46px_rgba(2,4,10,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/5 dark:bg-surface/60">
                <div
                  className="pointer-events-none absolute -top-[42%] right-[-22%] h-[380px] w-[380px] rounded-full opacity-[.16] blur-[80px]"
                  style={{ background: `radial-gradient(circle,${brand.glow},transparent 68%)` }}
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3.5">
                    <div className="min-w-0">
                      <div className="mb-[9px] text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">{product.sku}</div>
                      <h1 className="m-0 text-balance text-[31px] font-semibold leading-[1.08] tracking-[-.045em] max-sm:text-[26px]">{keepUnits(product.name)}</h1>
                    </div>
                    {/* Status and the heart as one action cluster: the heart is
                        always here, whether the buy row or the waitlist shows. */}
                    <div className="flex flex-none items-center gap-2" data-pdp-actions>
                      <span className={`inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border py-1.5 pl-[9px] pr-3 text-[11px] font-semibold ${stock.cls}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: stock.dot, boxShadow: `0 0 8px 1px ${stock.dot}` }} />
                        {t(stock.key)}
                      </span>
                      {/* Saves the selected size: switching size switches which row the heart reflects. */}
                      <FavoriteButton productId={product.id} productName={`${product.name} · ${packOf(product)}`} size="md" />
                    </div>
                  </div>

                  <p className="mt-3.5 text-[13.5px] leading-[1.62] text-slate-600 max-sm:line-clamp-3 dark:text-ink-muted">
                    {t(`blurb_${product.category}`)}
                  </p>

                  {/* Pricing: the cylinder is the headline (B2B buyers order whole
                      cylinders); the €/kg rate, the pack and the refundable
                      deposit that make it up sit in one structured panel. */}
                  <div className="mt-6 rounded-[20px] border border-slate-900/[.07] bg-slate-50/80 p-[18px] max-sm:mt-4 max-sm:p-4 dark:border-hairline dark:bg-surface-3/60" data-pdp-price-panel>
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span
                        data-cylinder-price
                        className={`whitespace-nowrap font-semibold leading-none tracking-[-.05em] tabular-nums ${product.pricePerKg > 0 ? "text-[38px] max-sm:text-[32px]" : "text-[24px]"}`}
                      >
                        {product.pricePerKg > 0 ? eur(unitPrice) : tProducts("priceOnRequest")}
                      </span>
                      {product.pricePerKg > 0 && (
                        <span className="whitespace-nowrap text-[12.5px] font-medium text-slate-500 dark:text-ink-muted">{tProducts("exVatShort")}</span>
                      )}
                    </div>
                    <dl className="m-0 mt-4 grid gap-2 border-t border-slate-900/[.07] pt-3.5 text-[13px] max-sm:mt-3 max-sm:gap-1.5 max-sm:pt-3 dark:border-hairline">
                      {product.pricedPerKg && product.pricePerKg > 0 && (
                        <div className="flex items-baseline justify-between gap-4">
                          <dt className="text-slate-500 dark:text-ink-muted">{t("pricePerKgLabel")}</dt>
                          <dd className="m-0 whitespace-nowrap font-semibold tabular-nums" data-per-kg>
                            {tProducts("cardPerKg", { amount: eur(unitPerKg) })}
                          </dd>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-slate-500 dark:text-ink-muted">{t("packLabel")}</dt>
                        <dd className="m-0 whitespace-nowrap font-semibold" data-pack-label>
                          {packOf(product)}
                        </dd>
                      </div>
                      {product.cylinderDeposit > 0 && (
                        <div className="flex items-baseline justify-between gap-4" data-pdp-deposit>
                          <dt className="min-w-0 text-slate-500 dark:text-ink-muted">
                            {t("depositLabel")}
                            <span className="block text-[11.5px] text-slate-500 dark:text-ink-muted">{t("depositNote")}</span>
                          </dt>
                          <dd className="m-0 whitespace-nowrap font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{eur(product.cylinderDeposit)}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-slate-500 max-sm:mt-2 dark:text-ink-muted" data-pdp-vat-note>
                      {t("priceVatNote")}
                    </p>
                  </div>

                  {variants.length > 1 && (
                    <div className="mt-[22px] max-sm:mt-4" data-size-selector>
                      <div className="mb-2.5 text-[10.5px] font-semibold tracking-[.08em] text-slate-500 dark:text-ink-muted">{t("sizeHeading")}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {variants.map((v) => {
                          const on = v.id === product.id;
                          const sellable = isPurchasable(v) && v.pricePerKg > 0;
                          return (
                            <motion.button
                              key={v.id}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => selectSize(v.id)}
                              aria-pressed={on}
                              data-size={v.sku}
                              // Selected = a blue ring on the same surface, so the price and
                              // the availability line keep their own colours; unavailable
                              // sizes say so in words instead of fading to 50 % (unreadable).
                              className={`flex min-w-0 flex-col gap-1 rounded-[15px] border px-3.5 py-3 text-left transition-colors max-sm:gap-0.5 max-sm:px-3 max-sm:py-2.5 ${
                                on
                                  ? "border-blue-700 bg-blue-700/[.06] ring-1 ring-blue-700 dark:border-blue-400 dark:bg-blue-500/[.12] dark:ring-blue-400"
                                  : "border-slate-900/[.08] bg-white/70 hover:border-slate-900/[.2] dark:border-hairline dark:bg-surface-3 dark:hover:border-white/[.2]"
                              }`}
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 text-[13px] font-semibold leading-[1.3] tracking-[-.015em] text-slate-900 dark:text-slate-50">{packOf(v)}</span>
                                {on && <Check size={14} strokeWidth={2.6} className="flex-none self-center text-blue-700 dark:text-blue-400" aria-hidden />}
                              </span>
                              <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                                {v.pricePerKg > 0 ? eur(v.cylinderPrice) : tProducts("priceOnRequest")}
                              </span>
                              <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-ink-muted">
                                <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: sellable ? STOCK_BADGE.in.dot : STOCK_BADGE.out.dot }} />
                                <span className="truncate">{sellable ? t("stockIn") : t("stockOut")}</span>
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isAvailable ? (
                    <div className="mt-[22px] flex items-center gap-3 max-sm:mt-4">
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
                            : "bg-blue-700 shadow-[0_18px_38px_-18px_var(--glow-700)] hover:bg-blue-800 hover:shadow-[0_26px_52px_-18px_var(--glow-700),0_0_34px_-8px_var(--glow-700)]"
                        }`}
                      >
                        {added ? t("addedToCart") : tHome("addToCart")}
                        {added ? <Check size={17} strokeWidth={2.4} /> : <ShoppingCart size={17} strokeWidth={2} />}
                      </motion.button>
                    </div>
                  ) : (
                    /* Unavailable: the quantity stepper and buy button give way to the waitlist */
                    <StockNotifyBlock productId={product.id} className="mt-[22px]" />
                  )}

                  {/* Outside the in-stock ternary on purpose: the products
                      that misbehave are the ones already in stock, so an
                      admin must be able to reach this on any product.
                      Renders for an ADMIN session only; the action re-checks. */}
                  <AdminRestockTest productId={product.id} />

                  {/* AI compatibility checker */}
                  <div
                    data-ai-checker
                    className={`mt-[22px] overflow-hidden rounded-[20px] border bg-slate-50/80 transition-colors duration-300 dark:bg-surface-3/60 ${
                      aiOpen ? "border-[rgba(96,165,250,.4)]" : "border-slate-900/[.07] dark:border-hairline"
                    }`}
                  >
                    <button type="button" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen} className="flex w-full items-center gap-3 p-[15px] text-left">
                      <motion.span
                        animate={aiPending ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                        transition={aiPending ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,var(--glow-600),var(--glow-700))] shadow-[0_12px_24px_-12px_rgba(37,99,235,.7)]"
                      >
                        <Sparkles size={18} strokeWidth={2} className="text-white" />
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold tracking-[-.02em]">{t("aiTitle")}</span>
                        <span className="mt-[3px] block text-[11.5px] leading-[1.4] text-slate-500 dark:text-ink-muted">{t("aiSub")}</span>
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
                              className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-blue-700 shadow-[0_12px_24px_-12px_var(--glow-700)] transition-colors hover:bg-blue-800"
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

                  <ul className="m-0 mt-5 grid list-none grid-cols-3 gap-2 border-t border-slate-900/[.07] p-0 pt-[18px] dark:border-hairline" data-pdp-trust>
                    {[
                      { label: t("assurance1"), icon: FlaskConical },
                      { label: t("assurance2"), icon: Truck },
                      { label: t("assurance3"), icon: Lock },
                    ].map(({ label, icon: Icon }) => (
                      <li key={label} className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-1 text-center text-[11.5px] font-medium leading-[1.3] text-slate-600 dark:text-ink-muted">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-700/[.07] dark:bg-blue-400/[.12]">
                          <Icon size={15} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* ── bento: specs 5 / docs 4 / handling 3 ── */}
          {/* Equal heights: the row stretches and each card is a column whose
              last element is pushed to the bottom, so no card leaves a hole. */}
          <div className="mt-[22px] grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12" data-pdp-bento>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
              className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white/70 p-[26px] backdrop-blur-xl backdrop-saturate-150 max-sm:rounded-[22px] max-sm:p-5 lg:col-span-5 dark:border-white/5 dark:bg-surface/60"
              data-pdp-section="specs"
            >
              <h2 className="m-0 mb-5 text-[12.5px] font-semibold tracking-[.09em] text-slate-500 dark:text-ink-muted">{t("specsTitle")}</h2>
              <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-[11px]">
                {specs.map((spec) => (
                  <div key={spec.label} className="flex min-w-0 flex-col justify-center rounded-2xl border border-slate-900/[.07] bg-slate-100 px-4 py-[13px] dark:border-hairline dark:bg-surface-3">
                    <div className="mb-[6px] text-[10px] font-medium tracking-[.07em] text-slate-500 dark:text-ink-muted">{spec.label}</div>
                    {/* Wraps instead of truncating: "Балони з холодоагентом" is longer in most locales. */}
                    <div className="text-[14.5px] font-semibold leading-[1.3] tracking-[-.025em] [overflow-wrap:anywhere]">{spec.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
              className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-900/[.07] bg-white/70 p-[26px] backdrop-blur-xl backdrop-saturate-150 max-sm:rounded-[22px] max-sm:p-5 lg:col-span-4 dark:border-white/5 dark:bg-surface/60"
              data-pdp-section="docs"
            >
              <h2 className="m-0 mb-5 text-[12.5px] font-semibold tracking-[.09em] text-slate-500 dark:text-ink-muted">{t("docsTitle")}</h2>
              <div className="flex flex-1 flex-col justify-between gap-2.5">
                {DOCS.map(({ id, nameKey, icon: Icon }) => {
                  const file = productDocument(id, product);
                  if (!file) {
                    // Nothing on file for this product: say so instead of
                    // offering a download that would 404.
                    return (
                      <div
                        key={id}
                        className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-slate-900/[.1] p-[13px] dark:border-hairline"
                        data-doc={id}
                        data-doc-available="false"
                      >
                        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3">
                          <Icon size={17} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold tracking-[-.02em] text-slate-500 dark:text-ink-muted">{t(nameKey)}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-ink-muted">{t("docOnRequest")}</span>
                        </span>
                      </div>
                    );
                  }
                  return (
                    <motion.div key={id} whileTap={{ scale: 0.97 }}>
                      {/* A plain <a>, not the i18n Link: Link would prefix the
                          locale and send /en/api/... to the page router. The
                          route redirects to the static file; `download` names
                          the saved copy. */}
                      <a
                        href={`/api/documents/${id}/${encodeURIComponent(product.sku)}`}
                        download={file.filename}
                        data-doc={id}
                        data-doc-available="true"
                        className="group flex w-full items-center gap-3 rounded-[18px] border border-slate-900/[.07] p-[13px] text-left transition-[background-color,border-color,box-shadow] duration-300 hover:border-[rgba(96,165,250,.34)] hover:bg-slate-100 hover:shadow-[0_0_22px_-8px_rgba(59,130,246,.6)] dark:border-hairline dark:hover:bg-surface-3"
                      >
                        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] border border-slate-900/[.07] bg-slate-100 transition-colors group-hover:border-[rgba(37,99,235,.3)] group-hover:bg-blue-700/[.08] dark:border-hairline dark:bg-surface-3 dark:group-hover:bg-blue-600/[.18]">
                          <Icon size={17} strokeWidth={2} className="text-slate-600 transition-colors group-hover:text-blue-700 dark:text-ink-muted dark:group-hover:text-blue-400" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold tracking-[-.02em]">{t(nameKey)}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-ink-muted">PDF · {file.revision}</span>
                        </span>
                        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] transition-[background-color,box-shadow] duration-300 group-hover:bg-blue-700 group-hover:shadow-[0_12px_24px_-12px_var(--glow-700)]">
                          <Download size={15} strokeWidth={2} className="text-slate-400 transition-colors group-hover:text-white dark:text-ink-muted" />
                        </span>
                      </a>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.19 }}
              className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-[#0b1020] p-[26px] shadow-[0_40px_80px_-46px_rgba(11,16,32,.9)] max-sm:rounded-[22px] max-sm:p-5 lg:col-span-3"
              data-pdp-section="handling"
              data-handling={handling.key}
            >
              <div
                className="pointer-events-none absolute -bottom-[40%] left-[-24%] h-[360px] w-[360px] rounded-full opacity-60 blur-[80px]"
                style={{ background: `radial-gradient(circle,${brand.glow},transparent 68%)` }}
              />
              <div className="relative flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[15px] border border-white/[.18] bg-white/10">
                    <ShieldCheck size={20} strokeWidth={2} className="text-white" />
                  </span>
                  {/* The class this text is about, so the card can't silently describe another gas. */}
                  {handling.chip && (
                    <span className="whitespace-nowrap rounded-full border border-white/[.2] bg-white/[.08] px-2.5 py-1 text-[11px] font-semibold tracking-[.02em] text-white" data-handling-chip>
                      {handling.chip}
                    </span>
                  )}
                </div>
                <h2 className="m-0 mt-[18px] text-[19px] font-semibold tracking-[-.035em] text-white">{t("noteTitle")}</h2>
                <p className="m-0 mt-3 text-[13px] leading-[1.66] text-white/[.78]" data-handling-body>{t(handling.body)}</p>
                <Link href="/compliance/sds" className="mt-auto inline-flex pt-[18px] text-[12.5px] font-semibold text-white hover:text-blue-300">
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
                    className="group flex flex-none self-stretch"
                    data-related-card
                  >
                    <Link
                      href={`/products/${rel.id}`}
                      className="relative flex w-[236px] flex-none flex-col overflow-hidden rounded-[22px] border border-slate-900/[.07] bg-white/60 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:border-white/5 dark:bg-surface/60"
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
                        {/* The same still the catalog grid shows; the outline
                            is only for products with no render of their own. */}
                        <ProductThumbnail
                          sku={rel.sku}
                          name={rel.name}
                          fallback={RELATED_OUTLINE}
                          sizes="212px"
                        />
                      </span>
                      <span className="relative flex flex-1 flex-col p-4">
                        <span className="line-clamp-2 block min-h-[2.6em] text-[13.5px] font-semibold leading-[1.3] tracking-[-.025em]">{keepUnits(rel.name)}</span>
                        <span className="mt-[3px] flex flex-wrap gap-x-1.5 text-[11px] text-slate-500 dark:text-ink-muted">
                          <span className="whitespace-nowrap">{packOf(rel)}</span>
                          {rel.gwp !== null && <span className="whitespace-nowrap">· GWP {format.number(rel.gwp)}</span>}
                        </span>
                        <span className="mt-auto flex items-end justify-between gap-3 pt-[13px]">
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums tracking-[-.03em]" data-rel-cylinder>
                              {eur(rel.cylinderPrice)}
                            </span>
                            {rel.pricedPerKg && (
                              <span className="block whitespace-nowrap text-[10.5px] text-slate-500 dark:text-ink-muted">
                                {tProducts("perKgAmount", { amount: eur(rel.pricePerKg) })}
                              </span>
                            )}
                          </span>
                          <motion.span
                            whileTap={{ scale: 0.9 }}
                            role="button"
                            aria-label={tHome("addToCart")}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isPurchasable(rel)) return;
                              addItem({
                                sku: rel.sku,
                                name: rel.name,
                                variant: rel.weightLabel,
                                pricePerKg: rel.pricePerKg,
                                weightKg: rel.weightKg,
                                deposit: rel.cylinderDeposit,
                              });
                              setRelAdded((a) => [...a, rel.sku]);
                            }}
                            className={`flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border transition-colors ${
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

      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
