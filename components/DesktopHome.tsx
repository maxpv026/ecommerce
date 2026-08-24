"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  FileText,
  RotateCw,
  ScanLine,
  Search,
  Sparkles,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import HeroBackground from "./HeroBackground";
import { useCartStore } from "@/lib/store/cart";
import { openAiChat } from "@/lib/aiChatEvents";
import { getTimeOfDayGreeting } from "@/lib/greeting";
import type { MarketAlertData, ProfileDashboardData, StoreProduct, UserOrder } from "@/lib/data";

const ThreeCylinder = dynamic(() => import("./ThreeCylinder"), { ssr: false });

const CALC_CHIPS = ["4-ton rooftop", "Line set 40 ft", "R-410A retrofit"];

/* ── scroll-linked section: scales up on the way in, down on the way out ── */

function RevealSection({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.28, 0.72, 1], [0.9, 1, 1, 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 0.22, 0.78, 1], [0, 1, 1, 0.15]);

  return (
    <motion.section ref={ref} id={id} style={{ scale, opacity }} className={className}>
      <motion.div
        initial="hidden"
        whileInView="shown"
        viewport={{ once: false, amount: 0.25 }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.11 } } }}
      >
        {children}
      </motion.div>
    </motion.section>
  );
}

const stagger: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.94 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

/* ── 3D tilt + specular glare ─────────────────────────────────────────── */

function TiltCard({
  children,
  max = 10,
  className = "",
  radius = "rounded-3xl",
}: {
  children: React.ReactNode;
  max?: number;
  className?: string;
  radius?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, on: false });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setTilt({ rx: (0.5 - y) * max * 2, ry: (x - 0.5) * max * 2 });
    setGlare({ x: x * 100, y: y * 100, on: true });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setTilt({ rx: 0, ry: 0 });
        setGlare((g) => ({ ...g, on: false }));
      }}
      animate={{ rotateX: tilt.rx, rotateY: tilt.ry }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      style={{ transformStyle: "preserve-3d", perspective: 1100 }}
      className={`relative overflow-hidden ${radius} ${className}`}
    >
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-300 ${
          glare.on ? "opacity-100" : "opacity-0"
        }`}
        style={{
          borderRadius: "inherit",
          background: `radial-gradient(320px circle at ${glare.x}% ${glare.y}%,rgba(255,255,255,.55),rgba(255,255,255,0) 62%)`,
        }}
      />
    </motion.div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

interface DesktopHomeProps {
  products: StoreProduct[];
  marketAlerts: MarketAlertData[];
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
}

export default function DesktopHome({ products, marketAlerts, dashboard, latestOrder }: DesktopHomeProps) {
  const t = useTranslations("HomeDesktop");
  const td = useTranslations("Dashboard");
  const format = useFormatter();
  const { data: session, status } = useSession();
  const addItem = useCartStore((s) => s.addItem);
  const [calcQuery, setCalcQuery] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  const isAuthenticated = status === "authenticated";
  // First name when a name exists, else the account email — never an empty
  // string (an empty span would leave "Good afternoon," hanging over a
  // stray period).
  const heroName = session?.user?.name?.split(" ")[0] || session?.user?.email || null;
  const greeting = td(getTimeOfDayGreeting());
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const runCalc = (query: string) => {
    if (!query.trim()) return;
    openAiChat(query);
  };

  const addToCart = (product: StoreProduct) => {
    addItem({
      sku: product.sku,
      name: product.name,
      variant: product.weightLabel,
      price: product.price,
    });
    setAdded(product.id);
    setTimeout(() => setAdded(null), 1400);
  };

  const lastItem = latestOrder?.items[0];
  const lastOrderTotal = latestOrder?.items.reduce((sum, i) => sum + i.priceAtPurchase * i.quantity, 0) ?? 0;
  const statusLabel =
    latestOrder?.status === "IN_TRANSIT"
      ? td("inTransit")
      : latestOrder?.status === "DELIVERED"
        ? td("delivered")
        : td("dispatched");
  const eta = latestOrder ? format.dateTime(new Date(latestOrder.estimatedDelivery), { month: "short", day: "numeric" }) : null;

  return (
    <main className="mx-auto max-w-[1320px] px-6 pb-32 md:px-8">
      {/* Hero */}
      <RevealSection className="pb-2 pt-16">
        {/* RevealSection wraps {children} in its own unstyled stagger div, so
            the 2-column grid has to live here (a direct child of that
            wrapper) rather than on RevealSection's own className — a grid's
            column-splitting only applies to its direct children, and that
            wrapper is RevealSection's only direct child. HeroBackground
            wraps the grid (rather than living inside it) purely for the
            mouse-spotlight's hit area — it doesn't add a layer between the
            grid and its two column children, so the column split is
            unaffected. */}
        <HeroBackground>
        <div className="relative grid min-h-[520px] items-center gap-14 md:grid-cols-[1.02fr_.98fr]">
        <motion.div variants={stagger}>
          {isAuthenticated && session?.user?.epaVerified ? (
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-green-600/[.24] bg-green-50 py-1.5 pl-2.5 pr-3.5 text-[11.5px] font-semibold text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-green-600 dark:bg-green-400" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
              </span>
              {t("fgasBadge")}
            </div>
          ) : !isAuthenticated ? (
            <Link
              href="/auth"
              className="mb-6 inline-flex items-center gap-2 text-[12.5px] font-medium text-slate-500 hover:text-blue-700 dark:text-ink-muted dark:hover:text-blue-400"
            >
              {td("signInToViewEpa")}
            </Link>
          ) : null}

          <h1 className="text-5xl font-semibold leading-none tracking-[-0.048em] text-balance md:text-[62px]">
            {isAuthenticated && heroName ? (
              <>
                {greeting},
                <br />
                <span className="text-slate-400 dark:text-ink-muted">{heroName}.</span>
              </>
            ) : (
              greeting
            )}
          </h1>
          <p className="mt-6 max-w-[452px] text-[16.5px] leading-relaxed text-slate-600 text-pretty dark:text-ink-muted">
            {t("heroSubtitle")}
          </p>

          <div className="mt-9 flex items-center gap-2.5">
            <Link
              href="/cylinders"
              className="flex h-[52px] items-center gap-2.5 rounded-[15px] bg-slate-900 px-6 text-[14.5px] font-semibold tracking-tight text-white shadow-[0_18px_34px_-18px_rgba(15,23,42,.6)] hover:bg-slate-800 dark:bg-invert dark:text-invert-ink dark:hover:bg-slate-200"
            >
              {t("browseCylinders")}
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
            <a
              href="#bento"
              className="flex h-[52px] items-center rounded-[15px] border border-slate-900/[.14] bg-white px-5.5 text-[14.5px] font-semibold tracking-tight dark:border-hairline-strong dark:bg-surface"
            >
              {t("openCalculator")}
            </a>
          </div>

          {dashboard && (
            <div className="mt-11 flex gap-10">
              {[
                { value: String(dashboard.totalOrders), label: t("statOrders") },
                { value: String(dashboard.activeShipments), label: t("statInTransit") },
                { value: "99.9%", label: t("statPurity") },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[25px] font-semibold tracking-[-0.04em]">{s.value}</div>
                  <div className="mt-1 text-[11.5px] tracking-[.05em] text-slate-400 dark:text-ink-muted">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* 3D cylinder stage */}
        <motion.div variants={stagger} className="relative flex h-[520px] items-center justify-center">
          {/* Hover-interactive showcase: cylinder + floating spec chips move
              and scale together, independent of the static ambient blobs
              behind them. */}
          <div className="group relative z-[1] h-full w-full cursor-pointer transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-105">
            <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]">
              <ThreeCylinder />
            </div>

            <div className="pointer-events-none absolute right-[2%] top-[16%] z-[2] rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-[0_20px_44px_-28px_rgba(15,23,42,.5)] backdrop-blur-lg transition-transform duration-500 ease-out group-hover:-translate-y-1 dark:border-white/10 dark:bg-glass">
              <div className="text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">PURITY</div>
              <div className="mt-1 text-[17px] font-semibold tracking-[-0.035em]">99.9%</div>
            </div>
            <div className="pointer-events-none absolute bottom-[19%] left-[1%] z-[2] rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-[0_20px_44px_-28px_rgba(15,23,42,.5)] backdrop-blur-lg transition-transform duration-500 ease-out group-hover:-translate-y-1 dark:border-white/10 dark:bg-glass">
              <div className="text-[10px] tracking-[.08em] text-slate-400 dark:text-ink-muted">AHRI-700</div>
              <div className="mt-1 text-[17px] font-semibold tracking-[-0.035em]">Certified</div>
            </div>
          </div>
        </motion.div>
        </div>
        </HeroBackground>
      </RevealSection>

      {/* Bento */}
      <RevealSection id="bento" className="pt-16">
        <motion.div variants={stagger} className="mb-5 flex items-baseline justify-between gap-5">
          <h2 className="text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("operationsEyebrow")}</h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-12">
          {/* AI calculator — feature card, wired to the real chat widget */}
          <motion.div variants={stagger} className="md:col-span-8 md:row-start-1">
            <TiltCard max={5} className="bg-[#0b1020] p-8 text-white shadow-[0_40px_80px_-44px_rgba(11,16,32,.85)]">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-[14%] -top-[40%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,#2563eb,transparent_68%)] opacity-80 blur-[88px]" />
                <div className="absolute -top-[30%] right-[6%] h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,#7c3aed,transparent_68%)] opacity-70 blur-[84px]" />
                <div className="absolute -bottom-[42%] -right-[8%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#fb7185,transparent_68%)] opacity-60 blur-[80px]" />
                <div className="absolute -bottom-[46%] left-1/3 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#fb923c,transparent_68%)] opacity-50 blur-[76px]" />
              </div>

              <div className="relative grid items-center gap-7 md:grid-cols-[1.25fr_.75fr]" style={{ transform: "translateZ(30px)" }}>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-[.05em]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("calculatorTag")}
                  </div>
                  <h3 className="mt-5 text-[34px] font-semibold leading-tight tracking-[-0.04em] text-balance">
                    {td("chargeCalculatorTitle")}
                  </h3>
                  <p className="mt-3.5 max-w-[400px] text-sm leading-relaxed text-white/70 text-pretty">
                    {td("chargeCalculatorBody")}
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runCalc(calcQuery);
                    }}
                    className="mt-6 flex h-14 items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 pl-4.5 pr-2 backdrop-blur-md"
                  >
                    <Search className="h-[17px] w-[17px] shrink-0 text-white/60" />
                    <input
                      value={calcQuery}
                      onChange={(e) => setCalcQuery(e.target.value)}
                      placeholder={t("calculatorPlaceholder")}
                      className="min-w-0 flex-1 bg-transparent text-sm tracking-tight text-white outline-none placeholder:text-white/45"
                    />
                    <button
                      type="submit"
                      disabled={!calcQuery.trim()}
                      className="h-[42px] shrink-0 rounded-xl bg-white px-5 text-[13px] font-semibold tracking-tight text-[#0b1020] transition-colors disabled:opacity-50"
                    >
                      {t("calculatorButton")}
                    </button>
                  </form>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {CALC_CHIPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCalcQuery(c)}
                        className="h-8 rounded-full border border-white/20 bg-white/[.08] px-3 text-xs font-medium tracking-tight text-white/80 hover:bg-white/[.14]"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative flex h-[266px] items-center justify-center">
                  <div
                    className="absolute h-[230px] w-[230px] animate-[spin_22s_linear_infinite] rounded-full opacity-85 blur-[30px]"
                    style={{
                      background:
                        "conic-gradient(from 0deg,rgba(37,99,235,.75),rgba(124,58,237,.75),rgba(251,113,133,.7),rgba(37,99,235,.75))",
                    }}
                  />
                  <div
                    className="relative flex h-[172px] w-[172px] items-center justify-center rounded-full border border-dashed border-white/40 bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,.34),rgba(255,255,255,.04)_62%)] backdrop-blur-sm"
                    style={{ transform: "translateZ(60px)" }}
                  >
                    <Sparkles className="h-8 w-8 text-white/70" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>

          {/* Market alerts — real AI-generated alerts */}
          <motion.div variants={stagger} id="alerts" className="md:col-span-4 md:row-span-2 md:row-start-1">
            <div className="flex h-full flex-col rounded-[28px] border border-slate-900/[.06] bg-white/[.66] p-6 shadow-[0_26px_56px_-40px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                    <TrendingUp className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <span className="text-sm font-semibold tracking-tight">{td("marketAlerts")}</span>
                </span>
                <span className="text-[11px] text-slate-400 dark:text-ink-muted">{t("liveTag")}</span>
              </div>

              <div className="mt-5 flex flex-1 flex-col gap-3">
                {marketAlerts.length > 0 ? (
                  marketAlerts.map((a) => {
                    const warning = a.tone === "warning";
                    return (
                      <div
                        key={a.id}
                        className="rounded-[18px] border border-slate-900/[.05] bg-white px-4 py-3.5 shadow-sm dark:border-white/[.06] dark:bg-surface"
                      >
                        <span
                          className={`text-[10.5px] font-semibold tracking-[.04em] ${
                            warning ? "text-orange-600 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {a.eyebrow}
                        </span>
                        <div className="mt-1.5 text-[13.5px] font-semibold tracking-tight">{a.title}</div>
                        <div className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-ink-muted">{a.body}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-center text-[12.5px] text-slate-400 dark:text-ink-muted">
                    {t("noAlerts")}
                  </div>
                )}
              </div>

              <Link
                href="/profile/settings"
                className="mt-4 flex h-11 items-center justify-center rounded-2xl border border-slate-900/[.12] bg-white text-[13px] font-semibold tracking-tight hover:border-slate-900/30 dark:border-hairline-strong dark:bg-surface dark:hover:border-white/30"
              >
                {t("managePriceAlerts")}
              </Link>
            </div>
          </motion.div>

          {/* 2×2 quick actions */}
          <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 md:col-span-8 md:row-start-2">
            <TiltCard
              max={11}
              radius="rounded-[24px]"
              className="cursor-pointer border border-slate-900/[.06] bg-white/70 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
            >
              <Link href={latestOrder ? "/profile/orders" : "/cylinders"} className="relative block" style={{ transform: "translateZ(26px)" }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_14px_26px_-14px_rgba(37,99,235,.75)]">
                  <RotateCw className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("quickReorderLabel")}</div>
                <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                  {lastItem ? `${lastItem.productName} ×${lastItem.quantity}` : t("noOrdersYet")}
                </div>
                <div className="mt-4.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {lastItem ? t("reorderCta", { price: formatEur(lastOrderTotal) }) : t("startFirstOrder")}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                </div>
              </Link>
            </TiltCard>

            <TiltCard
              max={11}
              radius="rounded-[24px]"
              className="cursor-pointer border border-slate-900/[.06] bg-white/70 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
            >
              <Link href="/profile/orders" className="relative block" style={{ transform: "translateZ(26px)" }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-cyan-600 to-cyan-400 text-white shadow-[0_14px_26px_-14px_rgba(8,145,178,.7)]">
                  <Truck className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("trackShipmentLabel")}</div>
                <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                  {latestOrder ? latestOrder.orderNumber : t("noOrdersYet")}
                </div>
                {latestOrder ? (
                  <div className="mt-4.5 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25">
                      <span className="h-1 w-1 rounded-full bg-green-600 dark:bg-emerald-400" />
                      {statusLabel}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-ink-muted">{t("etaLabel", { date: eta ?? "" })}</span>
                  </div>
                ) : (
                  <div className="mt-4.5 text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">{t("startFirstOrder")}</div>
                )}
              </Link>
            </TiltCard>

            <TiltCard
              max={11}
              radius="rounded-[24px]"
              className="cursor-pointer border border-slate-900/[.06] bg-white/70 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
            >
              <Link href="/compliance/sds" className="relative block" style={{ transform: "translateZ(26px)" }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-red-600 to-orange-500 text-white shadow-[0_14px_26px_-14px_rgba(220,38,38,.6)]">
                  <FileText className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("sdsLibraryLabel")}</div>
                <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{td("sdsLibraryNote")}</div>
                <div className="mt-4.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {t("sdsOpenLibrary")}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                </div>
              </Link>
            </TiltCard>

            <TiltCard
              max={11}
              radius="rounded-[24px]"
              className="cursor-pointer border border-slate-900/[.06] bg-white/70 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass"
            >
              <Link href="/cylinders" className="relative block" style={{ transform: "translateZ(26px)" }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-indigo-700 to-purple-500 text-white shadow-[0_14px_26px_-14px_rgba(67,56,202,.7)]">
                  <ScanLine className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("scanBarcodeLabel")}</div>
                <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{td("scanBarcodeNote")}</div>
                <div className="mt-4.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
                  {t("browseCylinders")}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                </div>
              </Link>
            </TiltCard>
          </motion.div>
        </div>
      </RevealSection>

      {/* Popular cylinders — real recommended/featured products from Prisma */}
      <RevealSection className="pt-20">
        <motion.div variants={stagger} className="mb-5 flex items-baseline justify-between gap-5">
          <h2 className="text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("popularCylindersEyebrow")}</h2>
          <Link href="/cylinders" className="text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
            {td("seeAll")}
          </Link>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <motion.div key={p.id} variants={stagger}>
              <TiltCard
                max={8}
                radius="rounded-[24px]"
                className="border border-slate-900/[.06] bg-white p-5.5 shadow-[0_18px_44px_-38px_rgba(15,23,42,.55)] dark:border-hairline dark:bg-surface"
              >
                <Link
                  href={p.pdpHref}
                  className="relative flex h-[196px] items-center justify-center overflow-hidden rounded-[18px] bg-slate-50 dark:bg-surface-2"
                  style={{ transform: "translateZ(18px)" }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(15,23,42,.035) 0 1px,transparent 1px 9px)" }}
                  />
                  <div className="relative h-[132px] w-16 rounded-t-full rounded-b-[9px] border border-dashed border-slate-300 bg-white/85 dark:border-white/20 dark:bg-white/10" />
                </Link>
                <div className="mt-4.5" style={{ transform: "translateZ(24px)" }}>
                  <Link href={p.pdpHref} className="text-[15.5px] font-semibold tracking-[-0.03em]">
                    {p.name}
                  </Link>
                  <div className="mt-1 text-[12.5px] text-slate-400 dark:text-ink-muted">
                    {p.weightLabel} · {p.gwpClass}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-[19px] font-semibold tracking-[-0.04em]">{formatEur(p.price)}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      disabled={!p.inStock}
                      className={`h-10 shrink-0 rounded-[13px] px-4 text-[12.5px] font-semibold tracking-tight text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        added === p.id
                          ? "bg-green-600 shadow-[0_12px_26px_-14px_rgba(22,163,74,.8)]"
                          : "bg-blue-700 shadow-[0_12px_26px_-14px_rgba(29,78,216,.8)]"
                      }`}
                    >
                      {added === p.id ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                          {t("added")}
                        </span>
                      ) : p.inStock ? (
                        t("addToCart")
                      ) : (
                        td("outOfStock")
                      )}
                    </button>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </RevealSection>
    </main>
  );
}
