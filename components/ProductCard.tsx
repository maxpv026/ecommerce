"use client";

import type { Ref } from "react";
import { motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { BellRing, Check, Plus, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatKg } from "@/lib/pricing";
import { isPurchasable } from "@/lib/waitlist";
import ProductThumbnail from "./ProductThumbnail";
import FavoriteButton from "./FavoriteButton";
import type { StoreProduct } from "@/lib/data";

/**
 * The one product card, used everywhere a product is listed: the desktop
 * catalog grid, the mobile catalog (grid and list), the home page carousel
 * and the mobile home rail.
 *
 * Quiet by default, in the Apple/Stripe sense: a white card lifted by the
 * --elevation-card shadow instead of a border, a soft media well with room
 * around the cylinder, specs as one hairline-divided row of type, and an
 * outline action that only fills with the brand colour on hover. Price is
 * the loudest thing below the image, because it's what a buyer compares.
 *
 * Variants change the proportions, never the language:
 *   default  desktop grid and carousel (≥ 280px wide)
 *   compact  narrow columns — mobile two-up grid, 186px home rail
 *   row      mobile list: image left, details right
 */

/** Stock state → dot colour and label. The label text stays neutral; the dot carries the state. */
export const STOCK_TONES = {
  in: { labelKey: "stockIn", dot: "#10b981", pulse: false },
  low: { labelKey: "stockLow", dot: "#f59e0b", pulse: true },
  order: { labelKey: "stockOrder", dot: "#0ea5e9", pulse: true },
  out: { labelKey: "stockOut", dot: "#ef4444", pulse: false },
} as const;

export const CATEGORY_LABEL_KEY: Record<string, string> = {
  cylinders: "cylTitle",
  blends: "blendTitle",
  equipment: "eqTitle",
  recovery: "recTitle",
};

export type ProductCardVariant = "default" | "compact" | "row";

const outline = (size: "lg" | "sm") => (
  <div className="absolute inset-0 grid place-items-center">
    <div
      className={`relative rounded-t-[30px] rounded-b-lg border border-dashed border-slate-900/[.2] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.28] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))] ${
        size === "lg" ? "h-[108px] w-[58px]" : "h-[64px] w-[34px] rounded-t-[18px]"
      }`}
    />
  </div>
);
const OUTLINE_LG = outline("lg");
const OUTLINE_SM = outline("sm");

interface ProductCardProps {
  product: StoreProduct;
  variant?: ProductCardVariant;
  /** Shows the confirmed "added" state on the action. */
  inCart: boolean;
  /** Recommended by an AI query on the page. */
  isAiMatch?: boolean;
  /** Replaces the stock label in the image badge (the dot still shows stock). */
  badgeLabel?: string;
  onAddToCart: (product: StoreProduct) => void;
  /** Back-in-stock sign-up for an unavailable product. */
  onNotify: (product: StoreProduct) => void;
  /** Passed to the thumbnail's `sizes`; each layout knows its own column width. */
  imageSizes?: string;
  /** Enter animation; off where the parent already animates its children. */
  animateIn?: boolean;
  className?: string;
  /** Forwarded to the root (React 19 passes ref as a prop) — AnimatePresence's popLayout measures it. */
  ref?: Ref<HTMLDivElement>;
}

export default function ProductCard({
  product,
  variant = "default",
  inCart,
  isAiMatch = false,
  badgeLabel,
  onAddToCart,
  onNotify,
  imageSizes,
  animateIn = true,
  className = "",
  ref,
}: ProductCardProps) {
  const t = useTranslations("Products");
  const tCat = useTranslations("Categories");
  const tHome = useTranslations("HomeDesktop");
  const tm = useTranslations("HomeMobile");
  const format = useFormatter();
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const tone = STOCK_TONES[product.stockLevel];
  const purchasable = isPurchasable(product);
  const priced = product.pricePerKg > 0;
  const compact = variant === "compact";
  const row = variant === "row";
  // Icon-only action where a labelled pill wouldn't fit beside the price.
  const iconAction = compact || row;

  const specs = [
    { label: t("specPurity"), value: product.purity !== null ? `${product.purity}%` : t("na") },
    { label: t("specVolume"), value: product.pricedPerKg ? formatKg(product.weightKg) : product.weightLabel },
    { label: t("specGwp"), value: product.gwp !== null ? String(product.gwp) : t("na") },
  ];

  // The heart sits over the image but outside its link: a button inside an
  // <a> is invalid HTML and a click on it would also navigate.
  const media = (
    <div
      className={`relative flex-none ${
        row ? "m-2.5 mr-0 w-[112px]" : compact ? "m-2.5 mb-0 h-[124px]" : "m-4 mb-0 h-[188px]"
      }`}
    >
      <Link
        href={`/products/${product.id}`}
        className={`absolute inset-0 flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8fafc,#f1f5f9)] dark:bg-[linear-gradient(180deg,#1b1c20,#141518)] ${
          row || compact ? "rounded-[14px]" : "rounded-[16px]"
        }`}
      >
        {/* A still rendered from the product's own model, inset so the
            cylinder has air around it; the interactive one lives on the PDP. */}
        <div className={`absolute transition-transform duration-500 ease-out group-hover:scale-[1.04] ${compact || row ? "inset-2.5" : "inset-4"}`}>
          <ProductThumbnail
            sku={product.sku}
            name={product.name}
            fallback={compact || row ? OUTLINE_SM : OUTLINE_LG}
            sizes={imageSizes ?? (compact ? "45vw" : row ? "120px" : "(max-width: 1024px) 45vw, 300px")}
          />
        </div>

        <span
          className={`absolute inline-flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full bg-white/90 font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,.06)] ring-1 ring-slate-900/[.06] backdrop-blur dark:bg-black/40 dark:text-slate-200 dark:ring-white/10 ${
            compact || row ? "left-2 top-2 py-[3px] pl-1.5 pr-2 text-[9.5px]" : "left-3 top-3 py-1 pl-2 pr-2.5 text-[11px]"
          }`}
        >
          <motion.span
            animate={tone.pulse ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
            transition={tone.pulse ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
            className="h-1.5 w-1.5 flex-none rounded-full"
            style={{ background: tone.dot }}
          />
          <span className="truncate">{badgeLabel ?? t(tone.labelKey)}</span>
        </span>
        {isAiMatch && (
          <span
            className={`absolute inline-flex items-center rounded-full bg-violet-600/10 font-medium text-violet-700 ring-1 ring-violet-600/20 dark:text-violet-300 ${
              compact || row ? "bottom-2 left-2 px-2 py-[3px] text-[9.5px]" : "bottom-3 left-3 px-2.5 py-1 text-[11px]"
            }`}
          >
            {compact || row ? "AI" : t("aiMatchTag")}
          </span>
        )}
      </Link>
      <FavoriteButton
        productId={product.id}
        productName={product.name}
        size={compact || row ? "sm" : "md"}
        className={`absolute ${compact || row ? "right-2 top-2" : "right-3 top-3"}`}
      />
    </div>
  );

  const action = purchasable ? (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => onAddToCart(product)}
      aria-label={iconAction ? tm("addToCartAria", { name: product.name }) : undefined}
      data-add-to-cart
      data-in-cart={inCart ? "true" : undefined}
      className={`inline-flex flex-none items-center justify-center rounded-full font-medium tracking-[-.01em] transition-[background-color,color,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${
        iconAction ? "h-10 w-10" : "h-10 gap-2 px-4 text-[13px]"
      } ${
        inCart
          ? "border border-emerald-600/25 bg-emerald-600/[.08] text-emerald-700 dark:text-emerald-400"
          : "border border-primary/25 text-primary hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_8px_20px_-10px_var(--glow-700)] active:bg-primary active:text-primary-foreground dark:border-blue-400/30 dark:text-blue-300 dark:hover:border-primary dark:hover:text-primary-foreground"
      }`}
    >
      {inCart ? <Check size={iconAction ? 17 : 15} strokeWidth={2.2} /> : iconAction ? <Plus size={17} strokeWidth={2.2} /> : <ShoppingCart size={15} strokeWidth={2} />}
      {!iconAction && (inCart ? tHome("added") : tHome("addToCart"))}
    </motion.button>
  ) : (
    <button
      type="button"
      onClick={() => onNotify(product)}
      title={t("notifyModalTitle")}
      aria-label={iconAction ? `${t("unavailableCta")} — ${t("notifyCta")}` : undefined}
      data-unavailable-cta
      className={`inline-flex flex-none items-center justify-center rounded-full border border-border font-medium text-muted-foreground transition-colors hover:border-input hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${
        iconAction ? "h-10 w-10" : "h-10 gap-1.5 px-4 text-[13px]"
      }`}
    >
      <BellRing size={iconAction ? 16 : 14} strokeWidth={2} />
      {!iconAction && t("unavailableCta")}
    </button>
  );

  // Compact cards show one spec — at ~160px three columns turn to mush.
  const shownSpecs = compact ? specs.slice(2) : specs;

  const body = (
    <div className={`flex min-w-0 flex-1 flex-col ${row ? "px-3.5 py-3" : compact ? "px-3.5 pb-3.5 pt-3" : "px-6 pb-6 pt-5"}`}>
      {/* Grows to absorb spare height, so the price row sits on the card's
          bottom edge in every card of a row. */}
      <div className="flex-1">
        <Link
          href={`/products/${product.id}`}
          className={`block truncate font-semibold tracking-[-.025em] text-foreground transition-colors hover:text-primary ${compact ? "text-[14px]" : row ? "text-[15px]" : "text-[16px]"}`}
        >
          {product.name}
        </Link>
        <div className={`mt-1 truncate text-muted-foreground ${compact || row ? "text-[12px]" : "text-sm"}`}>
          <span className={`font-mono ${compact || row ? "text-[11px]" : "text-[12.5px]"}`}>{product.sku}</span>
          {!compact && (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              {tCat(CATEGORY_LABEL_KEY[product.category] ?? "cylTitle")}
            </>
          )}
        </div>

        <dl className={`flex divide-x divide-border ${compact || row ? "mt-3" : "mt-5"}`} data-card-specs>
          {shownSpecs.map((spec) => (
            <div key={spec.label} className={`min-w-0 flex-1 first:pl-0 last:pr-0 ${compact || row ? "px-2" : "px-3"}`}>
              <dt className={`font-medium tracking-[.08em] text-muted-foreground ${compact || row ? "text-[9.5px]" : "text-[10.5px]"}`}>{spec.label}</dt>
              <dd
                className={`m-0 mt-0.5 truncate font-medium tracking-[-.01em] text-foreground ${compact || row ? "text-[12.5px]" : "text-[13.5px]"}`}
                title={spec.value}
              >
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={`flex items-end justify-between gap-2.5 border-t border-border ${compact || row ? "mt-3 pt-3" : "mt-6 gap-3 pt-5"}`}>
        {/* Fixed height, single-line price: "Price on request" never wraps
            and makes this card taller than its neighbours. */}
        <div className={`flex min-w-0 flex-col justify-end ${compact || row ? "h-10" : "h-12"}`}>
          <span
            data-card-price
            className={`block truncate font-semibold tracking-[-.035em] text-foreground ${
              priced ? (compact || row ? "text-[17px] leading-6" : "text-[22px] leading-7") : compact || row ? "text-[12.5px] leading-5" : "text-[15px] leading-6"
            }`}
          >
            {priced ? eur(product.cylinderPrice) : t("priceOnRequest")}
          </span>
          <span className={`block truncate text-muted-foreground ${compact || row ? "text-[10.5px]" : "mt-0.5 text-[12px]"}`} data-cylinder-price>
            {!product.pricedPerKg
              ? compact
                ? t("exVatShort")
                : t("unitExVat", { volume: product.weightLabel })
              : priced
                ? t("perKgAmount", { amount: eur(product.pricePerKg) })
                : product.weightLabel}
          </span>
        </div>
        {/* The action slot is the only thing that differs between an
            in-stock and an out-of-stock card — same size either way. */}
        {action}
      </div>
    </div>
  );

  return (
    <motion.div
      ref={ref}
      layout={animateIn ? true : undefined}
      variants={
        animateIn
          ? {
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
            }
          : undefined
      }
      initial={animateIn ? "hidden" : false}
      animate={animateIn ? "show" : undefined}
      exit={animateIn ? { opacity: 0, scale: 0.97, transition: { duration: 0.2 } } : undefined}
      transition={{ layout: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
      data-product-card={product.sku}
      data-card-variant={variant}
      // Depth from the surface and the shadow, not an outline. Dark mode keeps
      // a hairline: on obsidian a shadow alone can't separate the card.
      className={`group relative flex h-full overflow-hidden bg-card shadow-card transition-[box-shadow,translate] duration-300 ease-out hover:-translate-y-1 hover:shadow-popover dark:border dark:border-hairline ${
        row ? "flex-row rounded-[18px]" : compact ? "flex-col rounded-[18px]" : "flex-col rounded-[22px]"
      } ${className}`}
    >
      {media}
      {body}
    </motion.div>
  );
}
