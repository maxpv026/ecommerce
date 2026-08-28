"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  ChevronLeft,
  Cylinder,
  Droplets,
  FileText,
  Gauge,
  LayoutGrid,
  RefreshCcw,
  Rows3,
  Sparkles,
} from "lucide-react";
import { useCartStore, selectCartCount } from "@/lib/store/cart";
import { useCartCount } from "./CartCountProvider";
import type { CategoryCounts } from "./CategoriesPage";

interface MobileCategorySpec {
  slug: string;
  titleKey: string;
  blurbKey: string;
  ctaKey: string;
  /** null → the compliance "Documentation" label is used instead. */
  countOf: keyof CategoryCounts | null;
  icon: typeof Cylinder;
  tint: string;
  /** The hero card keeps full width even in the 2-up grid. */
  wide?: boolean;
  href: { pathname: "/products" | "/compliance/sds"; query?: Record<string, string> };
}

const CATEGORIES: MobileCategorySpec[] = [
  {
    slug: "cylinders",
    titleKey: "cylTitle",
    blurbKey: "cylBlurb",
    ctaKey: "cylCta",
    countOf: "cylinders",
    icon: Cylinder,
    tint: "#22d3ee",
    wide: true,
    href: { pathname: "/products", query: { category: "cylinders" } },
  },
  {
    slug: "blends",
    titleKey: "blendTitle",
    blurbKey: "blendBlurb",
    ctaKey: "blendCta",
    countOf: "blends",
    icon: Droplets,
    tint: "#7c3aed",
    href: { pathname: "/products", query: { category: "blends" } },
  },
  {
    slug: "equipment",
    titleKey: "eqTitle",
    blurbKey: "eqBlurb",
    ctaKey: "eqCta",
    countOf: "equipment",
    icon: Gauge,
    tint: "#2563eb",
    href: { pathname: "/products", query: { category: "equipment" } },
  },
  {
    slug: "recovery",
    titleKey: "recTitle",
    blurbKey: "recBlurb",
    ctaKey: "recCta",
    countOf: "recovery",
    icon: RefreshCcw,
    tint: "#22d3ee",
    href: { pathname: "/products", query: { category: "recovery" } },
  },
  {
    slug: "compliance",
    titleKey: "compTitle",
    blurbKey: "compBlurb",
    ctaKey: "compCta",
    countOf: null,
    icon: FileText,
    tint: "#34d399",
    href: { pathname: "/compliance/sds" },
  },
];

interface MobileCategoriesLayoutProps {
  counts: CategoryCounts;
}

export default function MobileCategoriesLayout({ counts }: MobileCategoriesLayoutProps) {
  const t = useTranslations("Categories");
  const tHeader = useTranslations("Header");
  const [layout, setLayout] = useState<"grid" | "rows">("grid");
  const [pressed, setPressed] = useState<string | null>(null);
  const { setCartCount } = useCartCount();
  const realCartCount = useCartStore(selectCartCount);

  // Keep the global bottom-nav badge on the real persisted cart.
  useEffect(() => {
    setCartCount(realCartCount);
  }, [realCartCount, setCartCount]);

  const twoUp = layout === "grid";

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-white dark:bg-canvas">
      {/* ambient orb field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[180px] left-[-28%] h-[430px] w-[430px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-30 blur-[92px] [animation:hc-breathe_10s_ease-in-out_infinite]" />
        <div className="absolute -top-[130px] right-[-26%] h-[370px] w-[370px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.28] blur-[88px] [animation:hc-breathe_13s_ease-in-out_infinite_reverse]" />
        <div className="absolute left-[10%] top-[420px] h-[330px] w-[330px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.18] blur-[86px] [animation:hc-breathe_16s_ease-in-out_infinite]" />
        <div className="absolute -bottom-[110px] right-[-14%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#34d399,rgba(52,211,153,0)_68%)] opacity-[.16] blur-[82px] [animation:hc-breathe_12s_ease-in-out_infinite_reverse]" />
      </div>

      {/* sticky glass header */}
      <div className="sticky top-0 z-[80] bg-white/80 px-[18px] pb-3 pt-3 backdrop-blur-xl backdrop-saturate-150 dark:bg-[#090A0C]/80">
        <div className="flex items-center gap-2.5">
          <motion.div whileTap={{ scale: 0.9 }} className="flex flex-none">
            <Link
              href="/"
              aria-label={t("backAria")}
              className="-ml-[11px] flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-slate-900/[.06] dark:hover:bg-white/10"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </Link>
          </motion.div>
          <span className="min-w-0 flex-1 text-center text-[16.5px] font-semibold tracking-[-.03em]">
            {tHeader("productList")}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setLayout((v) => (v === "grid" ? "rows" : "grid"))}
            aria-label={t("layoutToggleAria")}
            data-layout-toggle
            className="-mr-[11px] flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/[.06] dark:text-ink-muted dark:hover:bg-white/10"
          >
            {twoUp ? <Rows3 size={18} strokeWidth={1.9} /> : <LayoutGrid size={18} strokeWidth={1.9} />}
          </motion.button>
        </div>
      </div>

      <div className="relative pb-[calc(118px+env(safe-area-inset-bottom))]">
        {/* headline */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="px-[18px] pt-3.5"
        >
          <h1 className="m-0 text-[30px] font-semibold leading-[1.08] tracking-[-.048em] text-pretty">{t("title")}</h1>
          <p className="mb-0 mt-[11px] text-[13px] leading-[1.6] text-slate-500 dark:text-ink-muted">{t("subtitle")}</p>
        </motion.div>

        {/* category cards: 2-up compact by default, detailed stack via toggle */}
        <div
          className={`grid gap-3.5 px-[18px] pt-[22px] ${twoUp ? "grid-cols-2" : "grid-cols-1"}`}
          data-category-grid={layout}
        >
          {CATEGORIES.map((category, i) => {
            const full = !twoUp || category.wide;
            const on = pressed === category.slug;
            const Icon = category.icon;
            const count =
              category.countOf === null ? t("compCount") : t("productCount", { count: counts[category.countOf] });
            return (
              <motion.div
                key={category.slug}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.06 + i * 0.07 }}
                className={`flex ${full ? "col-span-full" : ""}`}
              >
                <motion.div whileTap={{ scale: 0.95 }} className="flex w-full">
                  <Link
                    href={category.href}
                    data-category={category.slug}
                    onTouchStart={() => setPressed(category.slug)}
                    onTouchEnd={() => setPressed(null)}
                    onMouseDown={() => setPressed(category.slug)}
                    onMouseUp={() => setPressed(null)}
                    onMouseLeave={() => setPressed(null)}
                    className={`relative flex w-full flex-col overflow-hidden border bg-white/70 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-200 dark:bg-glass ${
                      full ? "min-h-[168px] rounded-[26px] p-5" : "min-h-[176px] rounded-[26px] p-4"
                    }`}
                    style={{
                      borderColor: on ? `${category.tint}88` : "var(--hc-cat-border, rgba(15,23,42,.1))",
                      boxShadow: on
                        ? `0 34px 70px -44px rgba(0,0,0,.55), 0 0 28px -8px ${category.tint}80`
                        : "0 16px 40px -34px rgba(0,0,0,.4)",
                    }}
                  >
                    {/* tint aura */}
                    <span
                      className="pointer-events-none absolute -top-[64%] right-[-24%] h-[300px] w-[300px] rounded-full blur-[64px] transition-opacity duration-200"
                      style={{
                        background: `radial-gradient(circle,${category.tint},transparent 68%)`,
                        opacity: on ? 0.34 : 0.15,
                      }}
                    />

                    <span className="relative flex items-start justify-between gap-3">
                      <span
                        className={`flex flex-none items-center justify-center border ${
                          full ? "h-12 w-12 rounded-2xl" : "h-[42px] w-[42px] rounded-[14px]"
                        }`}
                        style={{
                          background: `${category.tint}24`,
                          borderColor: `${category.tint}4d`,
                          boxShadow: on ? `0 0 20px -6px ${category.tint}` : "none",
                        }}
                      >
                        <Icon size={full ? 21 : 19} strokeWidth={1.9} style={{ color: category.tint }} />
                      </span>
                      <span className="inline-flex flex-none items-center rounded-full border border-slate-900/[.08] bg-slate-100 px-2.5 py-[5px] text-[10px] font-semibold tracking-[.02em] text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                        {count}
                      </span>
                    </span>

                    <span className="relative mt-auto block pt-[18px]">
                      <span
                        className={`block font-semibold leading-[1.18] tracking-[-.036em] ${full ? "text-[19px]" : "text-[15px]"}`}
                      >
                        {t(category.titleKey)}
                      </span>
                      {full && (
                        <span className="mt-2 line-clamp-2 block text-[11.5px] leading-[1.55] text-slate-500 dark:text-ink-muted">
                          {t(category.blurbKey)}
                        </span>
                      )}
                    </span>

                    <span
                      className="relative mt-3.5 flex min-h-5 items-center gap-[7px] text-[11.5px] font-semibold tracking-[-.015em] transition-colors duration-200"
                      style={{ color: on ? category.tint : undefined }}
                    >
                      <span className={on ? "" : "text-slate-500 dark:text-ink-muted"}>{t(category.ctaKey)}</span>
                      <ArrowRight
                        size={14}
                        strokeWidth={1.9}
                        className={on ? "" : "text-slate-500 dark:text-ink-muted"}
                        style={{ color: on ? category.tint : undefined }}
                      />
                    </span>
                  </Link>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* AI helper card → the home page's Ask My Energy AI hub */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          className="px-[18px] pt-[22px]"
        >
          <motion.div whileTap={{ scale: 0.97 }}>
            <Link
              href="/"
              data-ai-helper
              className="relative block min-h-11 overflow-hidden rounded-[22px] border border-blue-700/30 bg-white/70 p-4 shadow-[0_0_26px_-16px_#2563eb] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
            >
              <span className="pointer-events-none absolute -bottom-[150%] left-[-20%] h-60 w-60 rounded-full bg-[radial-gradient(circle,#7c3aed,transparent_68%)] opacity-[.24] blur-[58px]" />
              <span className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_12px_26px_-12px_rgba(37,99,235,.8)]">
                  <Sparkles size={18} strokeWidth={2} className="text-white" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold tracking-[-.025em]">{t("aiTitle")}</span>
                  <span className="mt-[3px] block text-[11px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                    {t("aiBody")}
                  </span>
                </span>
                <ArrowRight size={16} strokeWidth={1.9} className="flex-none text-blue-700 dark:text-blue-400" />
              </span>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
