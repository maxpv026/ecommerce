"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Award,
  Check,
  ChevronDown,
  ChevronLeft,
  FlaskConical,
  Minus,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { FREE_FREIGHT_THRESHOLD, calculateCartTotals } from "@/lib/cart";
import { useCartStore, type CartLine } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { auditCart, type CartAuditResult, type CartAuditSuggestion } from "@/lib/actions/cartAudit";
import type { StoreProduct } from "@/lib/data";
import { useCartCount } from "./CartCountProvider";

const SWIPE_THRESHOLD = 120;

const tintFor = (p?: StoreProduct) =>
  p?.gwpClass === "A2L" ? "#34d399" : p?.gwpClass === "A1" ? "#22d3ee" : "#60a5fa";

const SUGGEST_ICON: Record<string, typeof Wrench> = {
  equipment: Wrench,
  recovery: RefreshCcw,
  cylinders: FlaskConical,
  blends: FlaskConical,
};

type AuditPhase = "idle" | "thinking" | "compliant" | "optimised" | "unavailable";

interface MobileCartLayoutProps {
  products: StoreProduct[];
  onCheckout: () => void;
}

/** One swipeable cart line: red action lane behind a left-draggable card. */
function SwipeLine({
  item,
  product,
  index,
  staggered,
  t,
  eur,
  onRemove,
  onInc,
  onDec,
}: {
  item: CartLine;
  product?: StoreProduct;
  index: number;
  staggered: boolean;
  t: ReturnType<typeof useTranslations<"Cart">>;
  eur: (v: number) => string;
  onRemove: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  const x = useMotionValue(0);
  const laneOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0.4]);
  const [past, setPast] = useState(false);
  const tint = tintFor(product);

  const chips: Array<{ label: string; tone: "warn" | "ok" | "muted" }> = [];
  if (product?.gwpClass === "A2L") chips.push({ label: "A2L", tone: "warn" });
  else if (product?.gwpClass === "A1") chips.push({ label: "A1", tone: "ok" });
  if (product && product.gwp !== null) chips.push({ label: `GWP ${product.gwp}`, tone: "muted" });
  if (product && (product.category === "equipment" || product.category === "recovery"))
    chips.push({ label: product.type, tone: "muted" });

  const toneCls = {
    warn: "border-[rgba(245,158,11,.32)] bg-[rgba(245,158,11,.15)] text-[#b45309] dark:text-[#fbbf24]",
    ok: "border-[rgba(16,185,129,.28)] bg-[rgba(16,185,129,.14)] text-[#047857] dark:text-[#34d399]",
    muted: "border-slate-900/[.07] bg-slate-100 text-slate-500 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted",
  } as const;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_THRESHOLD) onRemove();
    setPast(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{
        opacity: 1, y: 0, scale: 1,
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: staggered ? index * 0.05 : 0 },
      }}
      exit={{ opacity: 0, x: "-110%", scale: 0.94, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
      data-cart-line={item.sku}
      className="relative w-full overflow-hidden rounded-[22px] bg-red-500/15"
    >
      {/* action lane revealed by the drag */}
      <motion.div
        style={{ opacity: laneOpacity }}
        className="absolute inset-0 flex flex-col items-end justify-center gap-[5px] bg-red-500/50 pr-[22px]"
      >
        <Trash2 size={20} strokeWidth={2} className="text-white" />
        <span className="text-[11px] font-semibold tracking-[.04em] text-white" data-lane-label>
          {past ? t("laneRelease") : t("laneRemove")}
        </span>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -180, right: 0 }}
        dragElastic={0.04}
        dragSnapToOrigin
        style={{ x, touchAction: "pan-y" }}
        onDrag={(_, info) => setPast(info.offset.x <= -SWIPE_THRESHOLD)}
        onDragEnd={onDragEnd}
        className={`relative flex w-full cursor-grab gap-3.5 rounded-[22px] border p-3.5 backdrop-blur-xl backdrop-saturate-150 active:cursor-grabbing ${
          past ? "border-red-500/50" : "border-slate-900/[.08] dark:border-hairline"
        } bg-white/95 dark:bg-[#141518]/95`}
      >
        <span
          className="pointer-events-none absolute -top-[120%] right-[-16%] h-60 w-60 rounded-full opacity-[.14] blur-[58px]"
          style={{ background: `radial-gradient(circle,${tint},transparent 68%)` }}
        />

        <div className="relative flex h-[84px] w-[84px] flex-none items-center justify-center overflow-hidden rounded-2xl border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(127,127,140,.06)_0_1px,transparent_1px_9px)]" />
          <div className="relative h-[60px] w-8 rounded-t-[17px] rounded-b-[4px] border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-.026em]">{item.name}</div>
          <div className="mt-[3px] truncate text-[11px] text-slate-400 dark:text-ink-muted">
            {item.variant} · {item.sku}
          </div>

          {chips.length > 0 && (
            <div className="mt-[9px] flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={`inline-flex items-center rounded-full border px-[9px] py-[3px] text-[10px] font-semibold ${toneCls[chip.tone]}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-[13px] flex items-center justify-between gap-2.5">
            <div className="flex h-10 items-center gap-px rounded-full border border-slate-900/[.08] bg-slate-100 px-1 dark:border-hairline dark:bg-surface-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={onDec}
                aria-label={t("decreaseQtyAria", { item: item.name })}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-slate-500 dark:text-ink-muted"
              >
                <Minus size={14} strokeWidth={2} />
              </motion.button>
              <span className="min-w-[26px] text-center text-[13.5px] font-semibold tabular-nums" data-line-qty>
                {item.qty}
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={onInc}
                aria-label={t("increaseQtyAria", { item: item.name })}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-slate-500 dark:text-ink-muted"
              >
                <Plus size={14} strokeWidth={2} />
              </motion.button>
            </div>
            <span className="text-right">
              <span className="block text-base font-semibold tracking-[-.035em]" data-line-total>
                {eur(item.price * item.qty)}
              </span>
              <span className="mt-px block text-[10.5px] text-slate-400 dark:text-ink-muted">
                {eur(item.price)} {t("eachSuffix")}
              </span>
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MobileCartLayout({ products, onCheckout }: MobileCartLayoutProps) {
  const t = useTranslations("Cart");
  const format = useFormatter();
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });
  const { setCartCount } = useCartCount();

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];
  const empty = shownItems.length === 0;

  const [auditPhase, setAuditPhase] = useState<AuditPhase>("idle");
  const [auditOpen, setAuditOpen] = useState(false);
  const [findings, setFindings] = useState<Array<{ tone: "ok" | "warn"; text: string }>>([]);
  const [suggestions, setSuggestions] = useState<CartAuditSuggestion[]>([]);
  const [recsDismissed, setRecsDismissed] = useState(false);

  const [initialStagger, setInitialStagger] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setInitialStagger(false), 900);
    return () => clearTimeout(id);
  }, []);

  const bySku = new Map(products.map((p) => [p.sku, p]));
  const { count, subtotal, shipping, vat, total } = calculateCartTotals(shownItems);
  const freeFreight = subtotal >= FREE_FREIGHT_THRESHOLD && subtotal > 0;

  // Keep the persistent global nav badge in sync with the real store.
  useEffect(() => {
    setCartCount(count);
  }, [count, setCartCount]);

  const runAudit = async () => {
    if (empty || auditPhase === "thinking") return;
    setAuditPhase("thinking");
    setAuditOpen(true);
    setRecsDismissed(false);
    let result: CartAuditResult;
    try {
      result = await auditCart(shownItems.map((i) => ({ sku: i.sku, qty: i.qty })));
    } catch {
      result = { ok: false, code: "UNAVAILABLE" };
    }
    if (!result.ok) {
      setFindings([]);
      setSuggestions([]);
      setAuditPhase("unavailable");
      return;
    }
    setFindings(result.findings);
    setSuggestions(result.suggestions);
    setAuditPhase(result.verdict === "optimisable" ? "optimised" : "compliant");
  };

  const thinking = auditPhase === "thinking";
  const optimised = auditPhase === "optimised";
  const audited = auditPhase === "compliant" || auditPhase === "optimised";
  const visibleRecs = optimised && !recsDismissed ? suggestions : [];

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-white dark:bg-canvas">
      {/* ambient orb field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[150px] right-[-34%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-30 blur-[90px] [animation:hc-breathe_9s_ease-in-out_infinite]" />
        <div className="absolute left-[-32%] top-[280px] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_66%)] opacity-[.24] blur-[90px] [animation:hc-breathe_12s_ease-in-out_infinite_reverse]" />
        <div className="absolute -bottom-[190px] left-[-10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-[.28] blur-[84px] [animation:hc-breathe_11s_ease-in-out_infinite]" />
      </div>

      {/* sticky glass header */}
      <div className="sticky top-0 z-[80] border-b border-slate-900/[.06] bg-white/85 px-[18px] pb-3 pt-3 backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-[#090A0C]/[.82]">
        <div className="flex items-center gap-2.5">
          <Link
            href="/products"
            aria-label={t("backAria")}
            className="-ml-[11px] flex h-11 w-11 flex-none items-center justify-center rounded-full transition-colors hover:bg-slate-900/[.06] dark:hover:bg-white/10"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </Link>
          <span className="min-w-0 flex-1 text-center">
            <span className="block text-[16.5px] font-semibold tracking-[-.03em]">{t("yourCart")}</span>
            <span className="mt-0.5 block text-[11.5px] text-slate-400 dark:text-ink-muted">
              {empty ? t("noItemsYet") : t("itemCountShort", { count })}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              clear();
              setAuditPhase("idle");
              setFindings([]);
              setSuggestions([]);
            }}
            className={`h-11 min-w-11 px-2 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-900 dark:text-ink-muted dark:hover:text-slate-50 ${
              empty ? "invisible" : ""
            }`}
          >
            {t("clear")}
          </button>
        </div>
      </div>

      <div className="relative pb-[calc(210px+env(safe-area-inset-bottom))]">
        {/* real freight badge in the design's tier slot */}
        {!empty && (
          <div className="px-[18px] pt-3.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-700/[.32] bg-blue-50 py-2 pl-[11px] pr-3.5 text-[11.5px] font-semibold text-blue-700 dark:bg-blue-600/[.16] dark:text-blue-400">
              <Award size={14} strokeWidth={2} />
              {freeFreight ? t("badgeFreightFree") : t("badgeFreightGoal", { amount: eur(FREE_FREIGHT_THRESHOLD) })}
            </span>
          </div>
        )}

        {/* empty state */}
        {empty ? (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mx-[18px] mt-6 rounded-[26px] border border-dashed border-slate-900/[.14] bg-white/70 px-[22px] py-[62px] text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass"
          >
            <span className="relative inline-flex h-[88px] w-[88px] items-center justify-center rounded-[30px] border border-slate-900/[.07] bg-slate-100 [animation:hc-bob_6s_ease-in-out_infinite] dark:border-hairline dark:bg-surface-3">
              <span className="pointer-events-none absolute -inset-7 rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_68%)] opacity-50 blur-[32px] [animation:hc-breathe_5s_ease-in-out_infinite]" />
              <ShoppingCart size={34} strokeWidth={1.7} className="relative text-blue-700 dark:text-blue-400" />
            </span>
            <div className="mt-6 text-[21px] font-semibold tracking-[-.04em]">{t("cartEmptyShort")}</div>
            <p className="mx-auto mb-6 mt-[11px] max-w-[270px] text-[13px] leading-[1.6] text-slate-500 dark:text-ink-muted">
              {t("emptyBodyShort")}
            </p>
            <Link
              href="/products"
              className="inline-flex h-[50px] items-center justify-center gap-[9px] rounded-2xl bg-blue-700 px-6 text-sm font-semibold tracking-[-.02em] text-white shadow-[0_20px_42px_-18px_#2563eb,0_0_28px_-10px_#2563eb] transition-colors hover:bg-blue-800"
            >
              {t("exploreProducts")}
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          </motion.div>
        ) : (
          <>
            {/* swipeable lines */}
            <div className="flex flex-col gap-3 px-[18px] pt-4">
              <AnimatePresence mode="popLayout">
                {shownItems.map((item, idx) => (
                  <SwipeLine
                    key={item.sku}
                    item={item}
                    product={bySku.get(item.sku)}
                    index={idx}
                    staggered={initialStagger}
                    t={t}
                    eur={eur}
                    onRemove={() => removeItem(item.sku)}
                    onInc={() => increment(item.sku)}
                    onDec={() => decrement(item.sku)}
                  />
                ))}
              </AnimatePresence>
              <div className="flex items-center justify-center gap-[7px] pt-1 text-[10.5px] text-slate-400/80 dark:text-ink-muted/70">
                <ChevronLeft size={12} strokeWidth={2} />
                {t("swipeHint")}
              </div>
            </div>

            {/* AI recommended add-ons — populated only by a real audit run */}
            <AnimatePresence>
              {visibleRecs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  data-ai-recs
                  className="mt-[26px]"
                >
                  <div className="flex items-baseline justify-between gap-3 px-[18px] pb-3">
                    <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                      {t("recKicker")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecsDismissed(true)}
                      className="text-[11.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-ink-muted dark:hover:text-slate-300"
                    >
                      {t("dismiss")}
                    </button>
                  </div>
                  <div className="scrollbar-slim flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visibleRecs.map((s) => {
                      const product = bySku.get(s.sku);
                      if (!product) return null;
                      const Icon = SUGGEST_ICON[product.category] ?? Sparkles;
                      const inCart = shownItems.some((i) => i.sku === s.sku);
                      return (
                        <div
                          key={s.sku}
                          data-suggestion={s.sku}
                          className="flex w-52 flex-none snap-start flex-col rounded-[20px] border border-[rgba(124,58,237,.3)] bg-white/70 p-[15px] shadow-[0_0_24px_-14px_rgba(124,58,237,.6)] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
                        >
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[rgba(167,139,250,.34)] bg-[rgba(124,58,237,.18)]">
                            <Icon size={16} strokeWidth={2} className="text-[#6d28d9] dark:text-[#c4b5fd]" />
                          </span>
                          <span className="mt-3 block text-[12.5px] font-semibold leading-[1.3] tracking-[-.02em]">
                            {product.name}
                          </span>
                          <span className="mt-[5px] block text-[10.5px] leading-[1.5] text-slate-500 dark:text-ink-muted">
                            {s.reason}
                          </span>
                          <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                            <span className="text-[13px] font-semibold tracking-[-.025em]">{eur(product.price)}</span>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.94 }}
                              disabled={inCart}
                              onClick={() =>
                                addItem(
                                  { sku: product.sku, name: product.name, variant: product.weightLabel, price: product.price },
                                  1
                                )
                              }
                              className={`min-h-[34px] flex-none rounded-[11px] px-3.5 text-xs font-semibold tracking-[-.01em] transition-colors ${
                                inCart
                                  ? "bg-green-600 text-white"
                                  : "border border-slate-900/[.16] text-slate-900 dark:border-hairline-strong dark:text-slate-50"
                              }`}
                            >
                              {inCart ? t("added") : t("add")}
                            </motion.button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* summary */}
            <div className="px-[18px] pt-[22px]">
              <div className="rounded-[22px] border border-slate-900/[.08] bg-white/70 p-[18px] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline dark:bg-glass">
                <div className="flex items-baseline justify-between gap-3 pb-2.5">
                  <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{t("subtotal")}</span>
                  <span className="text-[13px] font-semibold tracking-[-.02em] tabular-nums" data-summary-subtotal>
                    {eur(subtotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 pb-2.5">
                  <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{t("freightAdr")}</span>
                  <span
                    className={`text-[13px] font-semibold tracking-[-.02em] ${
                      shipping === 0 ? "text-[#047857] dark:text-[#34d399]" : ""
                    }`}
                  >
                    {shipping === 0 ? t("freightIncluded") : eur(shipping)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-slate-500 dark:text-ink-muted">{t("vat20")}</span>
                  <span className="text-[13px] font-semibold tracking-[-.02em] tabular-nums">{eur(vat)}</span>
                </div>
              </div>
            </div>

            {/* compact collapsible audit */}
            <div className="px-[18px] pt-3.5" data-cart-audit>
              <div
                className="overflow-hidden rounded-[22px] p-[1.5px]"
                style={
                  thinking
                    ? {
                        background: "linear-gradient(90deg,#2563eb,#22d3ee,#7c3aed,#2563eb)",
                        backgroundSize: "300% 100%",
                        animation: "hc-sweep 2.4s linear infinite",
                      }
                    : {
                        background: optimised
                          ? "rgba(124,58,237,.4)"
                          : audited
                            ? "rgba(16,185,129,.32)"
                            : "var(--hc-cat-border, rgba(15,23,42,.08))",
                      }
                }
              >
                <div className="rounded-[20.5px] bg-white/95 backdrop-blur-xl backdrop-saturate-150 dark:bg-[#141518]/95">
                  <button
                    type="button"
                    onClick={() => setAuditOpen((v) => !v)}
                    data-audit-toggle
                    className="flex min-h-11 w-full items-center gap-3 p-[15px] text-left"
                  >
                    <motion.span
                      animate={thinking ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                      transition={thinking ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                      className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_12px_24px_-12px_rgba(37,99,235,.8)]"
                    >
                      <Sparkles size={18} strokeWidth={2} className="text-white" />
                    </motion.span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-[5px] block text-[9.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                        {t("auditKickerShort")}
                      </span>
                      {thinking ? (
                        <span className="flex items-center gap-[5px]">
                          {[0, 0.16, 0.32].map((d) => (
                            <span
                              key={d}
                              className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400"
                              style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                            />
                          ))}
                          <span className="ml-1 text-[11.5px] text-slate-400 dark:text-ink-muted">
                            {t("auditThinkingNote")}
                          </span>
                        </span>
                      ) : audited ? (
                        <span
                          data-audit-pill
                          className={`inline-flex items-center gap-[7px] rounded-full border py-[5px] pl-2 pr-[11px] text-[11px] font-semibold ${
                            optimised
                              ? "border-[rgba(167,139,250,.38)] bg-[rgba(124,58,237,.18)] text-[#6d28d9] shadow-[0_0_18px_-6px_#7c3aed] dark:text-[#c4b5fd]"
                              : "border-[rgba(16,185,129,.32)] bg-[rgba(16,185,129,.15)] text-[#047857] shadow-[0_0_18px_-6px_#34d399] dark:text-[#34d399]"
                          }`}
                        >
                          <span
                            className="h-[5px] w-[5px] flex-none rounded-full"
                            style={{
                              background: optimised ? "#a78bfa" : "#34d399",
                              boxShadow: `0 0 7px 1px ${optimised ? "#a78bfa" : "#34d399"}`,
                            }}
                          />
                          {optimised ? t("auditPillOptimised", { count: suggestions.length }) : t("auditPillVerified")}
                        </span>
                      ) : (
                        <span className="block text-[11.5px] leading-[1.4] text-slate-600 dark:text-slate-300">
                          {auditPhase === "unavailable" ? t("auditUnavailable") : t("auditTitleIdle")}
                        </span>
                      )}
                    </span>
                    <motion.span animate={{ rotate: auditOpen ? 180 : 0 }} transition={{ duration: 0.3 }} className="flex flex-none">
                      <ChevronDown size={15} strokeWidth={2} className="text-slate-400 dark:text-ink-muted" />
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {auditOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        {audited && findings.length > 0 && (
                          <div className="flex flex-col gap-[9px] px-[15px] pb-1" data-audit-findings>
                            {findings.map((f) => (
                              <span key={f.text} className="flex items-start gap-2">
                                {f.tone === "warn" ? (
                                  <TriangleAlert size={13} strokeWidth={2} className="mt-0.5 flex-none text-[#b45309] dark:text-[#fbbf24]" />
                                ) : (
                                  <Check size={13} strokeWidth={2.4} className="mt-0.5 flex-none text-[#047857] dark:text-[#34d399]" />
                                )}
                                <span className="min-w-0 flex-1 text-[11.5px] leading-[1.55] text-slate-600 dark:text-ink-muted">
                                  {f.text}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={runAudit}
                          disabled={thinking}
                          data-audit-run
                          className={`mx-[15px] mb-[15px] mt-[13px] flex h-11 w-[calc(100%-30px)] items-center justify-center gap-2 rounded-[14px] bg-slate-100 text-[12.5px] font-semibold tracking-[-.015em] transition-colors dark:bg-white/[.07] ${
                            thinking ? "opacity-70" : ""
                          }`}
                        >
                          <Sparkles size={14} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                          {thinking ? t("auditAnalysing") : audited ? t("auditRerun") : t("auditRun")}
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* sticky total bar above the global bottom nav */}
      {!empty && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-0 z-[90] w-full border-t border-slate-900/[.08] bg-white/90 px-[18px] pb-3.5 pt-3.5 shadow-[0_-18px_44px_-26px_rgba(0,0,0,.5)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#141518]/90">
          <div className="flex items-center gap-3.5">
            <span className="min-w-0">
              <span className="block text-[10.5px] tracking-[.07em] text-slate-400 dark:text-ink-muted">
                {t("total").toUpperCase()}
              </span>
              <span className="mt-[3px] block text-[25px] font-semibold tracking-[-.042em] tabular-nums" data-summary-total>
                {eur(total)}
              </span>
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onCheckout}
              data-checkout-cta
              className="ml-auto flex h-[54px] flex-none items-center justify-center gap-[9px] rounded-[17px] bg-blue-700 px-[26px] text-[15px] font-semibold tracking-[-.02em] text-white shadow-[0_20px_42px_-14px_#2563eb,0_0_32px_-10px_#2563eb] transition-colors hover:bg-blue-800"
            >
              {t("checkout")}
              <ArrowRight size={17} strokeWidth={2} />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
