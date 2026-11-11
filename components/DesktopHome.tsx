"use client";

import ProductCard from "./ProductCard";
import StockNotifyModal from "./StockNotifyModal";
import { isPurchasable } from "@/lib/waitlist";
import { useRef, useState, useTransition } from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowRight,
  FileText,
  LayoutGrid,
  Loader2,
  RotateCw,
  Search,
  Sparkles,
  Truck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import HeroBackground from "./HeroBackground";
import { useCartStore } from "@/lib/store/cart";
import { calculateCharge, type ChargeCalculation } from "@/lib/actions/chargeCalculator";
import CalculatedChargeCard from "./CalculatedChargeCard";
import SmartOrderButton from "./smartOrder/SmartOrderButton";
import type { GreetingKey } from "@/lib/greeting";
import { useGreeting } from "@/lib/hooks/useGreeting";
import HeroModelGate from "./HeroModelGate";
import type { ProfileDashboardData, StoreProduct, UserOrder } from "@/lib/data";

// Whole sentences: one click shows a complete worked calculation, including
// what happens when the factory charge is or isn't given. Translated, so a
// German engineer sees (and sends) a German example — the extraction reads any language.
const CALC_CHIP_KEYS = ["example1", "example2", "example3"] as const;

/* ── scroll-linked section: scales up on the way in, down on the way out ── */

function RevealSection({
  children,
  className = "",
  id,
  eager = false,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /**
   * Above the fold on load (the hero): rendered fully visible in the server
   * HTML, with no entrance fade. Otherwise its text sat at opacity 0 until
   * JavaScript hydrated and animated it in — the largest paint on the page
   * waited ~1.3 s behind a first paint of ~0.2 s. It still fades on the way out.
   */
  eager?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  // Entry and exit are measured in viewport terms, not as a fraction of the
  // section's own height: a tall section (the bento) peeking above the fold
  // must already be fully drawn, not half-faded at whatever fraction of its
  // height happens to be on screen.
  //   entry: 0 → 1 as the section's top rises from the viewport bottom to 80%
  //   exit:  0 → 1 as its bottom rises from 30% to the viewport top
  const { scrollYProgress: entry } = useScroll({ target: ref, offset: ["start end", "start 80%"] });
  const { scrollYProgress: exit } = useScroll({ target: ref, offset: ["end 30%", "end start"] });
  const scale = useTransform([entry, exit], ([i, o]: number[]) => (eager ? 1 : 0.9 + 0.1 * i) - 0.06 * o);
  const opacity = useTransform([entry, exit], ([i, o]: number[]) => (eager ? 1 : i) * (1 - 0.85 * o));

  return (
    <motion.section ref={ref} id={id} style={{ scale, opacity }} className={className}>
      <motion.div
        // `false`: start in the "shown" state, so children render visible on the server.
        initial={eager ? false : "hidden"}
        whileInView="shown"
        // Fires once the section's top is 120 px into the viewport, however
        // tall the section is (a fractional `amount` never fired for the
        // bento's above-the-fold peek, leaving an empty band under the hero).
        viewport={{ once: false, amount: "some", margin: "0px 0px -120px 0px" }}
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
  ...data
}: {
  children: React.ReactNode;
  /** Degrees of tilt at the edges; 0 turns tilt and glare off. */
  max?: number;
  className?: string;
  radius?: string;
} & { [attr: `data-${string}`]: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, on: false });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (max === 0) return;
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
      animate={max === 0 ? { rotateX: 0, rotateY: 0 } : { rotateX: tilt.rx, rotateY: tilt.ry }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      style={{ transformStyle: "preserve-3d", perspective: 1100 }}
      className={`relative overflow-hidden ${radius} ${className}`}
      {...data}
    >
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-300 ${
          glare.on && max !== 0 ? "opacity-100" : "opacity-0"
        }`}
        style={{
          borderRadius: "inherit",
          background: `radial-gradient(320px circle at ${glare.x}% ${glare.y}%,rgba(255,255,255,.55),rgba(255,255,255,0) 62%)`,
        }}
      />
    </motion.div>
  );
}

/** One operations card: a full-height column so the footer action pins to the bottom. */
const OPS_CARD =
  "flex flex-1 flex-col border border-slate-900/[.06] bg-white/70 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,.55)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass";

/**
 * The card's action, at its foot. Its ::after covers the whole card, so the
 * card is one big target without wrapping block content in a link.
 */
function OpsFooterLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-auto border-t border-slate-900/[.06] pt-3 dark:border-hairline" data-ops-footer>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 after:absolute after:inset-0 after:content-[''] hover:underline dark:text-blue-400"
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
      </Link>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

interface DesktopHomeProps {
  products: StoreProduct[];
  /** Server-rendered <MarketAlertsCard />, passed through from the page. */
  marketAlerts: ReactNode;
  dashboard: ProfileDashboardData | null;
  latestOrder: UserOrder | null;
  /** Signed in, own figures still on the way: placeholders, not a stranger's zeros. */
  accountLoading: boolean;
  greetingKey: GreetingKey;
  /** Safety data sheets in the library — counted on the server (lib/sds). */
  sdsCount: number;
}

/** A pulsing bar the size of the text it stands in for. */
const Shimmer = ({ className }: { className: string }) => (
  <span aria-hidden className={`block animate-pulse rounded-md bg-slate-900/[.07] dark:bg-white/[.08] ${className}`} />
);

export default function DesktopHome({ products, marketAlerts, dashboard, latestOrder, accountLoading, greetingKey, sdsCount }: DesktopHomeProps) {
  const t = useTranslations("HomeDesktop");
  const td = useTranslations("Dashboard");
  const tc = useTranslations("ChargeCalc");
  const format = useFormatter();
  const { data: session, status } = useSession();
  const addItem = useCartStore((s) => s.addItem);
  const [calcQuery, setCalcQuery] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  // Product whose back-in-stock dialog is open.
  const [notifyFor, setNotifyFor] = useState<StoreProduct | null>(null);

  const isAuthenticated = status === "authenticated";
  // First name when a name exists, else the account email — never an empty
  // string (an empty span would leave "Good afternoon," hanging over a
  // stray period).
  const heroName = session?.user?.name?.split(" ")[0] || session?.user?.email || null;
  const greeting = td(useGreeting(greetingKey));
  // Signed in and this buyer's own figures are still loading.
  const ownDataLoading = isAuthenticated && accountLoading;
  const formatEur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  // The calculator: the AI reads the sentence, lib/chargeCalc does the math,
  // and the worked result renders under the form (no chat hand-off).
  const [calc, setCalc] = useState<ChargeCalculation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcPending, startCalc] = useTransition();
  const runCalc = (query: string) => {
    if (!query.trim() || calcPending) return;
    setCalcError(null);
    startCalc(async () => {
      const result = await calculateCharge(query).catch(() => null);
      if (result?.ok) setCalc(result.calc);
      else {
        setCalc(null);
        const field = result && !result.ok && result.field ? tc(`field_${result.field}`) : "";
        setCalcError(tc(`error_${result?.code ?? "UNAVAILABLE"}`, { field }));
      }
    });
  };

  const addToCart = (product: StoreProduct) => {
    if (!isPurchasable(product)) return;
    addItem({
      sku: product.sku,
      name: product.name,
      variant: product.weightLabel,
      pricePerKg: product.pricePerKg,
      weightKg: product.weightKg,
      deposit: product.cylinderDeposit,
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
      <RevealSection className="pb-2 pt-10" eager>
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
        {/* Hero height follows the viewport so the OPERATIONS eyebrow and the
            top ~160 px of its cards always peek above the fold at scrollY 0:
            376 px = header 71 + hero top/bottom padding 48 + bento top
            padding 48 + eyebrow 48 + the 160 px peek. Clamped so short
            screens keep a usable hero and tall ones don't get a vast one. */}
        <div className="relative grid min-h-[var(--hero-h)] items-center gap-14 [--hero-h:clamp(440px,calc(100svh-376px),720px)] md:grid-cols-[1.02fr_.98fr]">
        <motion.div variants={stagger}>
          {/* One fixed-height slot whatever goes in it — the badge, the
              sign-in link, or (session still resolving / not verified)
              nothing — so the headline never jumps, and a signed-in buyer
              never sees "Sign in…" flash while their session loads. */}
          <div className="mb-6 flex h-[30px] items-center">
          {isAuthenticated && session?.user?.epaVerified ? (
            <div className="inline-flex items-center gap-2.5 rounded-full border border-green-600/[.24] bg-green-50 py-1.5 pl-2.5 pr-3.5 text-[11.5px] font-semibold text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-green-600 dark:bg-green-400" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
              </span>
              {t("fgasBadge")}
            </div>
          ) : status === "unauthenticated" ? (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 text-[12.5px] font-medium text-slate-500 hover:text-blue-700 dark:text-ink-muted dark:hover:text-blue-400"
            >
              {td("signInToViewEpa")}
            </Link>
          ) : null}
          </div>

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
              href="/products"
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

          {ownDataLoading && !dashboard && (
            <div className="mt-11 flex gap-10" data-stats-loading>
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Shimmer className="h-[30px] w-12" />
                  <Shimmer className="mt-1.5 h-3 w-20" />
                </div>
              ))}
            </div>
          )}
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
        <motion.div variants={stagger} className="relative flex h-[var(--hero-h)] items-center justify-center">
          {/* Hover-interactive showcase: cylinder + floating spec chips move
              and scale together, independent of the static ambient blobs
              behind them. */}
          <div className="group relative z-[1] h-full w-full cursor-pointer transition-all duration-500 ease-out hover:-translate-y-2 hover:scale-105">
            <div className="relative h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]">
              <HeroModelGate className="absolute inset-0" />
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
      <RevealSection id="bento" className="pt-12">
        <motion.div variants={stagger} className="mb-5 flex items-baseline justify-between gap-5">
          <h2 className="text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("operationsEyebrow")}</h2>
        </motion.div>

        {/* ── Tier 1: intelligence row ──
            The calculator (8) and Market Alerts (4) share one grid row, so
            they are always the same height. The alerts card is taken out of
            the row's height calculation (absolute, inset-0): the CALCULATOR
            alone decides how tall the row is, and the alerts list scrolls
            inside whatever that is. Idle, the row's min-height fits ~3 alerts;
            with a calculation open the row grows with the result and the
            alerts card grows beside it — no void under it either way. */}
        <div className="grid items-stretch gap-6 md:grid-cols-12" data-bento-tier="1">
          <motion.div variants={stagger} className="flex md:col-span-8 md:min-h-[560px]">
            <TiltCard
              max={calc ? 0 : 5}
              className="flex flex-1 flex-col bg-[#0b1020] p-8 text-white shadow-[0_40px_80px_-44px_rgba(11,16,32,.85)]"
              data-calculator-card={calc ? "result" : "idle"}
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-[14%] -top-[40%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,var(--orb-blue),transparent_68%)] opacity-80 blur-[88px]" />
                <div className="absolute -top-[30%] right-[6%] h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,var(--orb-violet),transparent_68%)] opacity-70 blur-[84px]" />
                <div className="absolute -bottom-[42%] -right-[8%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,#fb7185,transparent_68%)] opacity-60 blur-[80px]" />
                <div className="absolute -bottom-[46%] left-1/3 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,#fb923c,transparent_68%)] opacity-50 blur-[76px]" />
              </div>

              {/* Idle: the full pitch with the orb. With a result: a compact
                  header (title + the prompt, still usable for the next unit)
                  and the worked result below it, inside the same card. */}
              <div
                className={`relative grid gap-7 ${calc ? "" : "my-auto items-center md:grid-cols-[1.25fr_.75fr]"}`}
                style={calc ? undefined : { transform: "translateZ(30px)" }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-[.05em]">
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("calculatorTag")}
                    </div>
                    {calc && <h3 className="m-0 text-[20px] font-semibold tracking-[-0.03em]">{td("chargeCalculatorTitle")}</h3>}
                  </div>
                  {!calc && (
                    <>
                      <h3 className="mt-5 text-[34px] font-semibold leading-tight tracking-[-0.04em] text-balance">
                        {td("chargeCalculatorTitle")}
                      </h3>
                      <p className="mt-3.5 max-w-[400px] text-sm leading-relaxed text-white/70 text-pretty">
                        {td("chargeCalculatorBody")}
                      </p>
                    </>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runCalc(calcQuery);
                    }}
                    className={`${calc ? "mt-4" : "mt-6"} flex h-14 items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 pl-4.5 pr-2 backdrop-blur-md`}
                  >
                    <Search className="h-[17px] w-[17px] shrink-0 text-white/60" />
                    <input
                      value={calcQuery}
                      onChange={(e) => setCalcQuery(e.target.value)}
                      placeholder={t("calculatorPlaceholder")}
                      data-calc-input
                      className="min-w-0 flex-1 bg-transparent text-sm tracking-tight text-white outline-none placeholder:text-white/45"
                    />
                    <button
                      type="submit"
                      disabled={!calcQuery.trim() || calcPending}
                      data-calc-submit
                      className="flex h-[42px] shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-[13px] font-semibold tracking-tight text-[#0b1020] transition-colors disabled:opacity-50"
                    >
                      {calcPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {calcPending ? tc("calculating") : t("calculatorButton")}
                    </button>
                  </form>

                  {/* Hidden while a result is open (~90px back); the close button brings them back. */}
                  {!calc && (
                  <div className="mt-4 flex flex-wrap gap-2" data-calc-presets>
                    {CALC_CHIP_KEYS.map((key) => tc(key)).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCalcQuery(c);
                          runCalc(c);
                        }}
                        className="h-8 rounded-full border border-white/20 bg-white/[.08] px-3 text-xs font-medium tracking-tight text-white/80 hover:bg-white/[.14]"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  )}
                  {calcError && (
                    <p role="alert" data-calc-error className="mt-3 text-[12.5px] text-rose-200">
                      {calcError}
                    </p>
                  )}
                </div>

                {!calc && (
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
                )}
              </div>

              {/* The worked result, in the card. Tilt is off while it is open
                  (max 0): a form that leans with the cursor is hard to type in. */}
              {calc && <CalculatedChargeCard key={calc.query} calc={calc} onClose={() => setCalc(null)} className="mt-6 flex-1" />}
            </TiltCard>
          </motion.div>

          {/* Market alerts — live industry news, rendered on the server. Only
              the stagger wrapper is client-side; the card arrives as a slot.
              absolute + inset-0: as tall as the calculator, never taller. */}
          <motion.div variants={stagger} id="alerts" className="relative min-h-[560px] md:col-span-4" data-bento-alerts>
            <div className="h-full md:absolute md:inset-0">{marketAlerts}</div>
          </motion.div>
        </div>

        {/* ── Tier 2: operations strip ──
            Four equal cards in one row. Same skeleton in each — icon, title,
            body, and an action pinned to the foot (mt-auto) — so icons,
            titles and actions line up across the row. */}
        <div className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4" data-bento-tier="2">
          {/* Quick reorder: two actions, so the card itself is not a link. */}
          <motion.div variants={stagger} className="flex">
            <TiltCard max={9} radius="rounded-[24px]" className={OPS_CARD} data-ops-card="reorder">
              <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_14px_26px_-14px_rgba(37,99,235,.75)]">
                <RotateCw className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("quickReorderLabel")}</div>
              <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                {lastItem ? `${lastItem.productName} ×${lastItem.quantity}` : ownDataLoading ? <Shimmer className="mt-1 h-3.5 w-32" /> : t("noOrdersYet")}
              </div>
              <Link
                href={latestOrder ? "/profile/orders" : "/products"}
                className="mb-5 mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {lastItem ? t("reorderCta", { price: formatEur(lastOrderTotal) }) : t("startFirstOrderShort")}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
              </Link>
              <div className="mt-auto border-t border-slate-900/[.06] pt-3 dark:border-hairline" data-ops-footer>
                <SmartOrderButton variant="link" source="dashboard" />
              </div>
            </TiltCard>
          </motion.div>

          {/* Track delivery */}
          <motion.div variants={stagger} className="flex">
            <TiltCard max={9} radius="rounded-[24px]" className={OPS_CARD} data-ops-card="track">
              <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-cyan-600 to-cyan-400 text-white shadow-[0_14px_26px_-14px_rgba(8,145,178,.7)]">
                <Truck className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("trackShipmentLabel")}</div>
              <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">
                {latestOrder ? latestOrder.orderNumber : ownDataLoading ? <Shimmer className="mt-1 h-3.5 w-36" /> : t("noOrdersYet")}
              </div>
              {latestOrder && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25">
                    <span className="h-1 w-1 rounded-full bg-green-600 dark:bg-emerald-400" />
                    {statusLabel}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-ink-muted">{t("etaLabel", { date: eta ?? "" })}</span>
                </div>
              )}
              {ownDataLoading && !latestOrder && <Shimmer className="mt-3 h-5 w-40" />}
              <OpsFooterLink
                href={latestOrder ? `/profile/orders/${latestOrder.id}` : "/products"}
                label={latestOrder ? t("trackViewOrder") : td("exploreProductsCta")}
              />
            </TiltCard>
          </motion.div>

          {/* SDS library */}
          <motion.div variants={stagger} className="flex">
            <TiltCard max={9} radius="rounded-[24px]" className={OPS_CARD} data-ops-card="sds">
              <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-red-600 to-orange-500 text-white shadow-[0_14px_26px_-14px_rgba(220,38,38,.6)]">
                <FileText className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("sdsLibraryLabel")}</div>
              {/* Counted from the SDS catalog, not written into the copy. */}
              <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{td("sdsLibraryCount", { count: sdsCount })}</div>
              <OpsFooterLink href="/compliance/sds" label={t("sdsOpenLibrary")} />
            </TiltCard>
          </motion.div>

          {/* Browse products */}
          <motion.div variants={stagger} className="flex">
            <TiltCard max={9} radius="rounded-[24px]" className={OPS_CARD} data-ops-card="browse">
              <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-[0_14px_26px_-14px_rgba(5,150,105,.65)]">
                <LayoutGrid className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="mt-5 text-[17px] font-semibold tracking-[-0.03em]">{td("exploreProductsLabel")}</div>
              <div className="mt-1.5 text-[12.5px] text-slate-500 dark:text-ink-muted">{td("exploreProductsNote")}</div>
              <OpsFooterLink href="/products" label={td("exploreProductsCta")} />
            </TiltCard>
          </motion.div>
        </div>
      </RevealSection>

      {/* Popular cylinders — real recommended/featured products from Prisma */}
      <RevealSection className="pt-20">
        <motion.div variants={stagger} className="mb-5 flex items-baseline justify-between gap-5">
          <h2 className="text-[13px] tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("popularCylindersEyebrow")}</h2>
          <Link href="/products" className="text-[12.5px] font-semibold text-blue-700 dark:text-blue-400">
            {td("seeAll")}
          </Link>
        </motion.div>

        {/* Single-row carousel.
            `-mx-1 px-1` and `-mt-2 pt-2` widen the scroll box just enough
            that the cards' shadow and hover glare aren't shaved off by
            `overflow-x-auto`, while the matching padding puts the first
            card's edge back in line with the heading above it. `pb-6` leaves
            room under the row where a scrollbar would sit.

            `scroll-px-1` matches that horizontal padding: without it,
            mandatory snapping resolves against the border box and parks the
            row 4px in, pulling every card out of line with the heading. */}
        <div
          className="-mx-1 -mt-2 flex snap-x snap-mandatory scroll-px-1 gap-6 overflow-x-auto overscroll-x-contain px-1 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label={t("popularCylindersEyebrow")}
          data-popular-carousel
        >
          {products.map((p) => (
            <motion.div
              key={p.id}
              variants={stagger}
              // Exactly three across on desktop: gap-6 is 1.5rem, so three
              // cards and two gaps come to 3 × (33.3333% − 1rem) + 2 × 1.5rem.
              className="flex w-[85vw] shrink-0 snap-start md:w-[calc(50%-1rem)] lg:w-[calc(33.3333%-1rem)] [&>*]:w-full"
            >
              <ProductCard
                product={p}
                inCart={added === p.id}
                onAddToCart={addToCart}
                onNotify={setNotifyFor}
                imageSizes="(max-width: 768px) 85vw, (max-width: 1024px) 50vw, 400px"
                animateIn={false}
              />
            </motion.div>
          ))}
        </div>
      </RevealSection>

      <StockNotifyModal
        isOpen={notifyFor !== null}
        onClose={() => setNotifyFor(null)}
        productId={notifyFor?.id ?? ""}
        productName={notifyFor?.name ?? ""}
      />
    </main>
  );
}
