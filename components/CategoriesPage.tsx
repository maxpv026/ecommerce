"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Cylinder, Droplets, FileText, Gauge, RefreshCcw, Sparkles } from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";

/* ── entrance cascade: design's hcRise (fade-up + settle), 80ms apart ── */
const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};
const cardRise = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.72, ease: [0.16, 1, 0.3, 1] as const } },
};
const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay },
});

interface CategorySpec {
  slug: string;
  titleKey: string;
  blurbKey: string;
  ctaKey: string;
  /** null → the live product count is used instead. */
  countKey: string | null;
  icon: typeof Cylinder;
  span: string;
  tall: boolean;
  tint: string;
  href: { pathname: "/products" | "/compliance/sds"; query?: Record<string, string> };
}

// span = 6-column bento occupancy — the asymmetry of the design.
const CATEGORIES: CategorySpec[] = [
  {
    slug: "cylinders",
    titleKey: "cylTitle",
    blurbKey: "cylBlurb",
    ctaKey: "cylCta",
    countKey: null,
    icon: Cylinder,
    span: "md:col-span-4",
    tall: true,
    tint: "#22d3ee",
    href: { pathname: "/products", query: { category: "cylinders" } },
  },
  {
    slug: "blends",
    titleKey: "blendTitle",
    blurbKey: "blendBlurb",
    ctaKey: "blendCta",
    countKey: "blendCount",
    icon: Droplets,
    span: "md:col-span-2",
    tall: true,
    tint: "#7c3aed",
    href: { pathname: "/products", query: { category: "blends" } },
  },
  {
    slug: "equipment",
    titleKey: "eqTitle",
    blurbKey: "eqBlurb",
    ctaKey: "eqCta",
    countKey: "eqCount",
    icon: Gauge,
    span: "md:col-span-2",
    tall: false,
    tint: "#2563eb",
    href: { pathname: "/products", query: { category: "equipment" } },
  },
  {
    slug: "recovery",
    titleKey: "recTitle",
    blurbKey: "recBlurb",
    ctaKey: "recCta",
    countKey: "recCount",
    icon: RefreshCcw,
    span: "md:col-span-2",
    tall: false,
    tint: "#22d3ee",
    href: { pathname: "/products", query: { category: "recovery" } },
  },
  {
    slug: "compliance",
    titleKey: "compTitle",
    blurbKey: "compBlurb",
    ctaKey: "compCta",
    countKey: "compCount",
    icon: FileText,
    span: "md:col-span-2",
    tall: false,
    tint: "#7c3aed",
    href: { pathname: "/compliance/sds" },
  },
];

interface CategoriesPageProps {
  cylinderCount: number;
}

export default function CategoriesPage({ cylinderCount }: CategoriesPageProps) {
  const t = useTranslations("Categories");
  const tHome = useTranslations("HomeDesktop");
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <Header
        query={query}
        onQueryChange={setQuery}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <div className="relative overflow-x-clip">
        {/* Ambient tri-color glow field, masked to fade by ~44% height */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_44%,transparent_100%)]">
          <div className="absolute -top-[320px] left-[-14%] h-[860px] w-[860px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_66%)] opacity-[.32] blur-[120px] [animation:hc-float_26s_ease-in-out_infinite]" />
          <div className="absolute -top-[240px] right-[-10%] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-30 blur-[120px] [animation:hc-float_32s_ease-in-out_infinite_reverse]" />
          <div className="absolute -top-[180px] left-[40%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_68%)] opacity-[.24] blur-[110px] [animation:hc-float_38s_ease-in-out_infinite]" />
        </div>

        <main className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-16">
          {/* Hero */}
          <motion.div {...fade(0)}>
            <div className="mb-3.5 text-xs tracking-[.09em] text-slate-400 dark:text-ink-muted">
              {t("eyebrow")}
            </div>
            <h1 className="m-0 max-w-[660px] text-[52px] font-semibold leading-[1.03] tracking-[-.05em] text-pretty">
              {t("title")}
            </h1>
            <p className="mt-[18px] max-w-[560px] text-base leading-[1.62] text-slate-600 dark:text-ink-muted">
              {t("subtitle")}
            </p>
          </motion.div>

          {/* Asymmetric bento of category links */}
          <motion.div
            id="categories"
            variants={gridStagger}
            initial="hidden"
            animate="show"
            className="mt-[52px] grid grid-cols-1 items-stretch gap-[18px] md:grid-cols-6"
          >
            {CATEGORIES.map((category) => {
              const on = hovered === category.slug;
              const Icon = category.icon;
              const count = category.countKey === null ? t("productCount", { count: cylinderCount }) : t(category.countKey);
              return (
                <motion.div
                  key={category.slug}
                  variants={cardRise}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={`flex ${category.span}`}
                >
                  <Link
                    href={category.href}
                    onMouseEnter={() => setHovered(category.slug)}
                    onMouseLeave={() => setHovered(null)}
                    data-category={category.slug}
                    className={`relative flex w-full flex-col overflow-hidden rounded-[26px] border bg-white/70 p-7 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-glass ${
                      category.tall ? "min-h-[340px]" : "min-h-[268px]"
                    }`}
                    style={{
                      borderColor: on ? `${category.tint}88` : "var(--hc-cat-border, rgba(15,23,42,.07))",
                      boxShadow: on
                        ? `0 42px 84px -44px rgba(2,4,10,.65), 0 0 32px -8px ${category.tint}80`
                        : "0 18px 44px -38px rgba(2,4,10,.5)",
                    }}
                  >
                    {/* tint aura, brightening on hover */}
                    <span
                      className="pointer-events-none absolute -top-[52%] right-[-16%] h-[420px] w-[420px] rounded-full blur-[76px] transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(circle,${category.tint},transparent 68%)`,
                        opacity: on ? 0.34 : 0.13,
                      }}
                    />

                    <span className="relative flex items-start justify-between gap-4">
                      <span
                        className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[17px] border transition-colors duration-300"
                        style={{
                          background: on ? `${category.tint}26` : "var(--hc-cat-tile, rgba(15,23,42,.04))",
                          borderColor: on ? `${category.tint}59` : "var(--hc-cat-border, rgba(15,23,42,.07))",
                        }}
                      >
                        <Icon
                          size={23}
                          strokeWidth={1.8}
                          style={{ color: on ? category.tint : undefined }}
                          className="text-slate-600 transition-colors duration-300 dark:text-ink-muted"
                        />
                      </span>
                      <span className="inline-flex flex-none items-center rounded-full border border-slate-900/[.07] bg-slate-100 px-3 py-1.5 text-[11px] font-semibold tracking-[.02em] text-slate-400 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted">
                        {count}
                      </span>
                    </span>

                    <span className="relative mt-auto block pt-[26px]">
                      <span
                        className={`block font-semibold leading-[1.14] tracking-[-.038em] ${
                          category.tall ? "text-[25px]" : "text-xl"
                        }`}
                      >
                        {t(category.titleKey)}
                      </span>
                      <span className="mt-2.5 block max-w-[340px] text-[13.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">
                        {t(category.blurbKey)}
                      </span>
                    </span>

                    <span
                      className="relative mt-[22px] flex items-center gap-2 text-[13px] font-semibold tracking-[-.015em] transition-colors duration-300"
                      style={{ color: on ? category.tint : undefined }}
                    >
                      <span className={on ? "" : "text-slate-400 dark:text-ink-muted"}>{t(category.ctaKey)}</span>
                      <ArrowRight
                        size={15}
                        strokeWidth={1.8}
                        className={`transition-[margin-left,color] duration-300 ${on ? "ml-1" : "ml-0 text-slate-400 dark:text-ink-muted"}`}
                        style={{ color: on ? category.tint : undefined }}
                      />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>

          {/* AI calculator banner */}
          <motion.div
            {...fade(0.55)}
            className="mt-[52px] flex flex-wrap items-center gap-3.5 rounded-3xl border border-slate-900/[.07] bg-white/70 px-6 py-[22px] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
          >
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] border border-blue-700/[.24] bg-blue-700/[.08] dark:bg-blue-600/[.18]">
              <Sparkles size={19} strokeWidth={1.8} className="text-blue-700 dark:text-blue-400" />
            </span>
            <span className="min-w-[220px] flex-1">
              <span className="block text-[14.5px] font-semibold tracking-[-.025em]">{t("aiTitle")}</span>
              <span className="mt-1 block text-[13px] text-slate-600 dark:text-ink-muted">{t("aiBody")}</span>
            </span>
            <Link
              href="/"
              className="flex h-11 flex-none items-center justify-center rounded-[14px] bg-blue-700 px-[22px] text-[13.5px] font-semibold tracking-[-.015em] text-white shadow-[0_18px_36px_-18px_rgba(29,78,216,.8)] transition-colors hover:bg-blue-800"
            >
              {tHome("openCalculator")}
            </Link>
          </motion.div>
        </main>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
