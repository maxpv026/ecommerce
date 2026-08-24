"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Award,
  Check,
  FlaskConical,
  Lock,
  Minus,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
  TriangleAlert,
  Truck,
  Wrench,
} from "lucide-react";
import Header from "./Header";
import AuthModal from "./AuthModal";
import MobileCartLayout from "./MobileCartLayout";
import { FREE_FREIGHT_THRESHOLD, calculateCartTotals } from "@/lib/cart";
import { useCartStore } from "@/lib/store/cart";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { auditCart, type CartAuditResult, type CartAuditSuggestion } from "@/lib/actions/cartAudit";
import type { StoreProduct } from "@/lib/data";

const ACCENT = "#1d4ed8";

// Line tint mirrors the PDP brand mapping: A2L emerald, A1 cyan, rest blue.
const tintFor = (p?: StoreProduct) =>
  p?.gwpClass === "A2L" ? "#34d399" : p?.gwpClass === "A1" ? "#22d3ee" : "#60a5fa";

const SUGGEST_ICON: Record<string, typeof Wrench> = {
  equipment: Wrench,
  recovery: RefreshCcw,
  cylinders: FlaskConical,
  blends: FlaskConical,
};

type AuditPhase = "idle" | "thinking" | "compliant" | "optimised" | "unavailable";

interface CartPageProps {
  products: StoreProduct[];
}

export default function CartPage({ products }: CartPageProps) {
  const t = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const { status } = useSession();
  const [query, setQuery] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [trashHover, setTrashHover] = useState<string | null>(null);

  const [auditPhase, setAuditPhase] = useState<AuditPhase>("idle");
  const [findings, setFindings] = useState<Array<{ tone: "ok" | "warn"; text: string }>>([]);
  const [suggestions, setSuggestions] = useState<CartAuditSuggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  // The cart is rehydrated from localStorage on the client — until then,
  // render the server's empty-cart markup to keep hydration clean.
  const hydrated = useHydrated();
  const shownItems = hydrated ? items : [];
  const empty = shownItems.length === 0;

  // Entrance stagger applies to the first paint only; lines added later
  // (AI suggestions) rise immediately.
  const [initialStagger, setInitialStagger] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setInitialStagger(false), 900);
    return () => clearTimeout(id);
  }, []);

  const bySku = new Map(products.map((p) => [p.sku, p]));
  const eur = (value: number) => format.number(value, { style: "currency", currency: "EUR" });

  const { count, subtotal, shipping, vat, total } = calculateCartTotals(shownItems);
  const freeFreight = subtotal >= FREE_FREIGHT_THRESHOLD && subtotal > 0;

  const runAudit = async () => {
    if (empty || auditPhase === "thinking") return;
    setAuditPhase("thinking");
    setSuggestionsDismissed(false);
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

  const addSuggestion = (sku: string) => {
    const product = bySku.get(sku);
    if (!product) return;
    addItem({ sku: product.sku, name: product.name, variant: product.weightLabel, price: product.price }, 1);
  };

  const goToCheckout = () => {
    if (empty) return;
    if (status === "authenticated") {
      router.push("/checkout");
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const thinking = auditPhase === "thinking";
  const optimised = auditPhase === "optimised";
  const audited = auditPhase === "compliant" || auditPhase === "optimised";
  const visibleSuggestions = optimised && !suggestionsDismissed ? suggestions : [];

  const tagChips = (product?: StoreProduct) => {
    if (!product) return [];
    const chips: Array<{ label: string; tone: "warn" | "ok" | "muted" }> = [];
    if (product.gwpClass === "A2L") chips.push({ label: "A2L", tone: "warn" });
    else if (product.gwpClass === "A1") chips.push({ label: "A1", tone: "ok" });
    if (product.gwp !== null) chips.push({ label: `GWP ${product.gwp}`, tone: "muted" });
    if (product.category === "equipment" || product.category === "recovery")
      chips.push({ label: product.type, tone: "muted" });
    return chips;
  };

  const toneCls = {
    warn: "border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.14)] text-[#b45309] dark:text-[#fbbf24]",
    ok: "border-[rgba(16,185,129,.26)] bg-[rgba(16,185,129,.13)] text-[#047857] dark:text-[#34d399]",
    muted: "border-slate-900/[.07] bg-slate-100 text-slate-600 dark:border-hairline dark:bg-surface-3 dark:text-ink-muted",
  } as const;

  return (
    <div className="flex-1 bg-white dark:bg-canvas">
      <div className="hidden md:block">
        <Header query={query} onQueryChange={setQuery} onSignInClick={() => setIsAuthModalOpen(true)} />

        <div className="relative overflow-x-clip">
          {/* Ambient glow field from the design: cyan / violet / blue orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-[220px] right-[-8%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_66%)] opacity-[.26] blur-[120px] [animation:hc-breathe_9s_ease-in-out_infinite]" />
            <div className="absolute left-[-10%] top-[180px] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,#7c3aed,rgba(124,58,237,0)_66%)] opacity-[.22] blur-[120px] [animation:hc-breathe_12s_ease-in-out_infinite_reverse]" />
            <div className="absolute -bottom-[180px] right-[6%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,#2563eb,rgba(37,99,235,0)_68%)] opacity-20 blur-[110px] [animation:hc-float_34s_ease-in-out_infinite]" />
          </div>

          <motion.main
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto max-w-[1320px] px-8 pb-[120px] pt-11"
          >
            {/* head */}
            <div className="mb-[34px] flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="mb-3 text-xs tracking-[.09em] text-slate-400 dark:text-ink-muted">{t("eyebrow")}</div>
                <h1 className="m-0 text-[40px] font-semibold leading-[1.05] tracking-[-.045em]">
                  {empty ? t("headEmpty") : t("yourCart")}
                </h1>
                <p className="mt-3 text-[14.5px] leading-[1.6] text-slate-600 dark:text-ink-muted">
                  {empty ? t("sublineEmpty") : t("sublineCount", { count })}
                </p>
              </div>
              <span className="inline-flex flex-none items-center gap-2 rounded-full border border-blue-700/[.28] bg-blue-50 py-[9px] pl-3 pr-[15px] text-xs font-semibold text-blue-700 dark:bg-blue-600/[.18] dark:text-blue-400">
                <Award size={15} strokeWidth={2} />
                {freeFreight ? t("badgeFreightFree") : t("badgeFreightGoal", { amount: eur(FREE_FREIGHT_THRESHOLD) })}
              </span>
            </div>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
              {/* ─── list column ─── */}
              <div className="min-w-0 lg:col-span-7">
                {empty ? (
                  <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="rounded-[28px] border border-dashed border-slate-900/[.14] bg-white/70 px-7 py-[72px] text-center backdrop-blur-xl dark:border-hairline-strong dark:bg-glass"
                  >
                    <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-[32px] border border-slate-900/[.07] bg-slate-100 [animation:hc-bob_6s_ease-in-out_infinite] dark:border-hairline dark:bg-surface-3">
                      <span className="pointer-events-none absolute -inset-[30px] rounded-full bg-[radial-gradient(circle,#22d3ee,rgba(34,211,238,0)_68%)] opacity-50 blur-[34px] [animation:hc-breathe_5s_ease-in-out_infinite]" />
                      <ShoppingCart size={38} strokeWidth={1.7} className="relative text-blue-700 dark:text-blue-400" />
                    </span>
                    <div className="mt-[26px] text-[23px] font-semibold tracking-[-.04em]">{t("cartEmptyShort")}</div>
                    <p className="mx-auto mb-[26px] mt-3 max-w-[340px] text-[13.5px] leading-[1.62] text-slate-600 dark:text-ink-muted">
                      {t("emptyBody")}
                    </p>
                    <Link
                      href="/products"
                      className="inline-flex h-[50px] items-center justify-center gap-2.5 rounded-2xl bg-blue-700 px-[26px] text-[14.5px] font-semibold tracking-[-.02em] text-white shadow-[0_22px_46px_-18px_#1d4ed8,0_0_30px_-10px_#1d4ed8] transition-colors hover:bg-blue-800"
                    >
                      {t("exploreProducts")}
                      <ArrowRight size={16} strokeWidth={2} />
                    </Link>
                  </motion.div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    <AnimatePresence mode="popLayout">
                      {shownItems.map((item, idx) => {
                        const product = bySku.get(item.sku);
                        const tint = tintFor(product);
                        const on = hovered === item.sku;
                        const trashOn = trashHover === item.sku;
                        return (
                          <motion.div
                            key={item.sku}
                            layout
                            initial={{ opacity: 0, y: 18, scale: 0.97 }}
                            animate={{
                              opacity: 1, y: 0, scale: 1,
                              transition: {
                                duration: 0.55,
                                ease: [0.16, 1, 0.3, 1],
                                delay: initialStagger ? idx * 0.06 : 0,
                              },
                            }}
                            exit={{ opacity: 0, x: 38, scale: 0.94, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
                            data-cart-line={item.sku}
                            onMouseEnter={() => setHovered(item.sku)}
                            onMouseLeave={() => setHovered(null)}
                            whileHover={{ scale: 1.006 }}
                            className="relative flex w-full gap-[18px] overflow-hidden rounded-3xl border bg-white/70 p-[18px] backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 dark:bg-glass"
                            style={{
                              borderColor: on ? "rgba(96,165,250,.44)" : "var(--hc-cat-border, rgba(15,23,42,.07))",
                              boxShadow: on
                                ? "0 38px 76px -44px rgba(2,4,10,.62), 0 0 26px -8px rgba(59,130,246,.44)"
                                : "0 16px 40px -36px rgba(2,4,10,.5)",
                            }}
                          >
                            {/* per-line tint aura */}
                            <span
                              className="pointer-events-none absolute -top-[120%] right-[-14%] h-[300px] w-[300px] rounded-full blur-[66px] transition-opacity duration-300"
                              style={{ background: `radial-gradient(circle,${tint},transparent 68%)`, opacity: on ? 0.24 : 0.09 }}
                            />

                            {/* product tile */}
                            <div className="relative flex h-[104px] w-[104px] flex-none items-center justify-center overflow-hidden rounded-[18px] border border-slate-900/[.07] bg-slate-100 dark:border-hairline dark:bg-surface-3">
                              <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(127,127,140,.07)_0_1px,transparent_1px_9px)]" />
                              <div className="relative h-[72px] w-[38px] rounded-t-[20px] rounded-b-[5px] border border-dashed border-slate-900/[.22] bg-[linear-gradient(118deg,rgba(255,255,255,.96),rgba(241,245,249,.7))] dark:border-white/[.26] dark:bg-[linear-gradient(118deg,rgba(255,255,255,.1),rgba(255,255,255,.03))]" />
                            </div>

                            <div className="relative min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3.5">
                                <div className="min-w-0">
                                  <div className="text-[15px] font-semibold tracking-[-.028em]">{item.name}</div>
                                  <div className="mt-1 text-[11.5px] text-slate-400 dark:text-ink-muted">
                                    {item.variant} · {item.sku}
                                  </div>
                                </div>
                                <motion.button
                                  type="button"
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => removeItem(item.sku)}
                                  onMouseEnter={() => setTrashHover(item.sku)}
                                  onMouseLeave={() => setTrashHover(null)}
                                  aria-label={t("removeItemAria", { item: item.name })}
                                  className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] transition-colors ${
                                    trashOn ? "bg-red-500/[.14] text-red-500" : "text-slate-400 dark:text-ink-muted"
                                  }`}
                                >
                                  <Trash2 size={15} strokeWidth={2} />
                                </motion.button>
                              </div>

                              {tagChips(product).length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-[7px]">
                                  {tagChips(product).map((chip) => (
                                    <span
                                      key={chip.label}
                                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${toneCls[chip.tone]}`}
                                    >
                                      {chip.label}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="mt-4 flex flex-wrap items-end justify-between gap-3.5">
                                <div className="flex h-[42px] items-center gap-0.5 rounded-[14px] border border-slate-900/[.07] bg-slate-100 px-1 dark:border-hairline dark:bg-surface-3">
                                  <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.12 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => decrement(item.sku)}
                                    aria-label={t("decreaseQtyAria", { item: item.name })}
                                    className="flex h-9 w-[34px] items-center justify-center rounded-[11px] text-slate-600 dark:text-ink-muted"
                                  >
                                    <Minus size={14} strokeWidth={2} />
                                  </motion.button>
                                  <span className="min-w-[30px] text-center text-sm font-semibold" data-line-qty>
                                    {item.qty}
                                  </span>
                                  <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.12 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => increment(item.sku)}
                                    aria-label={t("increaseQtyAria", { item: item.name })}
                                    className="flex h-9 w-[34px] items-center justify-center rounded-[11px] text-slate-600 dark:text-ink-muted"
                                  >
                                    <Plus size={14} strokeWidth={2} />
                                  </motion.button>
                                </div>
                                <span className="text-right">
                                  <span className="block text-lg font-semibold tracking-[-.035em]" data-line-total>
                                    {eur(item.price * item.qty)}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-ink-muted">
                                    {eur(item.price)} {t("eachSuffix")}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>

                    {/* AI suggested additions — populated only by a real audit run */}
                    <AnimatePresence>
                      {visibleSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 18, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          data-ai-suggestions
                          className="mt-1.5 rounded-3xl border border-[rgba(124,58,237,.3)] bg-white/70 p-5 shadow-[0_0_30px_-14px_rgba(124,58,237,.5)] backdrop-blur-xl backdrop-saturate-150 dark:bg-glass"
                        >
                          <div className="mb-3.5 flex items-baseline justify-between gap-3.5">
                            <span className="text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                              {t("suggestKicker")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSuggestionsDismissed(true)}
                              className="text-[11.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-ink-muted dark:hover:text-slate-300"
                            >
                              {t("dismiss")}
                            </button>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {visibleSuggestions.map((s) => {
                              const product = bySku.get(s.sku);
                              if (!product) return null;
                              const Icon = SUGGEST_ICON[product.category] ?? Sparkles;
                              const inCart = shownItems.some((i) => i.sku === s.sku);
                              return (
                                <div
                                  key={s.sku}
                                  data-suggestion={s.sku}
                                  className="flex items-center gap-3 rounded-[18px] border border-slate-900/[.07] bg-slate-100 p-[13px] dark:border-hairline dark:bg-surface-3"
                                >
                                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[rgba(167,139,250,.34)] bg-[rgba(124,58,237,.16)]">
                                    <Icon size={16} strokeWidth={2} className="text-[#6d28d9] dark:text-[#c4b5fd]" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-semibold tracking-[-.02em]">{product.name}</span>
                                    <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-slate-400 dark:text-ink-muted">
                                      {s.reason}
                                    </span>
                                  </span>
                                  <span className="flex flex-none items-center gap-2.5">
                                    <span className="text-[13px] font-semibold tracking-[-.02em]">{eur(product.price)}</span>
                                    <motion.button
                                      type="button"
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => addSuggestion(s.sku)}
                                      disabled={inCart}
                                      className={`h-[34px] flex-none rounded-[11px] px-3.5 text-xs font-semibold tracking-[-.01em] transition-colors ${
                                        inCart
                                          ? "bg-green-600 text-white"
                                          : "border border-slate-900/[.14] text-slate-900 hover:bg-slate-900/[.04] dark:border-hairline-strong dark:text-slate-50 dark:hover:bg-white/[.06]"
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
                  </div>
                )}
              </div>

              {/* ─── summary column ─── */}
              <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[94px] lg:col-span-5">
                {/* AI compliance & compatibility audit */}
                <div
                  data-cart-audit
                  className="relative w-full overflow-hidden rounded-[26px] p-[1.5px]"
                  style={
                    thinking
                      ? {
                          background: `linear-gradient(90deg,${ACCENT},#22d3ee,#7c3aed,${ACCENT})`,
                          backgroundSize: "300% 100%",
                          animation: "hc-sweep 2.4s linear infinite",
                        }
                      : {
                          background: optimised
                            ? "rgba(124,58,237,.34)"
                            : audited
                              ? "rgba(16,185,129,.3)"
                              : "var(--hc-cat-border, rgba(15,23,42,.07))",
                        }
                  }
                >
                  <div className="relative rounded-[24.5px] bg-white/90 p-[22px] backdrop-blur-xl backdrop-saturate-150 dark:bg-[#141518]/90">
                    <div className="flex items-start gap-[13px]">
                      <motion.span
                        animate={thinking ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                        transition={thinking ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" } : undefined}
                        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,#2563eb,#7c3aed)] shadow-[0_14px_28px_-14px_rgba(37,99,235,.7)]"
                      >
                        <Sparkles size={19} strokeWidth={2} className="text-white" />
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1.5 block text-[10.5px] tracking-[.08em] text-slate-400 dark:text-ink-muted">
                          {t("auditKicker")}
                        </span>
                        <span className="block text-sm font-semibold leading-[1.35] tracking-[-.025em]" data-audit-title>
                          {empty
                            ? t("auditTitleEmpty")
                            : optimised
                              ? t("auditTitleOptimised", { count: suggestions.length })
                              : auditPhase === "compliant"
                                ? t("auditTitleCompliant")
                                : auditPhase === "unavailable"
                                  ? t("auditUnavailable")
                                  : t("auditTitleIdle")}
                        </span>
                      </span>
                    </div>

                    {/* verdict pill (only after a real run) */}
                    {audited && !empty && (
                      <div
                        className={`mt-4 inline-flex items-center gap-2 rounded-full border py-[7px] pl-2.5 pr-[13px] text-[11.5px] font-semibold ${
                          optimised
                            ? "border-[rgba(167,139,250,.36)] bg-[rgba(124,58,237,.16)] text-[#6d28d9] shadow-[0_0_20px_-6px_#7c3aed] dark:text-[#c4b5fd]"
                            : "border-[rgba(16,185,129,.3)] bg-[rgba(16,185,129,.14)] text-[#047857] shadow-[0_0_20px_-6px_#34d399] dark:text-[#34d399]"
                        }`}
                        data-audit-pill
                      >
                        <span
                          className="h-1.5 w-1.5 flex-none rounded-full"
                          style={{
                            background: optimised ? "#a78bfa" : "#34d399",
                            boxShadow: `0 0 8px 1px ${optimised ? "#a78bfa" : "#34d399"}`,
                          }}
                        />
                        {optimised ? t("auditPillOptimised", { count: suggestions.length }) : t("auditPillVerified")}
                      </div>
                    )}

                    {/* thinking dots */}
                    {thinking && (
                      <div className="mt-4 flex items-center gap-1.5">
                        {[0, 0.16, 0.32].map((d) => (
                          <span
                            key={d}
                            className="h-[5px] w-[5px] rounded-full bg-blue-700 dark:bg-blue-400"
                            style={{ animation: `hc-dots 1.2s ease-in-out ${d}s infinite` }}
                          />
                        ))}
                        <span className="ml-1 text-xs text-slate-400 dark:text-ink-muted">{t("auditThinkingNote")}</span>
                      </div>
                    )}

                    {/* findings from the live model run */}
                    {audited && findings.length > 0 && (
                      <div className="mt-4 flex flex-col gap-2.5" data-audit-findings>
                        {findings.map((f) => (
                          <span key={f.text} className="flex items-start gap-[9px]">
                            {f.tone === "warn" ? (
                              <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 flex-none text-[#b45309] dark:text-[#fbbf24]" />
                            ) : (
                              <Check size={14} strokeWidth={2.4} className="mt-0.5 flex-none text-[#047857] dark:text-[#34d399]" />
                            )}
                            <span className="min-w-0 flex-1 text-xs leading-[1.55] text-slate-600 dark:text-ink-muted">
                              {f.text}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {!empty && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={runAudit}
                        disabled={thinking}
                        data-audit-run
                        className={`mt-[18px] flex h-[46px] w-full items-center justify-center gap-[9px] rounded-[15px] bg-slate-100 text-[13px] font-semibold tracking-[-.015em] transition-colors hover:bg-slate-200 dark:bg-white/[.06] dark:hover:bg-white/10 ${
                          thinking ? "opacity-70" : ""
                        }`}
                      >
                        <Sparkles size={15} strokeWidth={2} className="text-blue-700 dark:text-blue-400" />
                        {thinking ? t("auditAnalysing") : audited ? t("auditRerun") : t("auditRun")}
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* order summary */}
                <div className="relative w-full overflow-hidden rounded-[28px] border border-slate-900/[.14] bg-white/70 p-[26px] shadow-[0_30px_70px_-46px_rgba(2,4,10,.6)] backdrop-blur-xl backdrop-saturate-150 dark:border-hairline-strong dark:bg-glass">
                  <h2 className="m-0 mb-5 text-[12.5px] font-semibold tracking-[.09em] text-slate-400 dark:text-ink-muted">
                    {t("orderSummary")}
                  </h2>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("subtotal")}</span>
                      <span className="text-[13.5px] font-semibold tracking-[-.02em]" data-summary-subtotal>
                        {eur(subtotal)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("freightAdr")}</span>
                      <span
                        className={`text-[13.5px] font-semibold tracking-[-.02em] ${
                          shipping === 0 && subtotal > 0 ? "text-[#047857] dark:text-[#34d399]" : ""
                        }`}
                      >
                        {shipping === 0 && subtotal > 0 ? t("freightIncluded") : eur(shipping)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3.5">
                      <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("vat20")}</span>
                      <span className="text-[13.5px] font-semibold tracking-[-.02em]">{eur(vat)}</span>
                    </div>
                  </div>

                  <div className="mt-[18px] flex items-end justify-between gap-3.5 border-t border-slate-900/[.08] pt-[18px] dark:border-hairline">
                    <span className="text-[13px] text-slate-600 dark:text-ink-muted">{t("total")}</span>
                    <span className="text-[30px] font-semibold tracking-[-.045em]" data-summary-total>
                      {eur(total)}
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    whileHover={empty ? undefined : { y: -1 }}
                    whileTap={empty ? undefined : { scale: 0.97 }}
                    disabled={empty}
                    onClick={goToCheckout}
                    data-checkout-cta
                    className="mt-[22px] flex h-14 w-full items-center justify-center gap-2.5 rounded-[18px] bg-blue-700 text-[15.5px] font-semibold tracking-[-.022em] text-white shadow-[0_20px_42px_-18px_#1d4ed8] transition-[background-color,box-shadow] duration-300 hover:bg-blue-800 hover:shadow-[0_28px_56px_-18px_#1d4ed8,0_0_36px_-8px_#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-blue-700 disabled:hover:shadow-[0_20px_42px_-18px_#1d4ed8]"
                  >
                    {t("proceedToCheckout")}
                    <ArrowRight size={17} strokeWidth={2} />
                  </motion.button>

                  {!empty && (
                    <button
                      type="button"
                      onClick={() => {
                        clear();
                        setAuditPhase("idle");
                        setFindings([]);
                        setSuggestions([]);
                      }}
                      className="mt-2.5 flex h-[46px] w-full items-center justify-center rounded-[15px] border border-slate-900/[.14] text-[13px] font-semibold tracking-[-.015em] text-slate-600 transition-colors hover:bg-slate-900/[.04] dark:border-hairline-strong dark:text-ink-muted dark:hover:bg-white/[.06]"
                    >
                      {t("clearCart")}
                    </button>
                  )}

                  <div className="mt-5 flex flex-col gap-[11px] border-t border-slate-900/[.08] pt-[18px] dark:border-hairline">
                    {[
                      { icon: FlaskConical, label: t("assuranceCoa") },
                      { icon: Truck, label: t("assuranceFreight") },
                      { icon: Lock, label: t("assuranceFgas") },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-[9px] text-[11.5px] text-slate-600 dark:text-ink-muted">
                        <Icon size={14} strokeWidth={2} className="flex-none text-blue-700 dark:text-blue-400" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.main>
        </div>
      </div>

      <div className="block md:hidden">
        <MobileCartLayout />
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} callbackUrl="/checkout" />
    </div>
  );
}
